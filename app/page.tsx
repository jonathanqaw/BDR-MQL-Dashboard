'use client'

import { useEffect, useState, useCallback } from 'react'
import type { Lead } from '@/lib/slack'

// ─── Types ───────────────────────────────────────────────────────────────────
type Status        = 'new' | 'contacted' | 'booked' | 'nurture' | 'lost' | 'na' | 'dq'
type View          = 'leads' | 'pipeline'
type SourceFilter  = 'all' | 'sf' | 'no-sf'
type StatusFilter  = 'all' | Status
type PeriodFilter  = 'week' | 'month' | 'quarter'
type WorkedFilter  = 'all' | 'worked' | 'untouched'

interface LeadDetail {
  prospectName:    string
  title:           string
  sourceChannel:   string
  outreachChannel: string
  connectedDate:   string
  meetingDate:     string
  nextStep:        string
  nextStepStatus:  string
  sqlDq:           string
  sqlDate:         string
  ae:              string
  multithreading:  string
  sqo:             string
  sqoDate:         string
  acv:             string
  notes:           string
}

const EMPTY_DETAIL: LeadDetail = {
  prospectName:'', title:'', sourceChannel:'', outreachChannel:'',
  connectedDate:'', meetingDate:'', nextStep:'', nextStepStatus:'',
  sqlDq:'', sqlDate:'', ae:'', multithreading:'', sqo:'', sqoDate:'', acv:'', notes:''
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<Status,{label:string;color:string;dim:string;border:string}> = {
  new:       {label:'New',       color:'rgba(255,255,255,0.38)', dim:'#2a2654',               border:'rgba(255,255,255,0.13)'},
  contacted: {label:'Contacted', color:'#a89cf8',                dim:'rgba(123,110,246,0.18)', border:'rgba(123,110,246,0.4)'},
  booked:    {label:'Booked',    color:'#00e5a0',                dim:'rgba(0,229,160,0.15)',   border:'rgba(0,229,160,0.35)'},
  nurture:   {label:'Nurture',   color:'#f5a623',                dim:'rgba(245,166,35,0.15)',  border:'rgba(245,166,35,0.35)'},
  lost:      {label:'Lost',      color:'#ff5c5c',                dim:'rgba(255,92,92,0.12)',   border:'rgba(255,92,92,0.35)'},
  dq:        {label:"DQ'd",      color:'#ff5c5c',                dim:'rgba(255,92,92,0.12)',   border:'rgba(255,92,92,0.35)'},
  na:        {label:'N/A',       color:'rgba(255,255,255,0.25)', dim:'rgba(255,255,255,0.06)', border:'rgba(255,255,255,0.1)'},
}
const STRIPE: Record<Status,string> = {
  new:'#322e60', contacted:'#7b6ef6', booked:'#00e5a0',
  nurture:'#f5a623', lost:'#ff5c5c', dq:'#ff5c5c', na:'#1c1840'
}

// ─── Colours ──────────────────────────────────────────────────────────────────
const C = {
  bg:'#13102a', surface:'#1c1840', surface2:'#231f4a', surface3:'#2a2654',
  border:'rgba(255,255,255,0.07)', border2:'rgba(255,255,255,0.13)',
  text:'#ffffff', text2:'rgba(255,255,255,0.68)', text3:'rgba(255,255,255,0.38)',
  green:'#00e5a0', purple:'#7b6ef6', purpleL:'#a89cf8', amber:'#f5a623', red:'#ff5c5c',
}

// ─── Dropdown options ─────────────────────────────────────────────────────────
const SOURCE_CHANNELS  = ['','#growth-wins','#leads-bot','leads-platform waitlist','gated-content','QA Wolf inbox','webinar','AE assist','gen OB','Other']
const OUTREACH_CH      = ['','Email','LinkedIn','Call','Other']
const NEXT_STEPS       = ['','Discovery Call','Demo','Sample Tests','Reconnect','Other']
const NEXT_STEP_STATUS = ['','In Progress','Discovery Held','Waiting for AE','TBD - Evaluation','Scheduled']
const SQL_OPTIONS      = ['','Yes','No','Pending']
const SQO_OPTIONS      = ['','Yes','No']
const MT_OPTIONS       = ['','Yes','No']

// ─── localStorage helpers ────────────────────────────────────────────────────
const getSt      = (): Record<string,Status>     => { try { return JSON.parse(localStorage.getItem('mql-st')||'{}') } catch { return {} } }
const getDetails = (): Record<string,LeadDetail> => { try { return JSON.parse(localStorage.getItem('mql-dt')||'{}') } catch { return {} } }
const saveSt     = (email:string, v:Status)      => { const s=getSt(); s[email]=v; localStorage.setItem('mql-st',JSON.stringify(s)) }
const saveDetail = (email:string, d:LeadDetail)  => { const s=getDetails(); s[email]=d; localStorage.setItem('mql-dt',JSON.stringify(s)) }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getResponseDot(receivedAt:string|null, status:Status):{color:string;label:string}|null {
  if (!receivedAt || status!=='new') return null
  const mins = (Date.now()-new Date(receivedAt).getTime())/60000
  if (new Date(receivedAt).toDateString()!==new Date().toDateString()) return null
  if (mins<=20) return {color:C.green, label:`${Math.round(mins)}m ago`}
  if (mins<=59) return {color:C.amber, label:`${Math.round(mins)}m ago`}
  return {color:C.red, label:`${Math.round(mins)}m ago`}
}
function getPeriodStart(p:PeriodFilter):Date {
  const n=new Date()
  if (p==='week')    { const d=new Date(n); d.setDate(n.getDate()-n.getDay()); d.setHours(0,0,0,0); return d }
  if (p==='month')   return new Date(n.getFullYear(),n.getMonth(),1)
  return new Date(n.getFullYear(),Math.floor(n.getMonth()/3)*3,1)
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────
const filterPill = (active:boolean, activeColor=C.purple):React.CSSProperties => ({
  fontSize:12, fontWeight:600, padding:'5px 13px', borderRadius:999, cursor:'pointer',
  border: active ? `1px solid ${activeColor}` : `1px solid ${C.border2}`,
  background: active ? activeColor : 'transparent',
  color: active ? '#fff' : C.text3,
})
const card:React.CSSProperties = {background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:'16px 18px'}
const inputStyle:React.CSSProperties = {fontSize:12, padding:'5px 9px', border:`1px solid ${C.border2}`, borderRadius:6, background:C.surface3, color:C.text, outline:'none', width:'100%'}
const selectStyle:React.CSSProperties = {...inputStyle, appearance:'none' as const, cursor:'pointer'}
const labelStyle:React.CSSProperties = {fontSize:10, fontWeight:700, color:C.text3, textTransform:'uppercase' as const, letterSpacing:'.07em', marginBottom:4, display:'block'}

// ─── Detail panel ─────────────────────────────────────────────────────────────
function DetailPanel({lead, detail, onSave, onClose}:{lead:Lead; detail:LeadDetail; onSave:(d:LeadDetail)=>void; onClose:()=>void}) {
  const [d, setD] = useState<LeadDetail>(detail)
  const set = (k:keyof LeadDetail) => (e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => setD(p=>({...p,[k]:e.target.value}))
  const handleSave = () => { saveDetail(lead.email,d); onSave(d); onClose() }

  const Field = ({label, children}:{label:string; children:React.ReactNode}) => (
    <div style={{display:'flex', flexDirection:'column', gap:4}}>
      <span style={labelStyle}>{label}</span>
      {children}
    </div>
  )
  const Sel = ({k, opts}:{k:keyof LeadDetail; opts:string[]}) => (
    <select value={d[k]} onChange={set(k)} style={selectStyle}>
      {opts.map(o=><option key={o} value={o}>{o||'— Select —'}</option>)}
    </select>
  )
  const Inp = ({k, placeholder}:{k:keyof LeadDetail; placeholder?:string}) => (
    <input value={d[k]} onChange={set(k)} placeholder={placeholder||''} style={inputStyle} />
  )
  const DateInp = ({k}:{k:keyof LeadDetail}) => (
    <input type="date" value={d[k]} onChange={set(k)} style={inputStyle} />
  )

  return (
    <tr>
      <td colSpan={6} style={{padding:0}}>
        <div style={{background:C.surface2, borderBottom:`1px solid ${C.border}`, padding:'20px 24px'}}>
          {/* Header */}
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20}}>
            <div>
              <div style={{fontSize:13, fontWeight:700}}>{lead.email}</div>
              <div style={{fontSize:11, color:C.text3}}>{lead.domain} {lead.sfUrl && <a href={lead.sfUrl} target="_blank" rel="noopener noreferrer" style={{color:C.green, textDecoration:'none', marginLeft:8}}>↗ Open in SF</a>}</div>
            </div>
            <div style={{display:'flex', gap:8}}>
              <button onClick={handleSave} style={{fontSize:12, fontWeight:700, padding:'7px 16px', borderRadius:7, border:'none', background:C.green, color:C.bg, cursor:'pointer'}}>Save</button>
              <button onClick={onClose} style={{fontSize:12, fontWeight:600, padding:'7px 12px', borderRadius:7, border:`1px solid ${C.border2}`, background:'transparent', color:C.text3, cursor:'pointer'}}>✕</button>
            </div>
          </div>

          {/* Row 1 — Prospect info */}
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:12, marginBottom:14}}>
            <Field label="Prospect Name"><Inp k="prospectName" placeholder="Full name" /></Field>
            <Field label="Title"><Inp k="title" placeholder="Job title" /></Field>
            <Field label="AE"><Inp k="ae" placeholder="AE name" /></Field>
            <Field label="Source Channel"><Sel k="sourceChannel" opts={SOURCE_CHANNELS} /></Field>
          </div>

          {/* Row 2 — Outreach */}
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:12, marginBottom:14}}>
            <Field label="Outreach Channel"><Sel k="outreachChannel" opts={OUTREACH_CH} /></Field>
            <Field label="Connected Date"><DateInp k="connectedDate" /></Field>
            <Field label="Meeting Booked Date"><DateInp k="meetingDate" /></Field>
            <Field label="Next Step"><Sel k="nextStep" opts={NEXT_STEPS} /></Field>
          </div>

          {/* Row 3 — Pipeline stage */}
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr 1fr', gap:12, marginBottom:14}}>
            <Field label="Next Step Status"><Sel k="nextStepStatus" opts={NEXT_STEP_STATUS} /></Field>
            <Field label="SQL / DQ"><Sel k="sqlDq" opts={SQL_OPTIONS} /></Field>
            <Field label="SQL Date"><DateInp k="sqlDate" /></Field>
            <Field label="SQO"><Sel k="sqo" opts={SQO_OPTIONS} /></Field>
            <Field label="SQO Date"><DateInp k="sqoDate" /></Field>
            <Field label="Multithreading"><Sel k="multithreading" opts={MT_OPTIONS} /></Field>
          </div>

          {/* Row 4 — ACV + Notes */}
          <div style={{display:'grid', gridTemplateColumns:'160px 1fr', gap:12}}>
            <Field label="ACV ($)"><Inp k="acv" placeholder="e.g. 72000" /></Field>
            <Field label="Notes">
              <textarea value={d.notes} onChange={e=>setD(p=>({...p,notes:e.target.value}))} placeholder="Any context, next steps, or flags…" style={{...inputStyle, height:60, resize:'vertical'}} />
            </Field>
          </div>
        </div>
      </td>
    </tr>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [leads,      setLeads]      = useState<Lead[]>([])
  const [statuses,   setStatuses]   = useState<Record<string,Status>>({})
  const [details,    setDetails]    = useState<Record<string,LeadDetail>>({})
  const [view,       setView]       = useState<View>('leads')
  const [srcFilter,  setSrcFilter]  = useState<SourceFilter>('all')
  const [stFilter,   setStFilter]   = useState<StatusFilter>('all')
  const [search,     setSearch]     = useState('')
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string|null>(null)
  const [fetchedAt,  setFetchedAt]  = useState<string|null>(null)
  const [copied,     setCopied]     = useState<string|null>(null)
  const [period,     setPeriod]     = useState<PeriodFilter>('week')
  const [worked,     setWorked]     = useState<WorkedFilter>('all')
  const [expanded,   setExpanded]   = useState<string|null>(null)

  const fetchLeads = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res=await fetch('/api/leads'); const data=await res.json()
      if (data.error) throw new Error(data.error)
      setLeads(data.leads); setFetchedAt(data.fetchedAt)
      setStatuses(getSt()); setDetails(getDetails())
    } catch(e) { setError(e instanceof Error ? e.message : 'Failed to fetch') }
    finally { setLoading(false) }
  },[])

  useEffect(()=>{ setStatuses(getSt()); setDetails(getDetails()); fetchLeads() },[fetchLeads])

  const updateStatus = (email:string, v:Status) => { saveSt(email,v); setStatuses(p=>({...p,[email]:v})) }
  const updateDetail = (email:string, d:LeadDetail) => setDetails(p=>({...p,[email]:d}))
  const copyEmail    = (email:string) => { navigator.clipboard.writeText(email).then(()=>{ setCopied(email); setTimeout(()=>setCopied(null),2000) }) }
  const toggleExpand = (email:string) => setExpanded(p=> p===email ? null : email)

  const st = getSt()

  // ── Lead view filters ────────────────────────────────────────────────────────
  const filteredLeads = leads.filter(l => {
    if (srcFilter==='sf'    && !l.sfUrl) return false
    if (srcFilter==='no-sf' &&  l.sfUrl) return false
    const s = statuses[l.email]||'new'
    if (stFilter!=='all' && s!==stFilter) return false
    if (l.date) { if (dateFrom&&l.date<dateFrom) return false; if (dateTo&&l.date>dateTo) return false }
    if (search) { const q=search.toLowerCase(); return l.email.includes(q)||l.domain.includes(q) }
    return true
  })

  // ── Pipeline data ────────────────────────────────────────────────────────────
  const periodStart    = getPeriodStart(period)
  const pipelineLeads  = leads.filter(l => {
    if (!l.receivedAt) return false
    if (new Date(l.receivedAt) < periodStart) return false
    const s = statuses[l.email]||'new'
    if (worked==='worked'   && s==='new') return false
    if (worked==='untouched'&& s!=='new') return false
    return true
  })
  const pCounts = (Object.keys(STATUS_CONFIG) as Status[]).reduce((acc,s)=>{
    acc[s]=pipelineLeads.filter(l=>(statuses[l.email]||'new')===s).length; return acc
  },{} as Record<Status,number>)

  // ── Shared nav button style ──────────────────────────────────────────────────
  const navBtn = (active:boolean):React.CSSProperties => ({
    display:'flex', alignItems:'center', gap:10, padding:'8px 20px', cursor:'pointer',
    borderLeft:`3px solid ${active?C.purple:'transparent'}`,
    background: active ? 'rgba(123,110,246,0.18)' : 'transparent',
  })

  // ── Table row renderer (shared between leads + pipeline) ─────────────────────
  const renderRow = (lead:Lead, showDetail:boolean) => {
    const s      = statuses[lead.email]||'new'
    const cfg    = STATUS_CONFIG[s]
    const dot    = getResponseDot(lead.receivedAt, s)
    const dimmed = s==='dq'||s==='na'||s==='lost'
    const det    = details[lead.email]||EMPTY_DETAIL
    const isOpen = expanded===lead.email

    const receivedDisplay = lead.receivedAt
      ? new Date(lead.receivedAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})
      : lead.date||'—'

    return (
      <>
        <tr key={lead.email} style={{borderBottom:`1px solid ${C.border}`, cursor:'pointer'}} onClick={()=>showDetail&&toggleExpand(lead.email)}>
          <td style={{padding:0, width:4}}>
            <span style={{display:'block', width:4, minHeight:46, background:STRIPE[s]}} />
          </td>
          <td style={{padding:'10px 14px', opacity:dimmed?0.5:1}}>
            <div style={{display:'flex', alignItems:'center', gap:7, flexWrap:'wrap'}}>
              <span style={{fontWeight:600, fontSize:13}}>{lead.email}</span>
              {det.prospectName && <span style={{fontSize:11, color:C.text3}}>· {det.prospectName}{det.title?`, ${det.title}`:''}</span>}
              <button onClick={e=>{e.stopPropagation();copyEmail(lead.email)}} style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,fontWeight:600,padding:'3px 9px',borderRadius:999,border:`1px solid ${copied===lead.email?C.purpleL:C.border2}`,background:copied===lead.email?'rgba(123,110,246,0.18)':C.surface3,color:copied===lead.email?C.purpleL:C.text3,cursor:'pointer'}}>
                {copied===lead.email?'✓ Copied!':'⎘ Copy'}
              </button>
            </div>
          </td>
          <td style={{padding:'10px 14px', fontSize:12, color:C.text3, opacity:dimmed?0.5:1}}>
            <div style={{display:'flex', flexDirection:'column', gap:2}}>
              <span>{lead.domain}</span>
              {det.sourceChannel && <span style={{fontSize:10, color:C.text3, background:C.surface3, borderRadius:4, padding:'1px 5px', display:'inline-block', width:'fit-content'}}>{det.sourceChannel}</span>}
            </div>
          </td>
          <td style={{padding:'10px 14px', opacity:dimmed?0.5:1}}>
            {lead.sfUrl
              ? <a href={lead.sfUrl} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:999,border:`1px solid ${C.green}`,background:'rgba(0,229,160,0.13)',color:C.green,textDecoration:'none'}}>↗ SF</a>
              : <span style={{fontSize:11,color:C.text3}}>—</span>}
          </td>
          <td style={{padding:'10px 14px', opacity:dimmed?0.5:1}}>
            <div style={{display:'flex', alignItems:'center', gap:6}}>
              {dot && <><span style={{width:7,height:7,borderRadius:'50%',background:dot.color,flexShrink:0,boxShadow:`0 0 4px ${dot.color}`}}/><span style={{fontSize:11,color:dot.color,fontWeight:600}}>{dot.label}</span></>}
              <span style={{fontSize:12,color:C.text3,whiteSpace:'nowrap'}}>{receivedDisplay}</span>
            </div>
          </td>
          <td style={{padding:'10px 14px'}}>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <div style={{position:'relative', display:'inline-flex', alignItems:'center'}}>
                <span style={{width:7,height:7,borderRadius:'50%',position:'absolute',left:10,pointerEvents:'none',background:cfg.color}}/>
                <select value={s} onChange={e=>{e.stopPropagation();updateStatus(lead.email,e.target.value as Status)}} onClick={e=>e.stopPropagation()} style={{fontSize:12,fontWeight:600,padding:'4px 10px 4px 22px',borderRadius:999,border:`1px solid ${cfg.border}`,background:cfg.dim,color:cfg.color,cursor:'pointer',outline:'none',appearance:'none'}}>
                  {(Object.keys(STATUS_CONFIG) as Status[]).map(k=><option key={k} value={k}>{STATUS_CONFIG[k].label}</option>)}
                </select>
              </div>
              {showDetail && (
                <span style={{fontSize:11, color:C.text3, userSelect:'none'}}>{isOpen?'▲':'▼'}</span>
              )}
            </div>
          </td>
        </tr>
        {showDetail && isOpen && (
          <DetailPanel
            lead={lead}
            detail={det}
            onSave={d=>updateDetail(lead.email,d)}
            onClose={()=>setExpanded(null)}
          />
        )}
      </>
    )
  }

  const tableHead = (cols:string[]) => (
    <thead>
      <tr style={{background:C.surface2, borderBottom:`1px solid ${C.border}`}}>
        <th style={{width:4,padding:0}}/>
        {cols.map(h=><th key={h} style={{textAlign:'left',padding:'10px 14px',fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',whiteSpace:'nowrap'}}>{h}</th>)}
      </tr>
    </thead>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{display:'flex', minHeight:'100vh', background:C.bg, color:C.text, fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif'}}>

      {/* ── Sidebar ── */}
      <aside style={{width:252,flexShrink:0,background:C.surface,borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',paddingBottom:24}}>
        <div style={{display:'flex',alignItems:'center',gap:11,padding:'18px 20px',borderBottom:`1px solid ${C.border}`,marginBottom:14}}>
          <div style={{width:34,height:34,borderRadius:8,background:C.green,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:800,color:C.bg,flexShrink:0}}>QW</div>
          <div>
            <div style={{fontSize:13,fontWeight:700}}>QA Wolf</div>
            <div style={{fontSize:10,fontWeight:600,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em'}}>BDR Portal</div>
          </div>
        </div>
        <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.1em',padding:'6px 20px 4px'}}>Views</div>
        {([['leads','⚡','Lead Dashboard','#bdr-routed-leads · live'],['pipeline','📊','Pipeline','Week · Month · Quarter']] as const).map(([v,icon,label,sub])=>(
          <div key={v} style={navBtn(view===v as View)} onClick={()=>setView(v as View)}>
            <div style={{width:26,height:26,borderRadius:6,background:view===v?C.purple:C.surface3,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:view===v?'#fff':C.text3,flexShrink:0}}>{icon}</div>
            <div>
              <div style={{fontSize:12,fontWeight:view===v?600:500,color:view===v?C.text:C.text2}}>{label}</div>
              <div style={{fontSize:11,color:C.text3}}>{sub}</div>
            </div>
          </div>
        ))}
        <div style={{height:1,background:C.border,margin:'10px 0'}}/>
        <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.1em',padding:'6px 20px 4px'}}>Jonathan Kim</div>
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'8px 20px'}}>
          <div style={{width:26,height:26,borderRadius:6,background:C.surface3,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:C.text3,flexShrink:0}}>SF</div>
          <div>
            <div style={{fontSize:12,fontWeight:500,color:C.text2}}>Salesforce</div>
            <div style={{fontSize:11,color:C.text3}}>qawolf1.my.salesforce.com</div>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{flex:1,padding:'30px 34px 60px',overflowX:'auto',minWidth:0}}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

        {/* ══════════════════════════════════════════════════════
            LEADS VIEW
        ══════════════════════════════════════════════════════ */}
        {view==='leads' && (<>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:16,marginBottom:10}}>
            <div>
              <div style={{fontSize:26,fontWeight:800,letterSpacing:'-0.02em',lineHeight:1.15}}>MQL Lead<br/><span style={{color:C.green}}>Dashboard.</span></div>
              <div style={{fontSize:12,color:C.text3,marginTop:4}}>Jonathan Kim · #bdr-routed-leads · live{fetchedAt&&` · refreshed ${new Date(fetchedAt).toLocaleTimeString()}`}</div>
            </div>
            <button onClick={fetchLeads} disabled={loading} style={{display:'flex',alignItems:'center',gap:7,fontSize:13,fontWeight:700,color:C.bg,background:C.green,border:'none',borderRadius:7,padding:'9px 16px',cursor:loading?'default':'pointer',opacity:loading?0.6:1,flexShrink:0}}>
              <svg width={13} height={13} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={loading?{animation:'spin 0.7s linear infinite'}:{}}><path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.5 0 2.9.6 3.9 1.6"/><path d="M10.5 1.5L13.8 4 11 6.5"/></svg>
              {loading?'Loading…':'Refresh'}
            </button>
          </div>

          <div style={{display:'flex',gap:7,marginTop:12,marginBottom:24,flexWrap:'wrap'}}>
            {([[C.green,'Live Slack data'],[C.purpleL,'Email deduped'],[C.amber,'Status persisted']] as [string,string][]).map(([color,label])=>(
              <span key={label} style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:11,fontWeight:500,color:C.text2,background:C.surface2,border:`1px solid ${C.border2}`,borderRadius:999,padding:'3px 11px'}}>
                <span style={{width:5,height:5,borderRadius:'50%',background:color,flexShrink:0}}/>{label}
              </span>
            ))}
          </div>

          {error && <div style={{display:'flex',alignItems:'center',gap:10,background:'rgba(255,92,92,0.12)',border:`1px solid ${C.red}`,borderRadius:7,padding:'10px 14px',fontSize:13,color:C.red,marginBottom:16}}>⚠ {error}</div>}

          {/* Stats */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:22}}>
            {[
              {label:'Total unique leads', value:leads.length,                                                            color:C.green,   sub:'deduped by email'},
              {label:'Contacted',          value:leads.filter(l=>(st[l.email]||'new')==='contacted').length,              color:C.purpleL, sub:'in progress'},
              {label:'Booked',             value:leads.filter(l=>(st[l.email]||'new')==='booked').length,                 color:C.green,   sub:'meetings set'},
              {label:'Nurture / Lost',     value:leads.filter(l=>['nurture','lost'].includes(st[l.email]||'new')).length, color:C.amber,   sub:'needs follow-up'},
            ].map(s=>(
              <div key={s.label} style={card}>
                <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>{s.label}</div>
                <div style={{fontSize:28,fontWeight:800,letterSpacing:'-0.03em',lineHeight:1,color:s.color}}>{s.value}</div>
                <div style={{fontSize:11,color:C.text3,marginTop:5}}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:10,flexWrap:'wrap'}}>
            <span style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em'}}>Source</span>
            {(['all','sf','no-sf'] as SourceFilter[]).map(f=>(
              <button key={f} onClick={()=>setSrcFilter(f)} style={filterPill(srcFilter===f)}>{{all:'All',sf:'Has SF link','no-sf':'No SF link'}[f]}</button>
            ))}
            <div style={{width:1,height:18,background:C.border2,flexShrink:0}}/>
            <span style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em'}}>Status</span>
            {(['all',...Object.keys(STATUS_CONFIG)] as StatusFilter[]).map(f=>{
              const cfg=f==='all'?null:STATUS_CONFIG[f as Status]
              return <button key={f} onClick={()=>setStFilter(f)} style={filterPill(stFilter===f,cfg?.color||C.purple)}>{f==='all'?'All':cfg!.label}</button>
            })}
            <div style={{marginLeft:'auto',position:'relative'}}>
              <svg style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',width:13,height:13,color:C.text3,pointerEvents:'none'}} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><circle cx={7} cy={7} r={4.5}/><path d="M11 11l2.5 2.5"/></svg>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search email or domain…" style={{fontSize:13,padding:'7px 12px 7px 30px',border:`1px solid ${C.border2}`,borderRadius:7,background:C.surface2,color:C.text,width:220,outline:'none'}}/>
            </div>
          </div>

          {/* Date row */}
          <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:14,flexWrap:'wrap'}}>
            <span style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em'}}>Date</span>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{fontSize:12,padding:'5px 10px',border:`1px solid ${C.border2}`,borderRadius:7,background:C.surface2,color:C.text2,outline:'none',width:132}}/>
            <span style={{fontSize:11,color:C.text3}}>→</span>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{fontSize:12,padding:'5px 10px',border:`1px solid ${C.border2}`,borderRadius:7,background:C.surface2,color:C.text2,outline:'none',width:132}}/>
            {(dateFrom||dateTo) && <button onClick={()=>{setDateFrom('');setDateTo('')}} style={{fontSize:11,fontWeight:600,color:C.text3,background:'none',border:'none',cursor:'pointer'}}>✕ Clear</button>}
          </div>

          {/* Table */}
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:'hidden'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              {tableHead(['Email','Domain','Salesforce','Date','Status'])}
              <tbody>
                {loading&&leads.length===0
                  ? <tr><td/><td colSpan={5} style={{textAlign:'center',padding:'52px 20px',color:C.text3,fontSize:14}}>Loading live leads from Slack…</td></tr>
                  : filteredLeads.length===0
                  ? <tr><td/><td colSpan={5} style={{textAlign:'center',padding:'52px 20px',color:C.text3,fontSize:14}}>No leads match this filter.</td></tr>
                  : filteredLeads.map(lead=>renderRow(lead, false))
                }
              </tbody>
            </table>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:14}}>
            <span style={{fontSize:12,color:C.text3}}>{filteredLeads.length} of {leads.length} leads shown</span>
            <span style={{fontSize:12,color:C.text3}}>{fetchedAt?`Live · ${new Date(fetchedAt).toLocaleTimeString()}`:'Hit Refresh to load live data'}</span>
          </div>
        </>)}

        {/* ══════════════════════════════════════════════════════
            PIPELINE VIEW
        ══════════════════════════════════════════════════════ */}
        {view==='pipeline' && (<>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:16,marginBottom:24}}>
            <div>
              <div style={{fontSize:26,fontWeight:800,letterSpacing:'-0.02em',lineHeight:1.15}}>Pipeline<br/><span style={{color:C.green}}>Overview.</span></div>
              <div style={{fontSize:12,color:C.text3,marginTop:4}}>Jonathan Kim · Click any row to expand details</div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8,alignItems:'flex-end'}}>
              <div style={{display:'flex',gap:5}}>
                {(['week','month','quarter'] as PeriodFilter[]).map(p=>(
                  <button key={p} onClick={()=>setPeriod(p)} style={filterPill(period===p)}>{{week:'This Week',month:'This Month',quarter:'This Quarter'}[p]}</button>
                ))}
              </div>
              <div style={{display:'flex',gap:5}}>
                {(['all','worked','untouched'] as WorkedFilter[]).map(w=>(
                  <button key={w} onClick={()=>setWorked(w)} style={filterPill(worked===w,C.amber)}>{{all:'All leads',worked:'Worked',untouched:'Untouched'}[w]}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:28}}>
            {[
              {label:'Total in period', value:pipelineLeads.length,   color:C.green,   sub:period},
              {label:'Booked',         value:pCounts.booked,          color:C.green,   sub:'meetings set'},
              {label:'Contacted',      value:pCounts.contacted,       color:C.purpleL, sub:'in progress'},
              {label:'Untouched',      value:pCounts.new,             color:C.amber,   sub:'needs action'},
            ].map(s=>(
              <div key={s.label} style={card}>
                <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>{s.label}</div>
                <div style={{fontSize:28,fontWeight:800,letterSpacing:'-0.03em',lineHeight:1,color:s.color}}>{s.value}</div>
                <div style={{fontSize:11,color:C.text3,marginTop:5}}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Status breakdown */}
          <div style={{...card,marginBottom:24}}>
            <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:14}}>Status breakdown</div>
            <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
              {(Object.keys(STATUS_CONFIG) as Status[]).map(s=>{
                const count=pCounts[s]
                const pct=pipelineLeads.length?Math.round(count/pipelineLeads.length*100):0
                const cfg=STATUS_CONFIG[s]
                return (
                  <div key={s} style={{display:'flex',flexDirection:'column',gap:6,minWidth:80}}>
                    <div style={{display:'flex',alignItems:'center',gap:5}}>
                      <span style={{width:8,height:8,borderRadius:'50%',background:cfg.color,flexShrink:0}}/>
                      <span style={{fontSize:11,color:C.text2}}>{cfg.label}</span>
                    </div>
                    <div style={{fontSize:22,fontWeight:800,color:cfg.color,letterSpacing:'-0.02em'}}>{count}</div>
                    <div style={{height:3,borderRadius:999,background:C.surface3,overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${pct}%`,background:cfg.color,borderRadius:999}}/>
                    </div>
                    <div style={{fontSize:10,color:C.text3}}>{pct}%</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Pipeline table — expandable */}
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:'hidden'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              {tableHead(['Email / Prospect','Domain / Source','SF','Received','Status'])}
              <tbody>
                {pipelineLeads.length===0
                  ? <tr><td/><td colSpan={5} style={{textAlign:'center',padding:'52px 20px',color:C.text3,fontSize:14}}>No leads in this period.</td></tr>
                  : pipelineLeads.map(lead=>renderRow(lead, true))
                }
              </tbody>
            </table>
          </div>
          <div style={{marginTop:14,display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:12,color:C.text3}}>{pipelineLeads.length} leads in period</span>
            <span style={{fontSize:11,color:C.text3}}>· Click any row to expand and fill in details</span>
          </div>
        </>)}
      </main>
    </div>
  )
}
