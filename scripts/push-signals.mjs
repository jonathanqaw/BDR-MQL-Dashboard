#!/usr/bin/env node
// Push Lonescale signals into the Outbound Signals store (Phase 2a path).
//
// This is the "push" half of the no-credentials ingestion model: a scheduled
// Claude agent (or Zapier, or any job) fetches the rows from Salesforce — using
// the SOQL documented in lib/salesforce.ts — writes them as a JSON array of
// signal objects, and runs this script to POST them to the store. The dashboard
// then shows them on Refresh. No Salesforce credentials live in the app.
//
// Signal object shape (one per row):
//   { sfId, category, account, contact, title, signalType, signalDetail,
//     signalDate, owner, lastActivity, domain, sfUrl }
//   category ∈ job_postings | job_changes | new_hires | new_eng_leaders
//
// Usage:
//   OUTBOUND_STORE_URL=https://bdr-mql-dashboard.vercel.app \
//   OUTBOUND_INGEST_TOKEN=...secret... \
//   node scripts/push-signals.mjs signals.json [sourceId]
//
// - OUTBOUND_STORE_URL defaults to http://localhost:3000
// - OUTBOUND_INGEST_TOKEN is required only if the store enforces it
// - sourceId defaults to 'salesforce'

import { readFileSync } from 'node:fs'

const file = process.argv[2]
const sourceId = process.argv[3] || 'salesforce'
if (!file) { console.error('usage: node scripts/push-signals.mjs <signals.json> [sourceId]'); process.exit(1) }

const base = process.env.OUTBOUND_STORE_URL || 'http://localhost:3000'
const token = process.env.OUTBOUND_INGEST_TOKEN

let signals
try { signals = JSON.parse(readFileSync(file, 'utf8')) } catch (e) { console.error('cannot read/parse', file, e.message); process.exit(1) }
if (!Array.isArray(signals)) { console.error('expected a JSON array of signals'); process.exit(1) }

const res = await fetch(`${base}/api/outbound-signals`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify({ action: 'ingest', source: sourceId, signals }),
})
const data = await res.json().catch(() => ({}))
if (!res.ok) { console.error('push failed', res.status, data); process.exit(1) }

const byCat = {}
for (const s of data.signals || []) byCat[s.category] = (byCat[s.category] || 0) + 1
console.log(`pushed ${signals.length} signals (source=${sourceId}). store now holds ${(data.signals || []).length} total:`, byCat, 'persisted:', data.persisted)
