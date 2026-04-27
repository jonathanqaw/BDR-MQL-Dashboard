/**
 * Math Verification — Run this to prove the commission logic matches Spiff.
 * 
 * No React, no UI, no localStorage. Just pure math against the actual data
 * from your Feb / March / April 2026 Spiff statements.
 *
 * Run with: npx tsx commissions-math-test.ts
 *   (or just open it and read the asserts — they're self-documenting)
 */

// ─── Inline copy of the pure math functions ─────────────────────────────
const MEETING_BONUS = 150
const SQL_BASE = 620
const SQL_ACCELERATOR = 930
const SQL_THRESHOLD = 3
const ICP = ['A', 'B', 'E_APPROVED']

type Ev = {
  account: string
  tier: string | null
  hasMeeting: boolean
  hasSql: boolean
  meetingDate: string | null  // YYYY-MM-DD
  sqlDate: string | null
}

function isIcp(t: string | null) { return t !== null && ICP.includes(t) }
function monthKey(d: string) { return d.slice(0, 7) }

function meetingTotal(events: Ev[]): number {
  return events.filter(e => e.hasMeeting && e.meetingDate && isIcp(e.tier)).length * MEETING_BONUS
}

function sqlTotal(events: Ev[]): number {
  const qualifying = events.filter(e => e.hasSql && e.sqlDate && isIcp(e.tier))
  const byMonth: Record<string, Ev[]> = {}
  for (const e of qualifying) {
    const k = monthKey(e.sqlDate!)
    ;(byMonth[k] ??= []).push(e)
  }
  let total = 0
  for (const month of Object.values(byMonth)) {
    const sorted = [...month].sort((a, b) => (a.sqlDate! < b.sqlDate! ? -1 : 1))
    sorted.forEach((_, i) => {
      total += i >= SQL_THRESHOLD ? SQL_ACCELERATOR : SQL_BASE
    })
  }
  return total
}

// ─── Test data: actual Spiff-credited events for Jonathan Kim ───────────

// MARCH 2026 — Spiff total: $5,070
const march: Ev[] = [
  // Contact meetings (8)
  { account: 'EnableComp',           tier: 'B', hasMeeting: true, hasSql: true,  meetingDate: '2026-03-10', sqlDate: '2026-03-13' },
  { account: 'Pex',                  tier: 'B', hasMeeting: true, hasSql: false, meetingDate: '2026-03-31', sqlDate: null },
  { account: 'Playtech',             tier: 'A', hasMeeting: true, hasSql: true,  meetingDate: '2026-03-13', sqlDate: '2026-03-30' },
  { account: 'onPhase',              tier: 'B', hasMeeting: true, hasSql: true,  meetingDate: '2026-03-06', sqlDate: '2026-03-06' },
  { account: 'Nuqleous',             tier: 'B', hasMeeting: true, hasSql: true,  meetingDate: '2026-03-13', sqlDate: '2026-03-13' },
  { account: 'November Five',        tier: 'B', hasMeeting: true, hasSql: false, meetingDate: '2026-03-17', sqlDate: null },
  { account: 'North American Bancard', tier: 'A', hasMeeting: true, hasSql: true, meetingDate: '2026-03-05', sqlDate: '2026-03-17' },
  { account: 'Cradle',               tier: 'B', hasMeeting: true, hasSql: false, meetingDate: '2026-03-12', sqlDate: null },
  // Lead meeting (1)
  { account: 'Azets',                tier: 'A', hasMeeting: true, hasSql: false, meetingDate: '2026-03-24', sqlDate: null },
]

