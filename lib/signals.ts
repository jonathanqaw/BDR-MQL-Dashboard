// ─── Outbound Signals — ingestion layer ─────────────────────────────────────
// The single, source-agnostic seam between ingestion sources and the store.
//
//   Ingestion Source → Signal Ingestion Layer → Outbound Signals Store → UI
//
// The Outbound Workbench UI reads ONLY from the store (/api/outbound-signals).
// It never imports a source directly. To add a new source (Salesforce API,
// Salesforce report extraction, Playwright, CSV, Apollo, Warmly, 6sense) you
// implement one IngestionSource and register it below — nothing else changes.

import {
  fetchLonescaleReport,
  lonescaleRecordId,
  LONESCALE_CATEGORY_ORDER,
  type LonescaleRecord,
  type LonescaleCategory,
} from '@/lib/lonescale'

export type SignalCategory = LonescaleCategory
export const SIGNAL_CATEGORY_ORDER = LONESCALE_CATEGORY_ORDER

// The canonical record shape persisted in the store. Extends the report record
// with provenance so the store can hold signals from many sources at once.
export interface OutboundSignal extends LonescaleRecord {
  source: string       // ingestion source id, e.g. 'mock' | 'salesforce' | 'csv'
  ingestedAt: string   // ISO timestamp this row entered the store
}

// What the store keeps on disk (Vercel Blob). Shared across all reps; the
// per-rep workflow overlay (status/priority/bucket/notes/next step) lives
// separately and is layered on top in the UI by record id.
export interface SignalStore {
  signals: OutboundSignal[]
  meta: Record<string, { lastIngestedAt: string; count: number; source: string }>
}

// An ingestion source returns report records for a category. The layer assigns
// the stable id, source, and ingestedAt — sources don't have to.
export interface IngestionSource {
  id: string
  label: string
  ingest: (category: SignalCategory) => Promise<LonescaleRecord[]>
}

// ── Source registry ──────────────────────────────────────────────────────────
// Phase 1 ships the mock source (deterministic sample data via lib/lonescale).
// Future sources register here; the store/UI are unaffected:
//   salesforce: SOQL on Contact/Lead or the Analytics Reports API
//   csv:        parsed upload
//   apollo / warmly / sixsense: their respective APIs
const mockSource: IngestionSource = {
  id: 'mock',
  label: 'Sample data',
  ingest: (category) => fetchLonescaleReport(category),
}

const SOURCES: Record<string, IngestionSource> = {
  mock: mockSource,
}

export const DEFAULT_SOURCE_ID = 'mock'
export function listSources() { return Object.values(SOURCES).map(s => ({ id: s.id, label: s.label })) }
export function getSource(id?: string): IngestionSource { return (id && SOURCES[id]) || mockSource }

// Run one source for one category and normalize to store records (deduped by id).
export async function ingestCategory(sourceId: string, category: SignalCategory): Promise<OutboundSignal[]> {
  const src = getSource(sourceId)
  const rows = await src.ingest(category)
  const at = new Date().toISOString()
  const byId = new Map<string, OutboundSignal>()
  rows.forEach(r => {
    const id = r.id || lonescaleRecordId(r)
    byId.set(id, { ...r, id, source: src.id, ingestedAt: at })
  })
  return Array.from(byId.values())
}

// Merge freshly-ingested rows for a category into the store. Replaces only the
// rows for (category + source) so other categories/sources are untouched. The
// workflow overlay is NOT here, so a refresh never disturbs status/notes/etc.
export function upsertCategory(store: SignalStore, sourceId: string, category: SignalCategory, fresh: OutboundSignal[]): SignalStore {
  const kept = store.signals.filter(s => !(s.category === category && s.source === sourceId))
  return {
    signals: [...kept, ...fresh],
    meta: { ...store.meta, [category]: { lastIngestedAt: new Date().toISOString(), count: fresh.length, source: sourceId } },
  }
}

// Generic external push (future Claude scheduled job / Zapier / webhook): accept
// pre-built rows, normalize provenance, upsert per category+source.
export function upsertPushed(store: SignalStore, sourceId: string, rows: OutboundSignal[]): SignalStore {
  const at = new Date().toISOString()
  let next: SignalStore = store
  const byCat = new Map<SignalCategory, OutboundSignal[]>()
  rows.forEach(r => {
    const id = r.id || lonescaleRecordId(r)
    const norm: OutboundSignal = { ...r, id, source: sourceId, ingestedAt: r.ingestedAt || at }
    const arr = byCat.get(r.category) || []
    arr.push(norm); byCat.set(r.category, arr)
  })
  byCat.forEach((arr, cat) => { next = upsertCategory(next, sourceId, cat, arr) })
  return next
}

export const EMPTY_STORE: SignalStore = { signals: [], meta: {} }
