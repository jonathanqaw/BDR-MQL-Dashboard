// ─── Salesforce ingestion source ────────────────────────────────────────────
// Pulls Lonescale signals straight from Salesforce via the REST query API and
// maps them to the store's record shape. Registered as the 'salesforce' source
// in lib/signals.ts, but ONLY when credentials are present — otherwise the app
// falls back to the mock source. This is the in-app (Phase 2b) path; the same
// queries are also what a scheduled Claude/Zapier job (Phase 2a) runs to push.
//
// CREDENTIALS (set in Vercel env to activate):
//   SF_INSTANCE_URL   e.g. https://qawolf1.my.salesforce.com
//   SF_ACCESS_TOKEN   a valid OAuth access token (from a Connected App; ideally
//                     minted per-request via JWT bearer flow — see TODO below)
//
// TODO(salesforce-auth): replace the static SF_ACCESS_TOKEN with a JWT-bearer
// token mint (Connected App + cert + integration user) so the app refreshes its
// own token headlessly. Until a Connected App exists this source stays dormant.

import { lonescaleRecordId, type LonescaleRecord, type LonescaleCategory } from '@/lib/lonescale'

const API_VERSION = 'v60.0'

// Verified against the live org (2026-06-17): Lonescale writes onto the Contact
// object. LoneScale__LS_Last_Intent__c = 'Job Change' | 'New Hire' discriminates
// two categories; lonescale_workflow_name__c LIKE '%Eng Leadership%' covers the
// New Eng Leaders prospecting workflows. Source reports for reference:
//   Job Postings        00OPA000001iS012AE  LS: New Job Posting           (Tabular)
//   Job Changes         00OPA0000016Ldt2AE  LS: Job Change - Prospecting  (Tabular)
//   New Eng Leaders     00OPA0000016LCT2A2  LS: New Eng Leader - Prospecting (Tabular)
//   New Hires           (no dedicated LS report; intent='New Hire' on Contact)
const SELECT = [
  'Id', 'Name', 'Title', 'Account.Name', 'Account.Website', 'Owner.Name',
  'LoneScale__LS_Last_Intent__c', 'LoneScale__lonescale_workflow_name__c',
  'LoneScale__lonescale_last_update__c', 'LoneScale__LS_Seniority__c', 'LastActivityDate',
].join(', ')
const LIMIT = 200

// WHERE clause per category. job_postings is the one still-unconfirmed filter —
// it isn't carried by LS_Last_Intent (only Job Change / New Hire) or the contact
// workflow names, so it's almost certainly an Account-level hiring signal.
// TODO(job-postings): confirm the discriminator for "LS: New Job Posting"
// (likely an Account field) and set CATEGORY_WHERE.job_postings accordingly.
const CATEGORY_WHERE: Record<LonescaleCategory, string | null> = {
  job_changes:     `LoneScale__LS_Last_Intent__c = 'Job Change'`,
  new_hires:       `LoneScale__LS_Last_Intent__c = 'New Hire'`,
  new_eng_leaders: `LoneScale__lonescale_workflow_name__c LIKE '%Eng Leadership%'`,
  job_postings:    null, // unconfirmed — see TODO above
}

const SIGNAL_TYPE: Record<LonescaleCategory, string> = {
  job_postings: 'Job Posting', job_changes: 'Job Change', new_hires: 'New Hire', new_eng_leaders: 'New Eng Leader',
}

export function salesforceConfigured(): boolean {
  return !!(process.env.SF_INSTANCE_URL && process.env.SF_ACCESS_TOKEN)
}

function soqlFor(category: LonescaleCategory): string | null {
  const where = CATEGORY_WHERE[category]
  if (!where) return null
  return `SELECT ${SELECT} FROM Contact WHERE ${where} ORDER BY LoneScale__lonescale_last_update__c DESC NULLS LAST LIMIT ${LIMIT}`
}

function cleanDomain(website?: string | null): string | null {
  if (!website) return null
  return website.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '') || null
}

function mapRow(category: LonescaleCategory, instanceUrl: string, r: any): LonescaleRecord {
  const account = r.Account?.Name || ''
  const contact = r.Name || ''
  const intent = r.LoneScale__LS_Last_Intent__c || SIGNAL_TYPE[category]
  const seniority = r.LoneScale__LS_Seniority__c
  const detailBits = [intent, seniority].filter(Boolean)
  return {
    id: lonescaleRecordId({ sfId: r.Id, account, contact, signalType: SIGNAL_TYPE[category] }),
    sfId: r.Id || null,
    category,
    account,
    contact,
    title: r.Title || '',
    signalType: SIGNAL_TYPE[category],
    signalDetail: detailBits.join(' · '),
    signalDate: r.LoneScale__lonescale_last_update__c || '',
    owner: r.Owner?.Name || null,
    lastActivity: r.LastActivityDate || null,
    domain: cleanDomain(r.Account?.Website),
    sfUrl: r.Id ? `${instanceUrl}/lightning/r/Contact/${r.Id}/view` : null,
  }
}

// Run one category's SOQL against Salesforce and return mapped records.
// Throws if not configured or on API error (caller falls back to mock).
export async function fetchSalesforceCategory(category: LonescaleCategory): Promise<LonescaleRecord[]> {
  const instanceUrl = process.env.SF_INSTANCE_URL
  const token = process.env.SF_ACCESS_TOKEN
  if (!instanceUrl || !token) throw new Error('Salesforce not configured (SF_INSTANCE_URL / SF_ACCESS_TOKEN)')
  const soql = soqlFor(category)
  if (!soql) return [] // unconfirmed category (job_postings) → no rows until filter is set

  const url = `${instanceUrl}/services/data/${API_VERSION}/query?q=${encodeURIComponent(soql)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Salesforce query failed: ${res.status} ${await res.text().catch(() => '')}`)
  const data = await res.json()
  const rows: any[] = data.records || []
  return rows.map(r => mapRow(category, instanceUrl, r))
}
