// ─── Salesforce ingestion source ────────────────────────────────────────────
// Pulls Lonescale signals straight from Salesforce via the REST query API and
// maps them to the store's record shape. Registered as the 'salesforce' source
// in lib/signals.ts, but ONLY when credentials are present — otherwise the app
// falls back to the mock source. This is the in-app (Phase 2b) path; the same
// queries are what a scheduled Claude/Zapier job (Phase 2a) runs to push.
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
const LIMIT = 150 // freshest N per category (ordered by signal date) — keeps volume sane

// Verified against the live org (2026-06-17):
//  • Job Changes / New Hires / New Eng Leaders are CONTACT-level (LoneScale fields
//    on Contact). Job Postings is ACCOUNT-level (company hiring signal).
//  Source reports for reference:
//    Job Postings     00OPA000001iS012AE  LS: New Job Posting              (Tabular)
//    Job Changes      00OPA0000016Ldt2AE  LS: Job Change - Prospecting     (Tabular)
//    New Eng Leaders  00OPA0000016LCT2A2  LS: New Eng Leader - Prospecting (Tabular)
//    New Hires        (no dedicated LS report; Contact intent = 'New Hire')
//  NOTE: these intent/workflow filters approximate the curated reports. Exact
//  report-matching (Phase 2b) would run the reports via the Analytics API.

const SIGNAL_TYPE: Record<LonescaleCategory, string> = {
  job_postings: 'Job Posting', job_changes: 'Job Change', new_hires: 'New Hire', new_eng_leaders: 'New Eng Leader',
}

// Contact-level categories: object=Contact, with a per-category WHERE clause.
const CONTACT_WHERE: Partial<Record<LonescaleCategory, string>> = {
  job_changes:     `LoneScale__LS_Last_Intent__c = 'Job Change'`,
  new_hires:       `LoneScale__LS_Last_Intent__c = 'New Hire'`,
  new_eng_leaders: `LoneScale__lonescale_workflow_name__c LIKE '%Eng Leadership%'`,
}
const CONTACT_SELECT = [
  'Id', 'Name', 'Title', 'Account.Name', 'Account.Website', 'Owner.Name',
  'LoneScale__LS_Last_Intent__c', 'LoneScale__LS_Seniority__c',
  'LoneScale__lonescale_last_update__c', 'LastActivityDate',
].join(', ')

// Account-level category (Job Postings): company is actively hiring.
const ACCOUNT_SELECT = [
  'Id', 'Name', 'Website', 'Owner.Name',
  'LoneScale__LS_Company_Date_Last_Intent__c', 'LoneScale__lonescale_last_update__c',
  'Number_of_Active_Job_Openings__c', 'Sample_Job_Openings__c', 'Keyplay_Job_URL__c', 'LastActivityDate',
].join(', ')
const JOB_POSTINGS_WHERE = `LoneScale__LS_Company_Last_Intent__c = 'Job Postings'`

export function salesforceConfigured(): boolean {
  return !!(process.env.SF_INSTANCE_URL && process.env.SF_ACCESS_TOKEN)
}

function cleanDomain(website?: string | null): string | null {
  if (!website) return null
  return website.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '') || null
}

async function runQuery(instanceUrl: string, token: string, soql: string): Promise<any[]> {
  const url = `${instanceUrl}/services/data/${API_VERSION}/query?q=${encodeURIComponent(soql)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Salesforce query failed: ${res.status} ${await res.text().catch(() => '')}`)
  const data = await res.json()
  return data.records || []
}

function mapContact(category: LonescaleCategory, instanceUrl: string, r: any): LonescaleRecord {
  const account = r.Account?.Name || ''
  const contact = r.Name || ''
  const detail = [r.LoneScale__LS_Last_Intent__c || SIGNAL_TYPE[category], r.LoneScale__LS_Seniority__c].filter(Boolean).join(' · ')
  return {
    id: lonescaleRecordId({ sfId: r.Id, account, contact, signalType: SIGNAL_TYPE[category] }),
    sfId: r.Id || null, category, account, contact,
    title: r.Title || '',
    signalType: SIGNAL_TYPE[category],
    signalDetail: detail,
    signalDate: r.LoneScale__lonescale_last_update__c || '',
    owner: r.Owner?.Name || null,
    lastActivity: r.LastActivityDate || null,
    domain: cleanDomain(r.Account?.Website),
    sfUrl: r.Id ? `${instanceUrl}/lightning/r/Contact/${r.Id}/view` : null,
  }
}

function mapAccount(instanceUrl: string, r: any): LonescaleRecord {
  const account = r.Name || ''
  const openings = r.Number_of_Active_Job_Openings__c
  const sample = r.Sample_Job_Openings__c ? String(r.Sample_Job_Openings__c).split(';').slice(0, 3).map((s: string) => s.trim()).join(', ') : ''
  const detail = [openings != null ? `${openings} open role${openings === 1 ? '' : 's'}` : null, sample || null].filter(Boolean).join(' — ')
  return {
    id: lonescaleRecordId({ sfId: r.Id, account, contact: '', signalType: 'Job Posting' }),
    sfId: r.Id || null, category: 'job_postings', account, contact: '',
    title: '',
    signalType: 'Job Posting',
    signalDetail: detail || 'Active job postings',
    signalDate: r.LoneScale__LS_Company_Date_Last_Intent__c || r.LoneScale__lonescale_last_update__c || '',
    owner: r.Owner?.Name || null,
    lastActivity: r.LastActivityDate || null,
    domain: cleanDomain(r.Website),
    // Prefer the careers page when present, else the SF Account record.
    sfUrl: r.Id ? `${instanceUrl}/lightning/r/Account/${r.Id}/view` : null,
  }
}

// Run one category against Salesforce and return mapped records, ordered by
// signal date DESC. opts.limit/opts.offset support the deep-scan "Add More"
// flow (paging deeper than the first page to find net-new records).
// Throws if not configured or on API error.
export async function fetchSalesforceCategory(category: LonescaleCategory, opts?: { limit?: number; offset?: number }): Promise<LonescaleRecord[]> {
  const instanceUrl = process.env.SF_INSTANCE_URL
  const token = process.env.SF_ACCESS_TOKEN
  if (!instanceUrl || !token) throw new Error('Salesforce not configured (SF_INSTANCE_URL / SF_ACCESS_TOKEN)')
  const limit = opts?.limit ?? LIMIT
  const offset = opts?.offset ?? 0
  const page = `LIMIT ${limit}${offset ? ` OFFSET ${offset}` : ''}` // SOQL OFFSET max 2000

  if (category === 'job_postings') {
    const soql = `SELECT ${ACCOUNT_SELECT} FROM Account WHERE ${JOB_POSTINGS_WHERE} ORDER BY LoneScale__LS_Company_Date_Last_Intent__c DESC NULLS LAST ${page}`
    const rows = await runQuery(instanceUrl, token, soql)
    return rows.map(r => mapAccount(instanceUrl, r))
  }

  const where = CONTACT_WHERE[category]
  if (!where) return []
  const soql = `SELECT ${CONTACT_SELECT} FROM Contact WHERE ${where} ORDER BY LoneScale__lonescale_last_update__c DESC NULLS LAST ${page}`
  const rows = await runQuery(instanceUrl, token, soql)
  return rows.map(r => mapContact(category, instanceUrl, r))
}
