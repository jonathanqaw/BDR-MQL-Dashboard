// ─── Lonescale / Salesforce report data layer ───────────────────────────────
// This is the SINGLE seam between the Outbound workbench UI and Salesforce.
// Today it returns deterministic mock data so the dashboard is fully usable;
// when the real Salesforce report fetch is wired up, only `fetchLonescaleReport`
// below needs to change — the API route and all UI stay the same.

export type LonescaleCategory = 'job_postings' | 'job_changes' | 'new_hires' | 'new_eng_leaders'

export interface LonescaleRecord {
  id: string                 // stable key: sf:<recordId>  OR  c:<account>|<contact>|<signalType>
  sfId: string | null        // Salesforce record ID when available
  category: LonescaleCategory
  account: string
  contact: string
  title: string
  signalType: string         // e.g. "Job Posting", "Job Change"
  signalDetail: string       // human-readable detail from the report
  signalDate: string         // YYYY-MM-DD
  owner: string | null       // Salesforce record owner, if surfaced
  lastActivity: string | null// last activity date YYYY-MM-DD, if surfaced
  domain: string | null      // website/domain, if surfaced
  sfUrl: string | null       // deep link to the Salesforce record
}

export interface LonescaleReportConfig {
  id: LonescaleCategory
  label: string
  reportUrl: string          // "Open Report" link target
}

const SF_BASE = 'https://qawolf1.lightning.force.com'

// ── Preconfigured Salesforce report links ───────────────────────────────────
// TODO(salesforce): replace the REPLACE_WITH_*_REPORT_ID placeholders with the
// real Salesforce report IDs for each Lonescale report. These power the
// "Open Report" buttons and (later) the live row fetch in fetchLonescaleReport.
export const LONESCALE_REPORTS: Record<LonescaleCategory, LonescaleReportConfig> = {
  job_postings:    { id:'job_postings',    label:'Job Postings',                       reportUrl:`${SF_BASE}/lightning/r/Report/REPLACE_WITH_JOB_POSTINGS_REPORT_ID/view` },
  job_changes:     { id:'job_changes',     label:'Job Changes',                        reportUrl:`${SF_BASE}/lightning/r/Report/REPLACE_WITH_JOB_CHANGES_REPORT_ID/view` },
  new_hires:       { id:'new_hires',       label:'New Hires',                          reportUrl:`${SF_BASE}/lightning/r/Report/REPLACE_WITH_NEW_HIRES_REPORT_ID/view` },
  new_eng_leaders: { id:'new_eng_leaders', label:'New Engineering Leaders - Prospects',reportUrl:`${SF_BASE}/lightning/r/Report/REPLACE_WITH_NEW_ENG_LEADERS_REPORT_ID/view` },
}

export const LONESCALE_CATEGORY_ORDER: LonescaleCategory[] = ['job_postings','job_changes','new_hires','new_eng_leaders']

export const SIGNAL_TYPE_BY_CATEGORY: Record<LonescaleCategory,string> = {
  job_postings:'Job Posting', job_changes:'Job Change', new_hires:'New Hire', new_eng_leaders:'New Eng Leader',
}

// Stable id: Salesforce record id when present, else account+contact+signalType.
export function lonescaleRecordId(r:{sfId?:string|null;account:string;contact:string;signalType:string}):string {
  const sf=(r.sfId||'').trim()
  if(sf) return `sf:${sf}`
  return `c:${r.account.trim().toLowerCase()}|${r.contact.trim().toLowerCase()}|${(r.signalType||'').trim().toLowerCase()}`
}

function sfUrlFor(sfId:string|null):string|null {
  return sfId ? `${SF_BASE}/lightning/r/Contact/${sfId}/view` : null
}

// ── Mock data ────────────────────────────────────────────────────────────────
// Deterministic sample rows per category so the workbench is fully functional
// before the Salesforce integration lands. Replace via fetchLonescaleReport.
type RawRow = { account:string; contact:string; title:string; detail:string; date:string; owner:string|null; lastActivity:string|null; domain:string|null; sfId:string|null }

