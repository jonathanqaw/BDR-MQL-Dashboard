/**
 * Commissions Tab — Drop-in replacement for the Commissions section
 * ================================================================
 *
 * STRICT SCOPE:
 *   - This file ONLY handles commission tracking, verification, manual entries,
 *     and adjustments/clawbacks.
 *   - It does NOT read, write, or reference: pipeline data, account routing,
 *     Round Robin, AE roster, LIVE_SF_LINKS, HISTORICAL_LEADS, sfUrl values,
 *     Slack integration, or any other dashboard tab.
 *   - All persistence is in localStorage under the `commission-*` namespace.
 *
 * INTEGRATION:
 *   1. Save this file as `app/commissions-tab.tsx` (or wherever feels right).
 *   2. In page.tsx, import it:    import { CommissionsTab } from './commissions-tab'
 *   3. Replace your existing Commissions tab JSX with:
 *        <CommissionsTab events={yourCommissionEvents} reps={yourRepsList} />
 *   4. Adapt your existing data into the CommissionEvent[] shape using the
 *      `adaptToCommissionEvent` helper below, or write your own adapter.
 *
 * MATH RULES (from Q1 2026 SDR Comp Doc):
 *   - Meeting bonus: $150 per ICP meeting (A / B / Approved E only).
 *   - SQL bonus: $620 per SQL, $930 once you have MORE than 3 SQLs in a
 *     calendar month (i.e., 4th SQL onward is the accelerator). Ranked
 *     by SQL date ascending within each month.
 *   - Both gates require ICP tier (A / B / Approved E). Cs are excluded.
 *   - Caps reset quarterly: $18,000 meetings, $22,320 SQLs (Q1 numbers).
 *   - Adjustments (clawbacks/bonuses) are tracked separately and net into
 *     the period's TOTAL.
 */

'use client'

import { useEffect, useMemo, useState } from 'react'

// ============================================================================
// CONSTANTS — All sourced from Q1 2026 SDR Commissions Doc
// ============================================================================

const MEETING_BONUS = 150
const SQL_BASE = 620
const SQL_ACCELERATOR = 930
const SQL_ACCELERATOR_THRESHOLD = 3 // SQLs > 3 (i.e., 4th onward) get accelerator
const ICP_SCORES_FOR_BONUS = ['A', 'B', 'E_APPROVED'] as const

// Quarterly caps. TODO: confirm Q2 2026 numbers with Arnav — these are Q1.
const MTG_Q_CAP = 18000
const SQL_Q_CAP = 22320

// LocalStorage keys — namespaced so they cannot collide with other features.
const LS = {
  verified: 'commission-spiff-verified',
  viewMode: 'commission-view-mode',
  manual: 'commission-manual-entries',
  adjustments: 'commission-adjustments',
  reconciled: 'commission-last-reconciled',
} as const

// ============================================================================
// TYPES
// ============================================================================

export type Tier = 'A' | 'B' | 'C' | 'E_APPROVED' | null

export type CommissionEvent = {
  rep: string
  account: string
  tier: Tier
  source: string
  ae: string | null
  quality: 'HQ' | null
  meetingDate: Date | null
  sqlDate: Date | null
  sqoDate: Date | null
  acv: number | null
  hasMeeting: boolean
  hasSql: boolean
  isManual?: boolean
  manualId?: string
}

type Adjustment = {
  id: string
  rep: string
  amount: number          // negative = clawback, positive = manual bonus
  effectiveDate: string   // YYYY-MM-DD
  reason: string
  linkedAccount?: string
}

type ManualEntry = {
  id: string
  rep: string
  account: string
  prospect?: string
  ae: string | null
  tier: Tier
  meetingDate: string | null  // YYYY-MM-DD or null
  sqlDate: string | null      // YYYY-MM-DD or null
  source: string
  createdAt: string
}

type ViewMode = 'all' | 'verified'
type RangePreset = 'week' | 'month' | 'quarter' | 'year' | 'all' | 'custom'

type Props = {
  /** Events from your existing data source. Pipeline data is NOT touched. */
  events: CommissionEvent[]
  /** List of rep names for filtering. */
  reps: string[]
}

// ============================================================================
// PURE FUNCTIONS — Math (testable, no side effects)
// ============================================================================

function rowId(e: CommissionEvent): string {
  if (e.isManual && e.manualId) return `manual-${e.manualId}`
  const m = e.meetingDate ? toIsoDate(e.meetingDate) : 'nomtg'
  const s = e.sqlDate ? toIsoDate(e.sqlDate) : 'nosql'
  return `${e.rep}|${e.account}|${m}|${s}`
}

