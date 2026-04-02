'use client'

import { useEffect, useState, useCallback } from 'react'
import type { Lead } from '@/lib/slack'

type Status = 'new' | 'contacted' | 'dq'
type SourceFilter = 'all' | 'sf' | 'no-sf'
type StatusFilter = 'all' | Status

const getSt = (): Record<string, Status> => {
  try { return JSON.parse(localStorage.getItem('mql-st') || '{}') } catch { return {} }
}
const saveSt = (email: string, v: Status) => {
  const s = getSt(); s[email] = v; localStorage.setItem('mql-st', JSON.stringify(s))
}

export default function Dashboard() {
  const [leads, setLeads]           = useState<Lead[]>([])
  const [statuses, setStatuses]     = useState<Record<string, Status>>({})
  const [srcFilter, setSrcFilter]   = useState<SourceFilter>('all')
  const [stFilter, setStFilter]     = useState<StatusFilter>('all')
  const [search, setSearch]         = useState('')
  const [dateFrom, setDateFrom]     = useState('')
  const [dateTo, setDateTo]         = useState('')
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [fetchedAt, setFetchedAt]   = useState<string | null>(null)
  const [copied, setCopied]         = useState<string | null>(null)

  const fetchLeads = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res  = await fetch('/api/leads')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setLeads(data.leads)
      setFetchedAt(data.fetchedAt)
      setStatuses(getSt())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { setStatuses(getSt()); fetchLeads() }, [fetchLeads])

  const updateStatus = (email: string, v: Status) => {
    saveSt(email, v)
    setStatuses(p => ({ ...p, [email]: v }))
  }

  const copyEmail = (email: string) => {
    navigator.clipboard.writeText(email).then(() => {
      setCopied(email)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const filtered = leads.filter(l => {
    if (srcFilter === 'sf' && !l.sfUrl) return false
    if (srcFilter === 'no-sf' && l.sfUrl) return false
    const st = statuses[l.email] || 'new'
    if (stFilter !== 'all' && st !== stFilter) return false
    if (l.date) {
      if (dateFrom && l.date < dateFrom) return false
      if (dateTo   && l.date > dateTo)   return false
    }
    if (search) {
      const q = search.toLowerCase()
      return l.email.includes(q) || l.domain.includes(q)
    }
    return true
  })

  const st         = getSt()
  const contacted  = leads.filter(l => (st[l.email] || 'new') === 'contacted').length
  const dq         = leads.filter(l => (st[l.email] || 'new') === 'dq').length
  const withSF     = leads.filter(l => !!l.sfUrl).length

  const stripeColor: Record<string, string> = {
    new: 'bg-[#322e60]', contacted: 'bg-[#7b6ef6]', dq: 'bg-[#ff5c5c]'
  }

  return (
    <div className="flex min-h-screen" style={{ background: '#13102a', color: '#fff', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif' }}>

      {/* Sidebar */}
      <aside style={{ width: 252, flexShrink: 0, background: '#1c1840', borderRight: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', paddingBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 14 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: '#00e5a0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#13102a', flexShrink: 0 }}>QW</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>QA Wolf</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '.08em' }}>BDR Portal</div>
          </div>
        </div>
        {[
          { icon: '⚡', label: 'Lead Dashboard', meta: '#bdr-routed-leads · live', active: true },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', borderLeft: `3px solid ${item.active ? '#7b6ef6' : 'transparent'}`, background: item.active ? 'rgba(123,110,246,0.18)' : 'transparent' }}>
            <div style={{ width: 26, height: 26, borderRadius: 6, background: item.active ? '#7b6ef6' : '#2a2654', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: item.active ? '#fff' : 'rgba(255,255,255,0.38)', flexShrink: 0 }}>{item.icon}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: item.active ? 600 : 500, color: item.active ? '#fff' : 'rgba(255,255,255,0.68)' }}>{item.label}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>{item.meta}</div>
            </div>
          </div>
        ))}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '10px 0' }} />
        <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '.1em', padding: '6px 20px 4px' }}>Jonathan Kim</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px' }}>
          <div style={{ width: 26, height: 26, borderRadius: 6, background: '#2a2654', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.38)', flexShrink: 0 }}>SF</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.68)' }}>Salesforce</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>qawolf1.my.salesforce.com</div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, padding: '30px 34px 60px', overflowX: 'auto', minWidth: 0 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
              MQL Lead<br /><span style={{ color: '#00e5a0' }}>Dashboard.</span>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', marginTop: 4 }}>
              Jonathan Kim · #bdr-routed-leads · live via Slack API
              {fetchedAt && ` · refreshed ${new Date(fetchedAt).toLocaleTimeString()}`}
            </div>
          </div>
          <button
            onClick={fetchLeads}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: '#13102a', background: '#00e5a0', border: 'none', borderRadius: 7, padding: '9px 16px', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1, flexShrink: 0 }}
          >
            <svg width={13} height={13} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={loading ? { animation: 'spin 0.7s linear infinite' } : {}}>
              <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.5 0 2.9.6 3.9 1.6" /><path d="M10.5 1.5L13.8 4 11 6.5" />
            </svg>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        {/* Tags */}
        <div style={{ display: 'flex', gap: 7, marginTop: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          {[['#00e5a0','Live Slack data'],['#a89cf8','Email deduped'],['#f5a623','Status persisted']].map(([color, label]) => (
            <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.68)', background: '#231f4a', border: '1px solid rgba(255,255,255,0.13)', borderRadius: 999, padding: '3px 11px' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />{label}
            </span>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,92,92,0.12)', border: '1px solid rgba(255,92,92,0.35)', borderRadius: 7, padding: '10px 14px', fontSize: 13, color: '#ff5c5c', marginBottom: 16 }}>
            ⚠ {error}
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 22 }}>
          {[
            { label: 'Total unique leads', value: leads.length, color: '#00e5a0', sub: 'deduped by email' },
            { label: 'With SF link',        value: withSF,       color: '#a89cf8', sub: 'direct record link' },
            { label: 'Contacted',            value: contacted,    color: '#a89cf8', sub: 'in progress' },
            { label: "DQ'd",                value: dq,           color: '#ff5c5c', sub: 'disqualified' },
          ].map(s => (
            <div key={s.label} style={{ background: '#1c1840', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>{s.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 5 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Source</span>
          {(['all','sf','no-sf'] as SourceFilter[]).map(f => {
            const labels: Record<SourceFilter, string> = { all: 'All', sf: 'Has SF link', 'no-sf': 'No SF link' }
            const active = srcFilter === f
            return <button key={f} onClick={() => setSrcFilter(f)} style={{ fontSize: 12, fontWeight: 600, padding: '5px 13px', borderRadius: 999, border: active ? '1px solid #7b6ef6' : '1px solid rgba(255,255,255,0.13)', background: active ? '#7b6ef6' : 'transparent', color: active ? '#fff' : 'rgba(255,255,255,0.38)', cursor: 'pointer' }}>{labels[f]}</button>
          })}
          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.13)', flexShrink: 0 }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Status</span>
          {(['all','new','contacted','dq'] as StatusFilter[]).map(f => {
            const labels: Record<StatusFilter, string> = { all: 'All', new: 'New', contacted: 'Contacted', dq: "DQ'd" }
            const active = stFilter === f
            const colors: Record<StatusFilter, string> = { all: '#7b6ef6', new: '#2a2654', contacted: '#7b6ef6', dq: '#ff5c5c' }
            return <button key={f} onClick={() => setStFilter(f)} style={{ fontSize: 12, fontWeight: 600, padding: '5px 13px', borderRadius: 999, border: active ? `1px solid ${colors[f]}` : '1px solid rgba(255,255,255,0.13)', background: active ? colors[f] : 'transparent', color: active ? '#fff' : 'rgba(255,255,255,0.38)', cursor: 'pointer' }}>{labels[f]}</button>
          })}
          <div style={{ marginLeft: 'auto', position: 'relative' }}>
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'rgba(255,255,255,0.38)', pointerEvents: 'none' }} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><circle cx={7} cy={7} r={4.5} /><path d="M11 11l2.5 2.5" /></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search email or domain…" style={{ fontSize: 13, padding: '7px 12px 7px 30px', border: '1px solid rgba(255,255,255,0.13)', borderRadius: 7, background: '#231f4a', color: '#fff', width: 220, outline: 'none' }} />
          </div>
        </div>

        {/* Date row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Date</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ fontSize: 12, padding: '5px 10px', border: '1px solid rgba(255,255,255,0.13)', borderRadius: 7, background: '#231f4a', color: 'rgba(255,255,255,0.68)', outline: 'none', width: 132 }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ fontSize: 12, padding: '5px 10px', border: '1px solid rgba(255,255,255,0.13)', borderRadius: 7, background: '#231f4a', color: 'rgba(255,255,255,0.68)', outline: 'none', width: 132 }} />
          {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(''); setDateTo('') }} style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.38)', background: 'none', border: 'none', cursor: 'pointer' }}>✕ Clear</button>}
        </div>

        {/* Table */}
        <div style={{ background: '#1c1840', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#231f4a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <th style={{ width: 4, padding: 0 }} />
                {['Email','Domain','Salesforce','Date','Status'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && leads.length === 0 ? (
                <tr><td /><td colSpan={5} style={{ textAlign: 'center', padding: '52px 20px', color: 'rgba(255,255,255,0.38)', fontSize: 14 }}>Loading live leads from Slack…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td /><td colSpan={5} style={{ textAlign: 'center', padding: '52px 20px', color: 'rgba(255,255,255,0.38)', fontSize: 14 }}>No leads match this filter.</td></tr>
              ) : filtered.map(lead => {
                const st = statuses[lead.email] || 'new'
                return (
                  <tr key={lead.email} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: 0, width: 4 }}>
                      <span style={{ display: 'block', width: 4, minHeight: 46, background: st === 'contacted' ? '#7b6ef6' : st === 'dq' ? '#ff5c5c' : '#322e60' }} />
                    </td>
                    <td style={{ padding: '10px 14px', opacity: st === 'dq' ? 0.5 : 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{lead.email}</span>
                        <button
                          onClick={() => copyEmail(lead.email)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, border: copied === lead.email ? '1px solid rgba(123,110,246,0.4)' : '1px solid rgba(255,255,255,0.13)', background: copied === lead.email ? 'rgba(123,110,246,0.18)' : '#2a2654', color: copied === lead.email ? '#a89cf8' : 'rgba(255,255,255,0.38)', cursor: 'pointer' }}
                        >
                          {copied === lead.email ? '✓ Copied!' : '⎘ Copy'}
                        </button>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'rgba(255,255,255,0.38)', opacity: st === 'dq' ? 0.5 : 1 }}>
                      <a href={`https://${lead.domain}`} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{lead.domain}</a>
                    </td>
                    <td style={{ padding: '10px 14px', opacity: st === 'dq' ? 0.5 : 1 }}>
                      {lead.sfUrl ? (
                        <a href={lead.sfUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999, border: '1px solid rgba(0,229,160,0.3)', background: 'rgba(0,229,160,0.13)', color: '#00e5a0', textDecoration: 'none' }}>
                          ↗ Open in SF
                        </a>
                      ) : <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'rgba(255,255,255,0.38)', whiteSpace: 'nowrap', opacity: st === 'dq' ? 0.5 : 1 }}>{lead.date || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', position: 'absolute', left: 10, pointerEvents: 'none', background: st === 'contacted' ? '#7b6ef6' : st === 'dq' ? '#ff5c5c' : 'rgba(255,255,255,0.38)' }} />
                        <select
                          value={st}
                          onChange={e => updateStatus(lead.email, e.target.value as Status)}
                          style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px 4px 22px', borderRadius: 999, border: st === 'contacted' ? '1px solid rgba(123,110,246,0.4)' : st === 'dq' ? '1px solid rgba(255,92,92,0.35)' : '1px solid rgba(255,255,255,0.13)', background: st === 'contacted' ? 'rgba(123,110,246,0.18)' : st === 'dq' ? 'rgba(255,92,92,0.12)' : '#2a2654', color: st === 'contacted' ? '#a89cf8' : st === 'dq' ? '#ff5c5c' : 'rgba(255,255,255,0.38)', cursor: 'pointer', outline: 'none', appearance: 'none' }}
                        >
                          <option value="new">New</option>
                          <option value="contacted">Contacted</option>
                          <option value="dq">DQ&apos;d</option>
                        </select>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)' }}>{filtered.length} of {leads.length} leads shown</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)' }}>
            {fetchedAt ? `Live · ${new Date(fetchedAt).toLocaleTimeString()}` : 'Hit Refresh to load live data'}
          </span>
        </div>
      </main>
    </div>
  )
}