const MOCK_ROWS: Record<LonescaleCategory, RawRow[]> = {
  job_postings: [
    { account:'Vercel',           contact:'Priya Nadkarni',   title:'Director of QA Engineering', detail:'Hiring 4 SDETs + 1 QA Lead (Remote, US)',        date:'2026-06-16', owner:'Jonathan Kim', lastActivity:'2026-06-16', domain:'vercel.com',     sfId:'003PA00000A1b2cYAA' },
    { account:'Ramp',             contact:'Marcus Webb',      title:'VP Engineering',             detail:'Posted 3 backend + 2 platform roles',            date:'2026-06-15', owner:'Jonathan Kim', lastActivity:null,         domain:'ramp.com',       sfId:'003PA00000A1b3dYAA' },
    { account:'Notion',           contact:'Elena Fischer',    title:'Head of Quality',            detail:'Hiring automation engineers (Playwright)',       date:'2026-06-15', owner:null,           lastActivity:null,         domain:'notion.so',      sfId:null },
    { account:'Brex',             contact:'Tobias Lund',      title:'Engineering Manager, QA',    detail:'2 open SDET reqs, growing test org',             date:'2026-06-14', owner:'Jonathan Kim', lastActivity:'2026-06-12', domain:'brex.com',       sfId:'003PA00000A1b4eYAA' },
    { account:'Retool',           contact:'Sandra Olsson',    title:'Director, Platform Eng',     detail:'Hiring for test infrastructure team',            date:'2026-06-13', owner:null,           lastActivity:null,         domain:'retool.com',     sfId:'003PA00000A1b5fYAA' },
    { account:'Linear',          contact:'Devon Pierce',     title:'QA Lead',                    detail:'First QA hire — building the function',          date:'2026-06-12', owner:'Jonathan Kim', lastActivity:null,         domain:'linear.app',     sfId:null },
  ],
  job_changes: [
    { account:'Figma',            contact:'Aaron Mizrahi',    title:'VP of Engineering',          detail:'Moved from Sr Director → VP Eng',                date:'2026-06-16', owner:'Jonathan Kim', lastActivity:'2026-06-16', domain:'figma.com',      sfId:'003PA00000B2c3dYAA' },
    { account:'Plaid',            contact:'Grace Okafor',     title:'Head of Quality Engineering',detail:'Promoted internally to Head of QE',              date:'2026-06-15', owner:null,           lastActivity:null,         domain:'plaid.com',      sfId:'003PA00000B2c4eYAA' },
    { account:'Airtable',         contact:'Henrik Sølvberg',  title:'Director of Engineering',    detail:'Joined from prior QA-heavy org',                 date:'2026-06-14', owner:'Jonathan Kim', lastActivity:null,         domain:'airtable.com',   sfId:null },
    { account:'Gusto',            contact:'Mei Lin Cho',      title:'Sr Director, Platform',      detail:'Lateral move into platform leadership',          date:'2026-06-13', owner:null,           lastActivity:'2026-06-10', domain:'gusto.com',      sfId:'003PA00000B2c5fYAA' },
    { account:'Webflow',          contact:'Carlos Benitez',   title:'VP Engineering',             detail:'New VP Eng, owns quality strategy',              date:'2026-06-11', owner:'Jonathan Kim', lastActivity:null,         domain:'webflow.com',    sfId:'003PA00000B2c6gYAA' },
  ],
  new_hires: [
    { account:'Rippling',         contact:'Yuki Tanaka',      title:'Director of QA',             detail:'Joined 2 weeks ago from a test-automation shop',date:'2026-06-16', owner:'Jonathan Kim', lastActivity:null,         domain:'rippling.com',   sfId:'003PA00000C3d4eYAA' },
    { account:'Deel',             contact:'Omar Haddad',      title:'Head of Engineering Quality',detail:'New leadership hire, building QA roadmap',       date:'2026-06-15', owner:null,           lastActivity:null,         domain:'deel.com',       sfId:'003PA00000C3d5fYAA' },
    { account:'Mercury',          contact:'Isabel Romero',    title:'QA Engineering Manager',     detail:'First QA manager hire',                          date:'2026-06-14', owner:'Jonathan Kim', lastActivity:'2026-06-14', domain:'mercury.com',    sfId:null },
    { account:'Census',           contact:'Theo Andersson',   title:'Director, Platform & QA',    detail:'Joined to scale platform + testing',             date:'2026-06-12', owner:null,           lastActivity:null,         domain:'getcensus.com',  sfId:'003PA00000C3d6gYAA' },
    { account:'Vanta',            contact:'Nadia Petrova',    title:'Head of QA',                 detail:'New head of QA, evaluating tooling',             date:'2026-06-11', owner:'Jonathan Kim', lastActivity:null,         domain:'vanta.com',      sfId:'003PA00000C3d7hYAA' },
  ],
  new_eng_leaders: [
    { account:'Ramp',             contact:'Marcus Webb',      title:'VP Engineering',             detail:'New eng leader — also hiring (see Job Postings)',date:'2026-06-15', owner:'Jonathan Kim', lastActivity:null,         domain:'ramp.com',       sfId:'003PA00000A1b3dYAA' },
    { account:'Scale AI',         contact:'Lucia Ferreira',   title:'Head of Engineering',        detail:'Promoted to Head of Eng',                        date:'2026-06-16', owner:null,           lastActivity:null,         domain:'scale.com',      sfId:'003PA00000D4e5fYAA' },
    { account:'Anduril',          contact:'Garrett Cole',     title:'Director of Engineering',    detail:'New director over multiple teams',               date:'2026-06-14', owner:'Jonathan Kim', lastActivity:'2026-06-13', domain:'anduril.com',    sfId:'003PA00000D4e6gYAA' },
    { account:'Cohere',           contact:'Anika Sharma',     title:'VP of Engineering',          detail:'New VP Eng, ML platform focus',                  date:'2026-06-12', owner:null,           lastActivity:null,         domain:'cohere.com',     sfId:null },
    { account:'Glean',            contact:'Roman Vasiliev',   title:'Head of Platform Engineering',detail:'Owns platform + reliability + QA',              date:'2026-06-10', owner:'Jonathan Kim', lastActivity:null,         domain:'glean.com',      sfId:'003PA00000D4e7hYAA' },
  ],
}

