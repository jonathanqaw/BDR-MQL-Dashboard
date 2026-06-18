import { NextRequest, NextResponse } from 'next/server'
import { put, get } from '@vercel/blob'
import {
  ingestCategory, upsertCategory, upsertPushed, appendSignals, addMoreFromSource, logActivity,
  isSourceConfigured, listSources, defaultSourceId,
  SIGNAL_CATEGORY_ORDER, EMPTY_STORE, type SignalStore, type SignalCategory, type OutboundSignal,
} from '@/lib/signals'

export const dynamic = 'force-dynamic'

const KEY = 'outbound-signals.json'

// Accept camelCase category aliases (per the documented add-more request shape)
// alongside the internal snake_case keys.
function normalizeCategory(c: any): SignalCategory | null {
  const map: Record<string, SignalCategory> = {
    jobPostings: 'job_postings', jobChanges: 'job_changes', newHires: 'new_hires',
    newEngLeaders: 'new_eng_leaders', newEngineeringLeaders: 'new_eng_leaders',
    job_postings: 'job_postings', job_changes: 'job_changes', new_hires: 'new_hires', new_eng_leaders: 'new_eng_leaders',
  }
  return (c && map[c]) || null
}

// Same-instance fallback when Vercel Blob isn't configured (local dev) or is
// briefly unavailable. In production Blob is the source of truth and shared
// across instances; this just keeps the store usable without it.
let memStore: SignalStore | null = null

// The external push (`action:'ingest'`) is how off-app sources (scheduled Claude
// job / Zapier / CSV) write to the store. It is FAIL-CLOSED: it is rejected
// unless OUTBOUND_INGEST_TOKEN is configured server-side AND the caller presents
// it as `Authorization: Bearer <token>`. No token configured ⇒ ingest disabled.
// (The UI never calls 'ingest' — it only reads, and 'refresh' runs in-app
// ingestion — so locking this down does not affect the dashboard.)
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
function ingestAuthError(req: NextRequest): { status: number; error: string } | null {
  const expected = process.env.OUTBOUND_INGEST_TOKEN
  if (!expected) return { status: 503, error: 'ingest disabled: OUTBOUND_INGEST_TOKEN is not configured' }
  const header = req.headers.get('authorization') || ''
  const prefix = 'Bearer '
  const presented = header.startsWith(prefix) ? header.slice(prefix.length) : ''
  if (!presented || !timingSafeEqual(presented, expected)) return { status: 401, error: 'unauthorized' }
  return null
}

// The Outbound Signals Store — shared across reps (the SF/source data is the
// same for everyone). Per-rep workflow state lives in rep-data, not here.
async function readStore(): Promise<SignalStore> {
  try {
    const r = await get(KEY, { access: 'private' })
    if (r && r.statusCode === 200 && r.stream) {
      const t = await new Response(r.stream).text()
      const parsed = t ? JSON.parse(t) : null
      if (parsed && Array.isArray(parsed.signals)) return parsed
    }
  } catch { /* fall through to in-memory */ }
  return memStore ? memStore : { ...EMPTY_STORE }
}

// Best-effort persistence. If Blob isn't configured (e.g. local dev with no
// token), ingestion still works in-memory and the response is returned anyway.
async function writeStore(store: SignalStore): Promise<boolean> {
  memStore = store // always keep the same-instance copy
  try {
    await put(KEY, JSON.stringify(store), { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true })
    return true
  } catch (e) { console.error('outbound-signals store write failed:', e); return false }
}

// GET — read the current store (instant; no ingestion).
export async function GET() {
  const store = await readStore()
  return NextResponse.json({ ...store, sources: listSources() })
}