function isIcp(tier: Tier): boolean {
  if (tier === null) return false
  return (ICP_SCORES_FOR_BONUS as readonly string[]).includes(tier)
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function quarterOf(d: Date): { year: number; q: 1 | 2 | 3 | 4 } {
  return { year: d.getFullYear(), q: (Math.floor(d.getMonth() / 3) + 1) as 1 | 2 | 3 | 4 }
}

function quarterKey(d: Date): string {
  const { year, q } = quarterOf(d)
  return `${year}-Q${q}`
}

function quarterRange(year: number, q: 1 | 2 | 3 | 4): { start: Date; end: Date } {
  const startMonth = (q - 1) * 3
  const start = new Date(year, startMonth, 1)
  const end = new Date(year, startMonth + 3, 0, 23, 59, 59, 999)
  return { start, end }
}

function fmtMoney(n: number): string {
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function fmtDateShort(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

/**
 * Compute SQL commission per event using monthly accelerator.
 * Group by month → sort by SQL date asc → first 3 = $620, 4th+ = $930.
 * Non-ICP and non-SQL events get $0.
 */
export function computeSqlCommissions(events: CommissionEvent[]): Map<string, number> {
  const out = new Map<string, number>()

  // Initialize all events to 0
  for (const e of events) out.set(rowId(e), 0)

  // Filter to commissionable SQLs
  const qualifying = events.filter(e => e.hasSql && e.sqlDate && isIcp(e.tier))

  // Group by month
  const byMonth = new Map<string, CommissionEvent[]>()
  for (const e of qualifying) {
    const k = monthKey(e.sqlDate!)
    if (!byMonth.has(k)) byMonth.set(k, [])
    byMonth.get(k)!.push(e)
  }

  // Apply accelerator within each month
  for (const monthEvents of byMonth.values()) {
    const sorted = [...monthEvents].sort(
      (a, b) => a.sqlDate!.getTime() - b.sqlDate!.getTime()
    )
    sorted.forEach((e, idx) => {
      const amount = idx >= SQL_ACCELERATOR_THRESHOLD ? SQL_ACCELERATOR : SQL_BASE
      out.set(rowId(e), amount)
    })
  }

  return out
}

/**
 * Compute Meeting commission per event.
 * Rule: $150 per ICP meeting. Non-ICP gets $0.
 */
export function computeMeetingCommissions(events: CommissionEvent[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of events) {
    const id = rowId(e)
    out.set(id, e.hasMeeting && e.meetingDate && isIcp(e.tier) ? MEETING_BONUS : 0)
  }
  return out
}

/**
 * Filter events to a date range using either meeting date or sql date
 * (whichever causes the event to fall into the range).
 */
function filterEventsToRange(
  events: CommissionEvent[],
  start: Date | null,
  end: Date | null
): CommissionEvent[] {
  if (!start || !end) return events
  return events.filter(e => {
    const inMeeting = e.meetingDate && e.meetingDate >= start && e.meetingDate <= end
    const inSql = e.sqlDate && e.sqlDate >= start && e.sqlDate <= end
    return inMeeting || inSql
  })
}

// ============================================================================
// LOCALSTORAGE HOOKS
// ============================================================================

function useLocalState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [state, setState] = useState<T>(initial)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) setState(JSON.parse(raw))
    } catch (e) {
      console.warn(`[commissions] failed to load ${key}`, e)
    }
    setLoaded(true)
  }, [key])

  useEffect(() => {
    if (!loaded) return
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch (e) {
      console.warn(`[commissions] failed to persist ${key}`, e)
    }
  }, [key, state, loaded])

  return [state, setState]
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CommissionsTab({ events, reps }: Props) {
  // ── State ──────────────────────────────────────────────────────────────
  const [verified, setVerified] = useLocalState<Record<string, boolean>>(LS.verified, {})
  const [viewMode, setViewMode] = useLocalState<ViewMode>(LS.viewMode, 'all')
  const [manualEntries, setManualEntries] = useLocalState<ManualEntry[]>(LS.manual, [])
  const [adjustments, setAdjustments] = useLocalState<Adjustment[]>(LS.adjustments, [])
  const [lastReconciled, setLastReconciled] = useLocalState<string | null>(LS.reconciled, null)

  const [selectedRep, setSelectedRep] = useState<string>('All Reps')
  const [rangePreset, setRangePreset] = useState<RangePreset>('month')
  const [customStart, setCustomStart] = useState<string>('')
  const [customEnd, setCustomEnd] = useState<string>('')

  const [showManualForm, setShowManualForm] = useState(false)
  const [showAdjForm, setShowAdjForm] = useState(false)
  const [showAdjList, setShowAdjList] = useState(false)
  const [showReconcile, setShowReconcile] = useState(false)

  // ── Derive merged event list (auto + manual) ───────────────────────────
  const allEvents = useMemo<CommissionEvent[]>(() => {
    const fromManual: CommissionEvent[] = manualEntries.map(m => ({
      rep: m.rep,
      account: m.account,
      tier: m.tier,
      source: m.source,
      ae: m.ae,
      quality: null,
      meetingDate: m.meetingDate ? new Date(m.meetingDate) : null,
      sqlDate: m.sqlDate ? new Date(m.sqlDate) : null,
      sqoDate: null,
      acv: null,
      hasMeeting: !!m.meetingDate,
      hasSql: !!m.sqlDate,
      isManual: true,
      manualId: m.id,
    }))
    return [...events, ...fromManual]
  }, [events, manualEntries])

  // ── Determine date range ───────────────────────────────────────────────
  const { start, end, label } = useMemo(() => computeRange(rangePreset, customStart, customEnd), [
    rangePreset,
    customStart,
    customEnd,
  ])

  // ── Filter events ──────────────────────────────────────────────────────
  const rangeEvents = useMemo(() => filterEventsToRange(allEvents, start, end), [allEvents, start, end])

  const visibleEvents = useMemo(() => {
    let filtered = rangeEvents
    if (selectedRep !== 'All Reps') {
      filtered = filtered.filter(e => e.rep === selectedRep)
    }
    if (viewMode === 'verified') {
      filtered = filtered.filter(e => verified[rowId(e)] || e.isManual)
    }
    return filtered
  }, [rangeEvents, selectedRep, viewMode, verified])

  // ── Compute commission amounts ─────────────────────────────────────────
  // IMPORTANT: When in Verified Only mode, accelerator is recomputed over the
  // verified subset only — so removing 3 unverified SQLs correctly demotes
  // later SQLs back to $620.
  const meetingCommissions = useMemo(() => computeMeetingCommissions(visibleEvents), [visibleEvents])
  const sqlCommissions = useMemo(() => computeSqlCommissions(visibleEvents), [visibleEvents])

  // ── Adjustments in current range ───────────────────────────────────────
  const rangeAdjustments = useMemo(() => {
    if (!start || !end) return adjustments
    return adjustments.filter(a => {
      const d = new Date(a.effectiveDate)
      const repMatch = selectedRep === 'All Reps' || a.rep === selectedRep
      return repMatch && d >= start && d <= end
    })
  }, [adjustments, start, end, selectedRep])

  // ── Aggregate per-rep totals ───────────────────────────────────────────
  const repTotals = useMemo(() => {
    const repList = selectedRep === 'All Reps' ? reps : [selectedRep]
    return repList.map(rep => {
      const evs = visibleEvents.filter(e => e.rep === rep)
      let meetings = 0
      let meetingMoney = 0
      let sqls = 0
      let sqlMoney = 0
      for (const e of evs) {
        const id = rowId(e)
        const m = meetingCommissions.get(id) ?? 0
        const s = sqlCommissions.get(id) ?? 0
        if (m > 0) {
          meetings += 1
          meetingMoney += m
        }
        if (s > 0) {
          sqls += 1
          sqlMoney += s
        }
      }
      const adj = rangeAdjustments
        .filter(a => a.rep === rep)
        .reduce((sum, a) => sum + a.amount, 0)
      return { rep, meetings, meetingMoney, sqls, sqlMoney, adj, total: meetingMoney + sqlMoney + adj }
    })
  }, [visibleEvents, reps, selectedRep, meetingCommissions, sqlCommissions, rangeAdjustments])

  // ── Quarterly caps (only meaningful for single-quarter ranges) ─────────
  const capInfo = useMemo(() => computeCapInfo(start, end), [start, end])

  // ── Sort detail rows by most recent date ───────────────────────────────
  const sortedDetail = useMemo(() => {
    return [...visibleEvents].sort((a, b) => {
      const da = (a.sqlDate ?? a.meetingDate ?? new Date(0)).getTime()
      const db = (b.sqlDate ?? b.meetingDate ?? new Date(0)).getTime()
      return db - da
    })
  }, [visibleEvents])

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="text-slate-100">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold">
          <span className="text-white">RevOps</span>{' '}
          <span className="text-cyan-400">Commissions.</span>
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Commission verification · rep attribution · payout processing
        </p>
      </div>

      {/* Rep filter */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {['All Reps', ...reps].map(r => (
          <Pill key={r} active={selectedRep === r} onClick={() => setSelectedRep(r)}>
            {r}
          </Pill>
        ))}
      </div>

      {/* Range presets */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {(['week', 'month', 'quarter', 'year', 'all', 'custom'] as RangePreset[]).map(p => (
          <Pill
            key={p}
            active={rangePreset === p}
            onClick={() => setRangePreset(p)}
            variant={p === 'custom' ? 'amber' : 'default'}
          >
            {presetLabel(p)}
          </Pill>
        ))}
      </div>

      {rangePreset === 'custom' && (
        <div className="flex items-center gap-2 mb-4 text-sm">
          <span className="text-slate-400">FROM</span>
          <input
            type="date"
            value={customStart}
            onChange={e => setCustomStart(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1"
          />
          <span className="text-slate-400">→</span>
          <input
            type="date"
            value={customEnd}
            onChange={e => setCustomEnd(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1"
          />
          {(customStart || customEnd) && (
            <button
              onClick={() => {
                setCustomStart('')
                setCustomEnd('')
              }}
              className="text-slate-400 hover:text-slate-200 text-xs"
            >
              × Clear
            </button>
          )}
        </div>
      )}

      {/* Summary card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-slate-400 tracking-wider uppercase">
            Commission Summary · {label}
          </h2>
        </div>

        {/* View mode toggle */}
        <div className="inline-flex bg-slate-800/60 rounded-lg p-1 mb-4">
          <button
            onClick={() => setViewMode('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
              viewMode === 'all' ? 'bg-emerald-500 text-slate-900' : 'text-slate-300'
            }`}
          >
            All (Projected)
          </button>
          <button
            onClick={() => setViewMode('verified')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
              viewMode === 'verified' ? 'bg-emerald-500 text-slate-900' : 'text-slate-300'
            }`}
          >
            Verified Only
          </button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <th className="text-left py-2 font-medium">Rep</th>
              <th className="text-right py-2 font-medium">Meetings</th>
              <th className="text-right py-2 font-medium">Meeting $</th>
              <th className="text-right py-2 font-medium">SQLs</th>
              <th className="text-right py-2 font-medium">SQL $</th>
              <th className="text-right py-2 font-medium">Adjustments</th>
              <th className="text-right py-2 font-medium">Total</th>
              <th className="text-right py-2 font-medium">MTG Q-Cap %</th>
              <th className="text-right py-2 font-medium">SQL Q-Cap %</th>
            </tr>
          </thead>
          <tbody>
            {repTotals.map(rt => (
              <tr key={rt.rep} className="border-b border-slate-800/60">
                <td className="py-3 font-semibold">{rt.rep}</td>
                <td className="text-right py-3">{rt.meetings}</td>
                <td className="text-right py-3 text-emerald-400">{fmtMoney(rt.meetingMoney)}</td>
                <td className="text-right py-3">{rt.sqls}</td>
                <td className="text-right py-3 text-purple-400">{fmtMoney(rt.sqlMoney)}</td>
                <td className={`text-right py-3 ${rt.adj < 0 ? 'text-rose-400' : rt.adj > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {rt.adj === 0 ? '—' : fmtMoney(rt.adj)}
                </td>
                <td className="text-right py-3 font-bold">{fmtMoney(rt.total)}</td>
                <td className="text-right py-3 text-slate-400">
                  {capInfo.singleQuarter ? `${Math.round((rt.meetingMoney / MTG_Q_CAP) * 100)}%` : '—'}
                </td>
                <td className="text-right py-3 text-slate-400">
                  {capInfo.singleQuarter ? `${Math.round((rt.sqlMoney / SQL_Q_CAP) * 100)}%` : '—'}
                </td>
              </tr>
            ))}
            {repTotals.length > 1 && <TotalsRow totals={repTotals} capInfo={capInfo} />}
          </tbody>
        </table>

        {!capInfo.singleQuarter && (
          <p className="text-xs text-slate-500 mt-2">
            ⓘ Caps reset quarterly. Select a single quarter to display % of cap.
          </p>
        )}
      </div>

      {/* Detail card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 mb-4">
        <h2 className="text-xs font-semibold text-slate-400 tracking-wider uppercase mb-3">
          Commission Event Detail · {sortedDetail.length} events · {label}
        </h2>
        <DetailTable
          events={sortedDetail}
          meetingCommissions={meetingCommissions}
          sqlCommissions={sqlCommissions}
          verified={verified}
          onToggleVerified={(id, val) => setVerified({ ...verified, [id]: val })}
          onDeleteManual={(manualId) => {
            setManualEntries(manualEntries.filter(m => m.id !== manualId))
            const newVerified = { ...verified }
            delete newVerified[`manual-${manualId}`]
            setVerified(newVerified)
          }}
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 mb-4">
        <button
          onClick={() => setShowManualForm(true)}
          className="px-4 py-2 border border-amber-500 text-amber-400 rounded-lg text-sm font-medium hover:bg-amber-500/10 transition"
        >
          + Add Spiff Entry
        </button>
        <button
          onClick={() => setShowAdjForm(true)}
          className="px-4 py-2 border border-rose-500 text-rose-400 rounded-lg text-sm font-medium hover:bg-rose-500/10 transition"
        >
          + Add Adjustment / Clawback
        </button>
      </div>

      {/* Manual entry form */}
      {showManualForm && (
        <ManualEntryForm
          reps={reps}
          onCancel={() => setShowManualForm(false)}
          onSave={(entry) => {
            const newEntry = { ...entry, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
            setManualEntries([...manualEntries, newEntry])
            // Auto-verify
            setVerified({ ...verified, [`manual-${newEntry.id}`]: true })
            setShowManualForm(false)
          }}
        />
      )}

      {/* Adjustment form */}
      {showAdjForm && (
        <AdjustmentForm
          reps={reps}
          onCancel={() => setShowAdjForm(false)}
          onSave={(adj) => {
            const newAdj = { ...adj, id: crypto.randomUUID() }
            setAdjustments([...adjustments, newAdj])
            setShowAdjForm(false)
          }}
        />
      )}

      {/* Adjustments list */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 mb-4">
        <button
          onClick={() => setShowAdjList(!showAdjList)}
          className="w-full flex items-center justify-between text-left"
        >
          <h3 className="text-sm font-semibold text-slate-300">
            {showAdjList ? '▼' : '▶'} Adjustments ({rangeAdjustments.length})
          </h3>
          <span className="text-xs text-slate-500">
            Net: <span className={rangeAdjustments.reduce((s, a) => s + a.amount, 0) < 0 ? 'text-rose-400' : 'text-emerald-400'}>
              {fmtMoney(rangeAdjustments.reduce((s, a) => s + a.amount, 0))}
            </span>
          </span>
        </button>
        {showAdjList && (
          <AdjustmentsList
            adjustments={rangeAdjustments}
            onDelete={(id) => setAdjustments(adjustments.filter(a => a.id !== id))}
          />
        )}
      </div>

      {/* Reconcile to Spiff */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 mb-4">
        <button
          onClick={() => setShowReconcile(!showReconcile)}
          className="w-full text-left"
        >
          <h3 className="text-sm font-semibold text-slate-300">
            {showReconcile ? '▼' : '▶'} Reconcile to Spiff
          </h3>
        </button>
        {showReconcile && (
          <ReconcilePanel
            repTotals={repTotals}
            unverifiedCount={visibleEvents.filter(e => !verified[rowId(e)] && !e.isManual).length}
            lastReconciled={lastReconciled}
            onMarkReconciled={() => setLastReconciled(new Date().toISOString())}
          />
        )}
      </div>

      {/* Reference card */}
      <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 text-xs">
        <h3 className="text-slate-300 font-semibold mb-2">Commission Structure Reference</h3>
        <div className="grid grid-cols-2 gap-4 text-slate-400">
          <div>
            <strong className="text-slate-200">Meeting Booked:</strong> $150 / ICP meeting (A/B/E tier)
          </div>
          <div>
            <strong className="text-slate-200">SQL:</strong> $620 / SQL · $930 accelerator if &gt;3/month
          </div>
        </div>
        <p className="text-slate-500 mt-2">
          Payout: following month, 2nd half pay cycle. Meeting + SQL can stack on the same account.
          Quarterly caps: ${MTG_Q_CAP.toLocaleString()} meetings · ${SQL_Q_CAP.toLocaleString()} SQLs.
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function Pill({
  children,
  active,
  onClick,
  variant = 'default',
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
  variant?: 'default' | 'amber'
}) {
  const activeClasses =
    variant === 'amber'
      ? 'bg-amber-500 text-slate-900 border-amber-500'
      : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 text-xs rounded-full border transition ${
        active ? activeClasses : 'border-slate-700 text-slate-300 hover:border-slate-600'
      }`}
    >
      {children}
    </button>
  )
}

function TierBadge({ tier }: { tier: Tier }) {
  if (!tier) return <span className="text-slate-600">—</span>
  const styles: Record<string, string> = {
    A: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    B: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    C: 'bg-slate-500/20 text-slate-400 border-slate-500/40',
    E_APPROVED: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
  }
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded border ${styles[tier]}`}>
      {tier === 'E_APPROVED' ? 'E' : tier}
    </span>
  )
}

function TypeBadge({ type }: { type: 'Meeting' | 'SQL' }) {
  const styles =
    type === 'Meeting'
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
      : 'bg-purple-500/20 text-purple-300 border-purple-500/40'
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded border ${styles}`}>
      {type}
    </span>
  )
}

function DetailTable({
  events,
  meetingCommissions,
  sqlCommissions,
  verified,
  onToggleVerified,
  onDeleteManual,
}: {
  events: CommissionEvent[]
  meetingCommissions: Map<string, number>
  sqlCommissions: Map<string, number>
  verified: Record<string, boolean>
  onToggleVerified: (id: string, val: boolean) => void
  onDeleteManual: (manualId: string) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
            <th className="text-left py-2 px-1 font-medium w-8">✓</th>
            <th className="text-left py-2 font-medium">Rep</th>
            <th className="text-left py-2 font-medium">Account</th>
            <th className="text-left py-2 font-medium">Tier</th>
            <th className="text-left py-2 font-medium">Source</th>
            <th className="text-left py-2 font-medium">AE</th>
            <th className="text-left py-2 font-medium">Quality</th>
            <th className="text-left py-2 font-medium">Meeting Date</th>
            <th className="text-left py-2 font-medium">SQL Date</th>
            <th className="text-left py-2 font-medium">SQO Date</th>
            <th className="text-right py-2 font-medium">ACV</th>
            <th className="text-left py-2 font-medium">Type</th>
            <th className="text-right py-2 font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {events.map(e => {
            const id = rowId(e)
            const m = meetingCommissions.get(id) ?? 0
            const s = sqlCommissions.get(id) ?? 0
            const total = m + s
            const isCNonIcp = e.tier === 'C'
            return (
              <tr key={id} className="border-b border-slate-800/40 hover:bg-slate-800/30">
                <td className="py-3 px-1">
                  <input
                    type="checkbox"
                    checked={!!verified[id]}
                    onChange={ev => onToggleVerified(id, ev.target.checked)}
                    className="accent-emerald-500"
                  />
                </td>
                <td className="py-3">{e.rep}</td>
                <td className="py-3 font-semibold">
                  {e.account}
                  {e.isManual && (
                    <span className="ml-2 text-[10px] text-amber-400 border border-amber-500/40 px-1.5 py-0.5 rounded">
                      MANUAL
                    </span>
                  )}
                </td>
                <td className="py-3"><TierBadge tier={e.tier} /></td>
                <td className="py-3 text-slate-400 text-xs">{e.source}</td>
                <td className="py-3">{e.ae ?? '—'}</td>
                <td className="py-3">
                  {e.quality === 'HQ' && (
                    <span className="text-[10px] font-bold text-amber-300 bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.5 rounded">
                      HQ
                    </span>
                  )}
                </td>
                <td className="py-3 text-slate-300">{fmtDateShort(e.meetingDate)}</td>
                <td className="py-3 text-purple-300">{fmtDateShort(e.sqlDate)}</td>
                <td className="py-3 text-amber-300">{fmtDateShort(e.sqoDate)}</td>
                <td className="py-3 text-right">{e.acv ? `$${e.acv.toLocaleString()}` : '—'}</td>
                <td className="py-3">
                  <div className="flex gap-1">
                    {m > 0 && <TypeBadge type="Meeting" />}
                    {s > 0 && <TypeBadge type="SQL" />}
                    {isCNonIcp && (
                      <span title="C-tier excluded from bonus per ICP rule" className="text-[10px] text-yellow-400">
                        ⚠ Non-ICP
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 text-right font-bold">
                  {total > 0 ? fmtMoney(total) : <span className="text-slate-600">—</span>}
                  {e.isManual && (
                    <button
                      onClick={() => onDeleteManual(e.manualId!)}
                      className="ml-2 text-rose-400 hover:text-rose-300 text-xs"
                      title="Delete manual entry"
                    >
                      ×
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
          {events.length === 0 && (
            <tr>
              <td colSpan={13} className="text-center py-8 text-slate-500 italic">
                No events in this view
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function TotalsRow({
  totals,
  capInfo,
}: {
  totals: { meetings: number; meetingMoney: number; sqls: number; sqlMoney: number; adj: number; total: number }[]
  capInfo: { singleQuarter: boolean }
}) {
  const sum = totals.reduce(
    (acc, t) => ({
      meetings: acc.meetings + t.meetings,
      meetingMoney: acc.meetingMoney + t.meetingMoney,
      sqls: acc.sqls + t.sqls,
      sqlMoney: acc.sqlMoney + t.sqlMoney,
      adj: acc.adj + t.adj,
      total: acc.total + t.total,
    }),
    { meetings: 0, meetingMoney: 0, sqls: 0, sqlMoney: 0, adj: 0, total: 0 }
  )
  return (
    <tr className="border-t border-slate-700 bg-slate-800/30">
      <td className="py-3 font-bold">Total</td>
      <td className="text-right py-3 font-bold">{sum.meetings}</td>
      <td className="text-right py-3 font-bold text-emerald-400">{fmtMoney(sum.meetingMoney)}</td>
      <td className="text-right py-3 font-bold">{sum.sqls}</td>
      <td className="text-right py-3 font-bold text-purple-400">{fmtMoney(sum.sqlMoney)}</td>
      <td className={`text-right py-3 font-bold ${sum.adj < 0 ? 'text-rose-400' : sum.adj > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
        {sum.adj === 0 ? '—' : fmtMoney(sum.adj)}
      </td>
      <td className="text-right py-3 font-bold">{fmtMoney(sum.total)}</td>
      <td className="text-right py-3 text-slate-400">{capInfo.singleQuarter ? '' : '—'}</td>
      <td className="text-right py-3 text-slate-400">{capInfo.singleQuarter ? '' : '—'}</td>
    </tr>
  )
}

function ManualEntryForm({
  reps,
  onCancel,
  onSave,
}: {
  reps: string[]
  onCancel: () => void
  onSave: (e: Omit<ManualEntry, 'id' | 'createdAt'>) => void
}) {
  const [account, setAccount] = useState('')
  const [prospect, setProspect] = useState('')
  const [rep, setRep] = useState(reps[0] ?? '')
  const [ae, setAe] = useState('')
  const [tier, setTier] = useState<Tier>('B')
  const [meetingDate, setMeetingDate] = useState('')
  const [sqlDate, setSqlDate] = useState('')
  const [source, setSource] = useState('manual: spiff')

  return (
    <div className="bg-slate-900/80 border border-amber-500/40 rounded-xl p-4 mb-4">
      <h3 className="text-sm font-semibold text-amber-300 mb-3">Add Spiff Entry</h3>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="Account">
          <input value={account} onChange={e => setAccount(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Prospect (optional)">
          <input value={prospect} onChange={e => setProspect(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Rep">
          <select value={rep} onChange={e => setRep(e.target.value)} className={inputCls}>
            {reps.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="AE">
          <input value={ae} onChange={e => setAe(e.target.value)} className={inputCls} placeholder="—" />
        </Field>
        <Field label="Tier">
          <select value={tier ?? ''} onChange={e => setTier(e.target.value as Tier)} className={inputCls}>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="E_APPROVED">E (Approved)</option>
            <option value="C">C (non-ICP)</option>
          </select>
        </Field>
        <Field label="Source label">
          <input value={source} onChange={e => setSource(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Meeting Date (optional)">
          <input type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="SQL Date (optional)">
          <input type="date" value={sqlDate} onChange={e => setSqlDate(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200">Cancel</button>
        <button
          onClick={() => {
            if (!account || !rep) return
            onSave({
              rep,
              account,
              prospect: prospect || undefined,
              ae: ae || null,
              tier,
              meetingDate: meetingDate || null,
              sqlDate: sqlDate || null,
              source,
            })
          }}
          disabled={!account || !rep}
          className="px-4 py-1.5 text-xs bg-amber-500 text-slate-900 rounded font-semibold disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  )
}

function AdjustmentForm({
  reps,
  onCancel,
  onSave,
}: {
  reps: string[]
  onCancel: () => void
  onSave: (a: Omit<Adjustment, 'id'>) => void
}) {
  const [rep, setRep] = useState(reps[0] ?? '')
  const [amount, setAmount] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [reason, setReason] = useState('')
  const [linkedAccount, setLinkedAccount] = useState('')

  const reasonChips = [
    'Clawback: Closed Lost',
    'Clawback: SQL Disqualified',
    'Clawback: Duplicate SQL',
    'Bonus: Spiff',
    'Other',
  ]

  return (
    <div className="bg-slate-900/80 border border-rose-500/40 rounded-xl p-4 mb-4">
      <h3 className="text-sm font-semibold text-rose-300 mb-3">Add Adjustment / Clawback</h3>
      <p className="text-xs text-slate-400 mb-3">
        Use negative amounts for clawbacks (e.g., <code className="bg-slate-800 px-1 rounded">-1860</code> for the Feb 2026 clawback).
        Positive for ad-hoc bonuses.
      </p>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="Rep">
          <select value={rep} onChange={e => setRep(e.target.value)} className={inputCls}>
            {reps.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Amount ($)">
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className={inputCls}
            placeholder="-1860"
          />
        </Field>
        <Field label="Effective Date">
          <input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Linked Account (optional)">
          <input value={linkedAccount} onChange={e => setLinkedAccount(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <Field label="Reason">
        <input value={reason} onChange={e => setReason(e.target.value)} className={inputCls} placeholder="Free text" />
      </Field>
      <div className="flex gap-2 mt-2 flex-wrap">
        {reasonChips.map(c => (
          <button
            key={c}
            onClick={() => setReason(c)}
            className="px-2 py-1 text-[10px] border border-slate-700 hover:border-slate-500 rounded-full text-slate-300"
          >
            {c}
          </button>
        ))}
      </div>
      <div className="flex gap-2 justify-end mt-4">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200">Cancel</button>
        <button
          onClick={() => {
            const num = parseFloat(amount)
            if (!rep || !effectiveDate || isNaN(num)) return
            onSave({
              rep,
              amount: num,
              effectiveDate,
              reason: reason || 'Adjustment',
              linkedAccount: linkedAccount || undefined,
            })
          }}
          disabled={!rep || !effectiveDate || isNaN(parseFloat(amount))}
          className="px-4 py-1.5 text-xs bg-rose-500 text-white rounded font-semibold disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  )
}

function AdjustmentsList({
  adjustments,
  onDelete,
}: {
  adjustments: Adjustment[]
  onDelete: (id: string) => void
}) {
  if (adjustments.length === 0) {
    return <p className="text-xs text-slate-500 italic mt-3">No adjustments in this period.</p>
  }
  return (
    <div className="mt-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
            <th className="text-left py-2 font-medium">Date</th>
            <th className="text-left py-2 font-medium">Rep</th>
            <th className="text-left py-2 font-medium">Reason</th>
            <th className="text-left py-2 font-medium">Account</th>
            <th className="text-right py-2 font-medium">Amount</th>
            <th className="text-right py-2 font-medium w-12"></th>
          </tr>
        </thead>
        <tbody>
          {adjustments.map(a => (
            <tr key={a.id} className="border-b border-slate-800/40">
              <td className="py-2">{a.effectiveDate}</td>
              <td className="py-2">{a.rep}</td>
              <td className="py-2 text-slate-300">{a.reason}</td>
              <td className="py-2 text-slate-400">{a.linkedAccount ?? '—'}</td>
              <td className={`py-2 text-right font-bold ${a.amount < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {fmtMoney(a.amount)}
              </td>
              <td className="py-2 text-right">
                <button
                  onClick={() => onDelete(a.id)}
                  className="text-rose-400 hover:text-rose-300 text-xs"
                  title="Delete"
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReconcilePanel({
  repTotals,
  unverifiedCount,
  lastReconciled,
  onMarkReconciled,
}: {
  repTotals: { rep: string; meetingMoney: number; sqlMoney: number; adj: number; total: number }[]
  unverifiedCount: number
  lastReconciled: string | null
  onMarkReconciled: () => void
}) {
  const sum = repTotals.reduce(
    (acc, t) => ({
      meeting: acc.meeting + t.meetingMoney,
      sql: acc.sql + t.sqlMoney,
      adj: acc.adj + t.adj,
      total: acc.total + t.total,
    }),
    { meeting: 0, sql: 0, adj: 0, total: 0 }
  )
  return (
    <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
      <div>
        <div className="grid grid-cols-2 gap-1 text-slate-300">
          <span>Meetings:</span>
          <span className="text-right">{fmtMoney(sum.meeting)}</span>
          <span>SQLs:</span>
          <span className="text-right">{fmtMoney(sum.sql)}</span>
          <span>Adjustments:</span>
          <span className={`text-right ${sum.adj < 0 ? 'text-rose-400' : ''}`}>{fmtMoney(sum.adj)}</span>
          <span className="font-bold border-t border-slate-700 pt-1">Grand Total:</span>
          <span className="text-right font-bold border-t border-slate-700 pt-1">{fmtMoney(sum.total)}</span>
        </div>
      </div>
      <div className="text-slate-400">
        <p>Unverified rows in view: <span className="text-slate-200 font-semibold">{unverifiedCount}</span></p>
        <p className="mt-2">
          Last reconciled:{' '}
          <span className="text-slate-200">
            {lastReconciled ? new Date(lastReconciled).toLocaleString() : 'never'}
          </span>
        </p>
        <button
          onClick={onMarkReconciled}
          className="mt-2 px-3 py-1.5 text-xs bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 rounded"
        >
          Mark reconciled now
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-slate-400 block mb-1">{label}</span>
      {children}
    </label>
  )
}

const inputCls =
  'w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-100 focus:border-cyan-500 outline-none'

// ============================================================================
// HELPERS — Range computation
// ============================================================================

function computeRange(
  preset: RangePreset,
  customStart: string,
  customEnd: string
): { start: Date | null; end: Date | null; label: string } {
  const now = new Date()
  if (preset === 'all') return { start: null, end: null, label: 'All Time' }
  if (preset === 'custom') {
    if (!customStart || !customEnd) return { start: null, end: null, label: 'Custom Range' }
    return {
      start: new Date(customStart + 'T00:00:00'),
      end: new Date(customEnd + 'T23:59:59'),
      label: 'Custom Range',
    }
  }
  if (preset === 'week') {
    const dayOfWeek = now.getDay()
    const start = new Date(now)
    start.setDate(now.getDate() - dayOfWeek)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    end.setHours(23, 59, 59, 999)
    return { start, end, label: 'This Week' }
  }
  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    return { start, end, label: 'This Month' }
  }
  if (preset === 'quarter') {
    const { year, q } = quarterOf(now)
    const { start, end } = quarterRange(year, q)
    return { start, end, label: 'This Quarter' }
  }
  if (preset === 'year') {
    const start = new Date(now.getFullYear(), 0, 1)
    const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
    return { start, end, label: 'This Year' }
  }
  return { start: null, end: null, label: 'All Time' }
}

function presetLabel(p: RangePreset): string {
  return {
    week: 'This Week',
    month: 'This Month',
    quarter: 'This Quarter',
    year: 'This Year',
    all: 'All Time',
    custom: 'Custom Range',
  }[p]
}

function computeCapInfo(start: Date | null, end: Date | null): { singleQuarter: boolean } {
  if (!start || !end) return { singleQuarter: false }
  return { singleQuarter: quarterKey(start) === quarterKey(end) }
}

// ============================================================================
// ADAPTER — Helper to convert your existing data to CommissionEvent[]
// ============================================================================

/**
 * Example adapter. Replace the field accesses with whatever your existing
 * commission event objects look like. This is the ONE place you need to wire
 * up your data. Everything else is self-contained.
 *
 * Usage in page.tsx:
 *
 *   const commissionEvents = myExistingEvents.map(adaptToCommissionEvent)
 *   <CommissionsTab events={commissionEvents} reps={['Jonathan Kim', 'BDR 1']} />
 */
export function adaptToCommissionEvent(raw: any, rep: string): CommissionEvent {
  return {
    rep,
    account: raw.account ?? '',
    tier: normalizeTier(raw.accountTier),
    source: raw.sourceChannel ?? '—',
    ae: raw.ae || null,
    quality: raw.mqlQuality === 'HQ' ? 'HQ' : null,
    meetingDate: parseDate(raw.meetingDate),
    sqlDate: parseDate(raw.sqlDate),
    sqoDate: parseDate(raw.sqoDate),
    acv: raw.acv ? parseFloat(String(raw.acv).replace(/[$,]/g, '')) : null,
    hasMeeting: !!raw.isMeeting,
    hasSql: !!raw.isSql,
  }
}

function normalizeTier(t: any): Tier {
  if (t === 'A' || t === 'B' || t === 'C') return t
  if (t === 'E' || t === 'E_APPROVED' || t === 'Approved E') return 'E_APPROVED'
  return null
}

function parseDate(d: any): Date | null {
  if (!d) return null
  if (d instanceof Date) return d
  const parsed = new Date(d)
  return isNaN(parsed.getTime()) ? null : parsed
}