function toRecords(category:LonescaleCategory, rows:RawRow[]):LonescaleRecord[] {
  const signalType=SIGNAL_TYPE_BY_CATEGORY[category]
  const byId=new Map<string,LonescaleRecord>()
  rows.forEach(r=>{
    const rec:LonescaleRecord={
      id: lonescaleRecordId({sfId:r.sfId, account:r.account, contact:r.contact, signalType}),
      sfId: r.sfId,
      category,
      account: r.account,
      contact: r.contact,
      title: r.title,
      signalType,
      signalDetail: r.detail,
      signalDate: r.date,
      owner: r.owner,
      lastActivity: r.lastActivity,
      domain: r.domain,
      sfUrl: sfUrlFor(r.sfId),
    }
    // Dedup by id (SF record id when available, else account+contact+signalType)
    byId.set(rec.id, rec)
  })
  return Array.from(byId.values())
}

/**
 * Fetch the rows for a Lonescale Salesforce report.
 *
 * TODO(salesforce): wire this to the real Salesforce report behind
 * LONESCALE_REPORTS[category].reportUrl. Options:
 *   1. Salesforce Analytics REST API: GET /services/data/vXX.X/analytics/reports/<reportId>
 *      then map factMap rows → LonescaleRecord (use lonescaleRecordId for `id`).
 *   2. A SOQL query against the underlying object(s) the report is built on.
 * Auth (connected app / OAuth token) should live server-side in env vars; this
 * function already runs server-side via app/api/lonescale/route.ts.
 *
 * Until then it returns deterministic mock rows so the workbench is fully usable.
 */
export async function fetchLonescaleReport(category:LonescaleCategory):Promise<LonescaleRecord[]> {
  // const token = process.env.SALESFORCE_ACCESS_TOKEN
  // if (token) { /* real fetch + map to LonescaleRecord[] */ }
  return toRecords(category, MOCK_ROWS[category] || [])
}

// `true` once the real Salesforce fetch is implemented (drives the empty-state copy).
export const LONESCALE_LIVE_FETCH_ENABLED = false