// POST — mutate the store.
//  { action:'refresh', category?, source? }  → run ingestion (one or all categories), upsert, persist
//  { action:'ingest', source, signals:[...] } → external push (future Claude/Zapier/CSV), upsert, persist
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const action = body.action || 'refresh'
    let store = await readStore()

    if (action === 'refresh') {
      const sourceId: string = body.source || defaultSourceId()
      // Guard: a mock refresh must never overwrite real data that arrived via a
      // live source (Salesforce push / external ingest). Mock only seeds an
      // empty (or mock-only) store. So in the Phase 2a push model, the UI's
      // "Refresh" safely re-reads instead of clobbering pushed signals.
      if (sourceId === 'mock' && store.signals.some(s => s.source && s.source !== 'mock')) {
        return NextResponse.json({ ...store, sources: listSources(), persisted: true, skipped: 'mock-refresh-skipped-live-data-present' })
      }
      const cats: SignalCategory[] = body.category ? [body.category] : [...SIGNAL_CATEGORY_ORDER]
      for (const cat of cats) {
        const fresh = await ingestCategory(sourceId, cat)
        store = upsertCategory(store, sourceId, cat, fresh)
      }
      const persisted = await writeStore(store)
      return NextResponse.json({ ...store, sources: listSources(), persisted })
    }

    if (action === 'ingest') {
      const authErr = ingestAuthError(req)
      if (authErr) return NextResponse.json({ error: authErr.error }, { status: authErr.status })
      const sourceId: string = body.source || 'external'
      const rows: OutboundSignal[] = Array.isArray(body.signals) ? body.signals : []
      // mode:'append' adds net-new rows and skips dupes (the external "Add More"
      // push) — never replaces. replace:true wipes the whole store first (clean
      // full sync). Default upserts per category+source.
      if (body.mode === 'append') {
        const { store: ns, added, skipped } = appendSignals(store, sourceId, rows)
        store = logActivity(ns, { at: new Date().toISOString(), category: rows[0]?.category || '(mixed)', source: sourceId, added, skipped, message: added ? `Pushed ${added} (append)` : 'No new records' })
        const persisted = await writeStore(store)
        return NextResponse.json({ ...store, sources: listSources(), added, skipped, persisted })
      }
      const base = body.replace ? { ...EMPTY_STORE } : store
      store = upsertPushed(base, sourceId, rows)
      const persisted = await writeStore(store)
      return NextResponse.json({ ...store, sources: listSources(), persisted })
    }

    // add-more: append the freshest net-new records for ONE category from a
    // server-configured source (deep-scans past dupes). This pulls only from the
    // trusted source and appends deduped data, so it does not require the ingest
    // token. If the source isn't configured in-app (e.g. Salesforce creds not in
    // Vercel yet), it returns needsExternalPush so the UI can explain the
    // Claude/Zapier push path. Capped at 100/request.
    if (action === 'add-more') {
      const category = normalizeCategory(body.category)
      if (!category) return NextResponse.json({ error: 'valid category required', categories: SIGNAL_CATEGORY_ORDER }, { status: 400 })
      const sourceId: string = body.source || defaultSourceId()
      const limit = Math.max(1, Math.min(100, Number(body.limit) || 25))
      if (!isSourceConfigured(sourceId)) {
        const existingCount = store.signals.filter(s => s.category === category).length
        return NextResponse.json({
          ...store, sources: listSources(), ok: false, needsExternalPush: true, existingCount,
          message: `In-app Add More needs the “${sourceId}” source configured in Vercel (Salesforce credentials). Until then, new records are added via the authenticated Claude/Zapier push.`,
        })
      }
      const { store: ns, added, skipped, scanned } = await addMoreFromSource(store, sourceId, category, limit)
      store = logActivity(ns, {
        at: new Date().toISOString(), category, source: sourceId, added, skipped,
        message: added > 0 ? `Added ${added} ${category}${skipped ? ` · skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}` : ''}` : 'No new records found',
      })
      const persisted = await writeStore(store)
      return NextResponse.json({ ...store, sources: listSources(), ok: true, added, skipped, scanned, requested: limit, persisted })
    }

    return NextResponse.json({ error: `unknown action '${action}'` }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
