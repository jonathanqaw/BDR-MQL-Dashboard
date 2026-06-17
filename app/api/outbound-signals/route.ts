import { NextRequest, NextResponse } from 'next/server'
import { put, get } from '@vercel/blob'
import {
  ingestCategory, upsertCategory, upsertPushed, listSources, defaultSourceId,
  SIGNAL_CATEGORY_ORDER, EMPTY_STORE, type SignalStore, type SignalCategory, type OutboundSignal,
} from '@/lib/signals'

export const dynamic = 'force-dynamic'

const KEY = 'outbound-signals.json'

// Same-instance fallback when Vercel Blob isn't configured (local dev) or is
// briefly unavailable. In production Blob is the source of truth and shared
// across instances; this just keeps the store usable without it.
let memStore: SignalStore | null = null

// The external push (`action:'ingest'`) is how off-app sources (scheduled Claude
// job / Zapier / CSV) write to the store. If OUTBOUND_INGEST_TOKEN is set, the
// caller must present it as `Authorization: Bearer <token>`. If unset, the push
// is open (fine for dev; set the token in production to lock it down).
function ingestAuthorized(req: NextRequest): boolean {
  const expected = process.env.OUTBOUND_INGEST_TOKEN
  if (!expected) return true
  const header = req.headers.get('authorization') || ''
  return header === `Bearer ${expected}`
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
      if (!ingestAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
      const sourceId: string = body.source || 'external'
      const rows: OutboundSignal[] = Array.isArray(body.signals) ? body.signals : []
      store = upsertPushed(store, sourceId, rows)
      const persisted = await writeStore(store)
      return NextResponse.json({ ...store, sources: listSources(), persisted })
    }

    return NextResponse.json({ error: `unknown action '${action}'` }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