// APRIL 2026 — Spiff total: $4,920 (5 SQLs only — Mettel/Xplor/Secondmind NOT credited)
const april: Ev[] = [
  // Contact meetings credited by Spiff (4)
  { account: 'Secondmind (Tulio)',   tier: 'B', hasMeeting: true, hasSql: false, meetingDate: '2026-04-14', sqlDate: null },
  { account: 'Shure (Larry)',        tier: 'A', hasMeeting: true, hasSql: true,  meetingDate: '2026-04-09', sqlDate: '2026-04-14' },
  { account: 'Product League (Ingmar)', tier: 'B', hasMeeting: true, hasSql: true, meetingDate: '2026-04-02', sqlDate: '2026-04-07' },
  { account: 'Feith Systems',        tier: 'B', hasMeeting: true, hasSql: false, meetingDate: '2026-04-07', sqlDate: null },
  // Lead meetings credited by Spiff (4)
  { account: 'Centric Software',     tier: 'A', hasMeeting: true, hasSql: false, meetingDate: '2026-04-24', sqlDate: null },
  { account: 'axs.com (Brandon)',    tier: 'A', hasMeeting: true, hasSql: false, meetingDate: '2026-04-13', sqlDate: null },
  { account: 'Globe and Mail',       tier: 'B', hasMeeting: true, hasSql: false, meetingDate: '2026-04-23', sqlDate: null },
  { account: 'safenow.de (Ammar)',   tier: 'B', hasMeeting: true, hasSql: true,  meetingDate: '2026-04-09', sqlDate: '2026-04-10' },
  // SQL-only credits
  { account: 'Pex (Brandon Sim)',    tier: 'B', hasMeeting: false, hasSql: true, meetingDate: null, sqlDate: '2026-04-02' },
  { account: 'Blaze (Dakota)',       tier: 'B', hasMeeting: false, hasSql: true, meetingDate: null, sqlDate: '2026-04-15' },
]

// FEBRUARY 2026 — Spiff total: $280 (after -$1,860 clawback)
// Pre-clawback gross: $2,140
const feb: Ev[] = [
  { account: 'ProphetX (excluded)',  tier: 'B', hasMeeting: true, hasSql: false, meetingDate: '2026-02-16', sqlDate: null },
  { account: 'Quince',               tier: 'B', hasMeeting: true, hasSql: true,  meetingDate: '2026-02-11', sqlDate: '2026-02-11' },
  { account: 'Quartr',               tier: 'B', hasMeeting: true, hasSql: true,  meetingDate: '2026-02-09', sqlDate: '2026-02-10' },
  { account: 'Robbins Research',     tier: 'B', hasMeeting: true, hasSql: false, meetingDate: '2026-02-22', sqlDate: null },
  { account: 'WestJet',              tier: 'B', hasMeeting: true, hasSql: false, meetingDate: '2026-02-19', sqlDate: null },
  { account: 'Yassir',               tier: 'B', hasMeeting: true, hasSql: false, meetingDate: '2026-02-17', sqlDate: null },
]
const febAdjustment = -1860

// ─── Run tests ──────────────────────────────────────────────────────────

function test(name: string, actual: number, expected: number) {
  const pass = actual === expected
  const symbol = pass ? '✅' : '❌'
  console.log(`${symbol} ${name}: $${actual}${pass ? '' : ` (expected $${expected})`}`)
}

console.log('\n=== MARCH 2026 ===')
test('March meetings', meetingTotal(march), 1350)
test('March SQLs',     sqlTotal(march),      3720)
test('March TOTAL',    meetingTotal(march) + sqlTotal(march), 5070)

console.log('\n=== APRIL 2026 ===')
test('April meetings', meetingTotal(april), 1200)
test('April SQLs',     sqlTotal(april),      3720)
test('April TOTAL',    meetingTotal(april) + sqlTotal(april), 4920)

console.log('\n=== FEBRUARY 2026 (with clawback) ===')
const febGross = meetingTotal(feb) + sqlTotal(feb)
test('Feb meetings',           meetingTotal(feb), 900)
test('Feb SQLs',               sqlTotal(feb),     1240)
test('Feb gross (pre-claw)',   febGross,          2140)
test('Feb NET (with -$1,860)', febGross + febAdjustment, 280)

console.log('\n')
