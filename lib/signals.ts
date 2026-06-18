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
import { salesforceConfigured, fetchSalesforceCategory } from '@/lib/salesforce'

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
export interface ActivityEntry { at: string; category: string; source: string; added: number; skipped: number; message: string }
export interface SignalMeta { lastIngestedAt: string; lastAddedAt?: string; count: number; source: string }
export interface SignalStore {
  signals: OutboundSignal[]
  meta: Record<string, SignalMeta>
  activity?: ActivityEntry[]
}

// An ingestion source returns report records for a category, ordered by signal
// date DESC. opts.limit/offset let the layer page deeper for net-new records.
// The layer assigns the stable id, source, and ingestedAt — sources don't have to.
export interface IngestionSource {
  id: string
  label: string
  ingest: (category: SignalCategory, opts?: { limit?: number; offset?: number }) => Promise<LonescaleRecord[]>
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

// Salesforce source registers itself only when credentials are present (so the
// app cleanly falls back to mock otherwise). Imported lazily to keep this module
// free of server-only assumptions at import time.
if (salesforceConfigured()) {
  SOURCES.salesforce = {
    id: 'salesforce',
    label: 'Salesforce (Lonescale)',
    ingest: (category, opts) => fetchSalesforceCategory(category, opts),
  }
}

export const DEFAULT_SOURCE_ID = 'mock'
// Prefer Salesforce when it's configured; otherwise fall back to mock.
export function defaultSourceId(): string { return SOURCES.salesforce ? 'salesforce' : 'mock' }
export function isSourceConfigured(id: string): boolean { return !!SOURCES[id] }
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

// Append rows to the store, skipping any whose id already exists (dedupe). Never
// removes or overwrites existing records — this is the "Add More" merge. Returns
// how many were added vs skipped as duplicates.
export function appendSignals(store: SignalStore, sourceId: string, rows: LonescaleRecord[]): { store: SignalStore; added: number; skipped: number } {
  const existing = new Set(store.signals.map(s => s.id))
  const at = new Date().toISOString()
  const add: OutboundSignal[] = []
  let skipped = 0
  const touched = new Set<string>()
  for (const r of rows) {
    const id = r.id || lonescaleRecordId(r)
    if (existing.has(id)) { skipped++; continue }
    existing.add(id)
    add.push({ ...r, id, source: sourceId, ingestedAt: (r as Partial<OutboundSignal>).ingestedAt || at })
    touched.add(r.category)
  }
  const signals = [...store.signals, ...add]
  const meta = { ...store.meta }
  touched.forEach(cat => {
    const prev = meta[cat]
    meta[cat] = {
      lastIngestedAt: prev?.lastIngestedAt || at,
      lastAddedAt: at,
      count: signals.filter(s => s.category === cat).length,
      source: prev?.source || sourceId,
    }
  })
  return { store: { ...store, signals, meta }, added: add.length, skipped }
}

// Prepend an activity entry (capped) for the per-category log shown in the UI.
export function logActivity(store: SignalStore, entry: ActivityEntry): SignalStore {
  return { ...store, activity: [entry, ...(store.activity || [])].slice(0, 50) }
}

// "Add More": pull from a source ordered by signal date DESC, paging deeper than
// the first window, skipping ids already in the store, until `limit` net-new
// records are found or the source is exhausted. Appends them (status defaults to
// New via the per-rep overlay). Existing records and other categories are
// untouched. Returns added / skipped(duplicates seen) / scanned.
export async function addMoreFromSource(
  store: SignalStore, sourceId: string, category: SignalCategory, limit: number,
  pageSize = 200, maxScan = 2000,
): Promise<{ store: SignalStore; added: number; skipped: number; scanned: number }> {
  const src = getSource(sourceId)
  const existing = new Set(store.signals.filter(s => s.category === category).map(s => s.id))
  const seen = new Set<string>()
  const collected: LonescaleRecord[] = []
  let offset = 0, scanned = 0, skipped = 0
  while (collected.length < limit && offset < maxScan) {
    const page = await src.ingest(category, { limit: pageSize, offset })
    if (!page.length) break
    let newThisPage = 0
    for (const r of page) {
      const id = r.id || lonescaleRecordId(r)
      if (seen.has(id)) continue          // de-dupe within the scan
      seen.add(id); newThisPage++; scanned++
      if (existing.has(id)) { skipped++; continue } // already in store → skip
      collected.push({ ...r, id })
      if (collected.length >= limit) break
    }
    if (newThisPage === 0) break          // source not paging / exhausted (e.g. mock)
    offset += pageSize
  }
  const { store: next, added } = appendSignals(store, src.id, collected.slice(0, limit))
  return { store: next, added, skipped, scanned }
}

export const EMPTY_STORE: SignalStore = { signals: [], meta: {}, activity: [] }
