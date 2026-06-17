import { NextRequest, NextResponse } from 'next/server'
import { put, get } from '@vercel/blob'
import {
  ingestCategory, upsertCategory, upsertPushed, listSources, DEFAULT_SOURCE_ID,
  SIGNAL_CATEGORY_ORDER, EMPTY_STORE, type SignalStore, type SignalCategory, type OutboundSignal,
} from '@/lib/signals'

export const dynamic = 'force-dynamic'

const KEY = 'outbound-signals.json'

// The Outbound Signals Store — shared across reps (the SF/source data is the
// same for everyone). Per-rep workflow state lives in rep-data, not here.
async function readStore(): Promise<SignalStore> {
  try {
    const r = await get(KEY, { access: 'private' })
    if (!r || r.statusCode !== 200 || !r.stream) return { ...EMPTY_STORE }
    const t = await new Response(r.stream).text()
    const parsed = t ? JSON.parse(t) : null
    return parsed && Array.isArray(parsed.signals) ? parsed : { ...EMPTY_STORE }
  } catch { return { ...EMPTY_STORE } }
}

// Best-effort persistence. If Blob isn't configured (e.g. local dev with no
// token), ingestion still works in-memory and the response is returned anyway.
async function writeStore(store: SignalStore): Promise<boolean> {
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
      const sourceId: string = body.source || DEFAULT_SOURCE_ID
      const cats: SignalCategory[] = body.category ? [body.category] : [...SIGNAL_CATEGORY_ORDER]
      for (const cat of cats) {
        const fresh = await ingestCategory(sourceId, cat)
        store = upsertCategory(store, sourceId, cat, fresh)
      }
      const persisted = await writeStore(store)
      return NextResponse.json({ ...store, sources: listSources(), persisted })
    }

    if (action === 'ingest') {
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
