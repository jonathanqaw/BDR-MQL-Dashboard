'use client'

import { useEffect, useState, useCallback } from 'react'
import type { Lead } from '@/lib/slack'

// ─── Types ────────────────────────────────────────────────────────────────────
type Status       = 'new' | 'contacted' | 'booked' | 'nurture' | 'lost' | 'na' | 'dq'
type View         = 'pipeline' | 'analytics'
type PeriodFilter = 'week' | 'month' | 'quarter' | 'all'
type WorkedFilter = 'all' | 'worked' | 'untouched'
type StatusFilter = 'all' | Status

interface LeadDetail {
  prospectName: string; title: string; sourceChannel: string; outreachChannel: string
  connectedDate: string; meetingDate: string; nextStep: string; nextStepStatus: string
  sqlDq: string; sqlDate: string; ae: string; multithreading: string
  sqo: string; sqoDate: string; acv: string; notes: string; sfLink: string
}
interface AppLead extends Lead {
  isHistorical?: boolean
  account?: string
  isManual?: boolean
}

const EMPTY_DETAIL: LeadDetail = {
  prospectName:'', title:'', sourceChannel:'', outreachChannel:'',
  connectedDate:'', meetingDate:'', nextStep:'', nextStepStatus:'',
  sqlDq:'', sqlDate:'', ae:'', multithreading:'', sqo:'', sqoDate:'', acv:'', notes:'', sfLink:''
}

// ─── Historical records from spreadsheet ─────────────────────────────────────
const HISTORICAL_LEADS: AppLead[] = [
  { email:'logicmonitor@historical',         domain:'logicmonitor.com',        account:'LogicMonitor',             name:'Jitender Kumar Prasad',    sfUrl:null, date:'2025-12-08', receivedAt:'2025-12-08T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'kenanadvantage@historical',        domain:'kenanadvantage.com',       account:'Kenan Advantage Group',    name:'Dave Derecskey',           sfUrl:null, date:'2025-12-09', receivedAt:'2025-12-09T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'evoke@historical',                domain:'evoke.com',                account:'evoke',                    name:'Cristian Mocanu',          sfUrl:null, date:'2025-12-11', receivedAt:'2025-12-11T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'gatewayticketing@historical',     domain:'gatewayticketing.com',     account:'Gateway Ticketing',        name:'Rebecca Lathrop',          sfUrl:null, date:'2025-12-03', receivedAt:'2025-12-03T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'trackunit@historical',            domain:'trackunit.com',            account:'Trackunit',                name:'Philip Quinn',             sfUrl:null, date:'2025-12-17', receivedAt:'2025-12-17T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'harrys@historical',               domain:'harrys.com',               account:"Harry's",                  name:'Simon Anguish / Matthew Dreyer', sfUrl:null, date:'2025-12-19', receivedAt:'2025-12-19T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'decisionresources@historical',    domain:'decisionresources.com',    account:'Decision Resources Inc.',  name:'Tim McManus',              sfUrl:null, date:'2026-01-12', receivedAt:'2026-01-12T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'everydayhealth@historical',       domain:'everydayhealth.com',       account:'Everyday Health Group',    name:'Kholilur Rahman',          sfUrl:null, date:'2026-01-13', receivedAt:'2026-01-13T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'tradera@historical',              domain:'tradera.com',              account:'Tradera',                  name:'Emma Carlsson',            sfUrl:null, date:'2026-01-14', receivedAt:'2026-01-14T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'vidmob@historical',               domain:'vidmob.com',               account:'Vidmob',                   name:'Ben Holm',                 sfUrl:null, date:'2026-01-14', receivedAt:'2026-01-14T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'circlemedical@historical',        domain:'circlemedical.com',        account:'Circle Medical',           name:'Florian Denu',             sfUrl:null, date:'2026-01-20', receivedAt:'2026-01-20T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'nagarro@historical',              domain:'nagarro.com',              account:'Nagarro',                  name:'Nishant Thareja',          sfUrl:null, date:'2026-02-04', receivedAt:'2026-02-04T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'bloomcoaching@historical',        domain:'bloomcoaching.com',        account:'Bloom Coaching',           name:'Thomas Stevens',           sfUrl:null, date:'2026-01-19', receivedAt:'2026-01-19T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'f1arcade@historical',             domain:'f1arcade.com',             account:'F1 Arcade',                name:'Gavin Williams',           sfUrl:null, date:'2026-01-20', receivedAt:'2026-01-20T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'pods@historical',                 domain:'pods.com',                 account:'PODS',                     name:'Randy Withrow',            sfUrl:null, date:'2026-01-22', receivedAt:'2026-01-22T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'sharkninja@historical',           domain:'sharkninja.com',           account:'SharkNinja',               name:'Jake Rutter',              sfUrl:null, date:'2026-01-27', receivedAt:'2026-01-27T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'quince@historical',               domain:'quince.com',               account:'Quince',                   name:'Prabhanjan Jha',           sfUrl:null, date:'2026-02-04', receivedAt:'2026-02-04T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'quartr@historical',               domain:'quartr.com',               account:'Quartr',                   name:'Fabricio Vergara',         sfUrl:null, date:'2026-02-05', receivedAt:'2026-02-05T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'prophetx@historical',             domain:'prophetx.com',             account:'ProphetX',                 name:'Nathan Busscher',          sfUrl:null, date:'2026-02-17', receivedAt:'2026-02-17T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'yassir@historical',               domain:'yassir.com',               account:'Yassir',                   name:'Artem Pashkov',            sfUrl:null, date:'2026-02-18', receivedAt:'2026-02-18T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'westjet@historical',              domain:'westjet.com',              account:'WestJet',                  name:'Santhosha Chandrashekharappa', sfUrl:null, date:'2026-02-20', receivedAt:'2026-02-20T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'robbinsresearch@historical',      domain:'robbinsresearch.com',      account:'Robbins Research',         name:'Nick Jensen',              sfUrl:null, date:'2026-02-25', receivedAt:'2026-02-25T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'cradle@historical',               domain:'cradle.com',               account:'Cradle',                   name:'Melanie Burger',           sfUrl:null, date:'2026-02-25', receivedAt:'2026-02-25T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'onephase@historical',             domain:'onephase.com',             account:'onePhase',                 name:'Louis Velez',              sfUrl:null, date:'2026-03-03', receivedAt:'2026-03-03T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'novemberfive@historical',         domain:'novemberfive.com',         account:'November Five',            name:'Antonio Marquez',          sfUrl:null, date:'2026-03-05', receivedAt:'2026-03-05T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'north@historical',                domain:'north.com',                account:'North',                    name:'Forum Vyas',               sfUrl:null, date:'2026-03-05', receivedAt:'2026-03-05T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'enablecomp@historical',           domain:'enablecomp.com',           account:'EnableComp',               name:'Keith Clayton',            sfUrl:null, date:'2026-03-10', receivedAt:'2026-03-10T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'nuqleous@historical',             domain:'nuqleous.com',             account:'Nuqleous',                 name:'Steven Williams',          sfUrl:null, date:'2026-03-12', receivedAt:'2026-03-12T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'playtech@historical',             domain:'playtech.com',             account:'Playtech',                 name:'Borislav Zhezhev',         sfUrl:null, date:'2026-03-12', receivedAt:'2026-03-12T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'azets@historical',                domain:'azets.com',                account:'Azets',                    name:'Kristijonas Bulzgis',      sfUrl:null, date:'2026-03-24', receivedAt:'2026-03-24T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'jpmorganchase@historical',        domain:'jpmorganchase.com',        account:'JPMorganChase',            name:'Hikmet Tenis',             sfUrl:null, date:'2026-03-26', receivedAt:'2026-03-26T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'pex@historical',                  domain:'pex.com',                  account:'PEX',                      name:'Brandon Sim',              sfUrl:null, date:'2026-03-31', receivedAt:'2026-03-31T00:00:00.000Z', source:'bdr', isHistorical:true },
  { email:'productleague@historical',        domain:'product-league.com',       account:'Product League',           name:'Ingmar van Oostrum',       sfUrl:'https://qawolf1.lightning.force.com/lightning/r/Contact/003PA00000ZIU9yYAH/view', date:'2026-04-02', receivedAt:'2026-04-02T00:00:00.000Z', source:'bdr', isHistorical:true },
]

// Historical default statuses & details
const HISTORICAL_STATUSES: Record<string,Status> = {
  'logicmonitor@historical':      'booked',
  'kenanadvantage@historical':    'contacted',
  'evoke@historical':             'contacted',
  'gatewayticketing@historical':  'contacted',
  'trackunit@historical':         'booked',
  'harrys@historical':            'booked',
  'decisionresources@historical': 'contacted',
  'everydayhealth@historical':    'booked',
  'tradera@historical':           'dq',
  'vidmob@historical':            'booked',
  'circlemedical@historical':     'dq',
  'nagarro@historical':           'dq',
  'bloomcoaching@historical':     'booked',
  'f1arcade@historical':          'booked',
  'pods@historical':              'booked',
  'sharkninja@historical':        'booked',
  'quince@historical':            'booked',
  'quartr@historical':            'booked',
  'prophetx@historical':          'booked',
  'yassir@historical':            'lost',
  'westjet@historical':           'nurture',
  'robbinsresearch@historical':   'lost',
  'cradle@historical':            'contacted',
  'onephase@historical':          'booked',
  'novemberfive@historical':      'nurture',
  'north@historical':             'booked',
  'enablecomp@historical':        'booked',
  'nuqleous@historical':          'booked',
  'playtech@historical':          'booked',
  'azets@historical':             'nurture',
  'jpmorganchase@historical':     'contacted',
  'pex@historical':               'contacted',
  'productleague@historical':     'contacted',
}

const HISTORICAL_DETAILS: Record<string,Partial<LeadDetail>> = {
  'logicmonitor@historical':      { prospectName:'Jitender Kumar Prasad', title:'Senior Manager Business Technology', sourceChannel:'#growth-wins', outreachChannel:'LinkedIn', meetingDate:'2025-12-11', sqlDq:'Yes', sqlDate:'2026-01-12', ae:'Kathryn Hajjar', notes:'Have passed off to Kathryn for a demo with their team on Monday morning' },
  'kenanadvantage@historical':    { prospectName:'Dave Derecskey', title:'Director of Software Engineering', sourceChannel:'#growth-wins', outreachChannel:'LinkedIn', meetingDate:'2025-12-15', ae:'', nextStepStatus:'In Progress' },
  'evoke@historical':             { prospectName:'Cristian Mocanu', title:'R&D Director', sourceChannel:'#growth-wins', outreachChannel:'LinkedIn', nextStepStatus:'In Progress' },
  'gatewayticketing@historical':  { prospectName:'Rebecca Lathrop', title:'Sr. Manager of Software Development', sourceChannel:'#growth-wins', outreachChannel:'Email', nextStepStatus:'In Progress' },
  'trackunit@historical':         { prospectName:'Philip Quinn', title:'Director of Engineering', sourceChannel:'gated-content', outreachChannel:'Call', meetingDate:'2025-12-17', sqlDq:'Yes', sqlDate:'2026-01-19', ae:'Ben Barrett', multithreading:'No', notes:'Reconnection invite 2.23-2.24' },
  'harrys@historical':            { prospectName:'Simon Anguish / Matthew Dreyer', title:'Staff Engineer / Director of Engineering', sourceChannel:'gen OB', outreachChannel:'Email', meetingDate:'2025-12-19', sqlDq:'Yes', sqlDate:'2026-01-15', ae:'Devin Steinke', multithreading:'Yes', sqo:'Yes', sqoDate:'2026-02-05', acv:'84000', notes:"Came back saying they wanted to go with self-serve model. Devin trying to appeal with tooling angle." },
  'decisionresources@historical': { prospectName:'Tim McManus', title:'Director of ERP Products', sourceChannel:'QA Wolf inbox', outreachChannel:'Email', meetingDate:'2026-01-12', sqlDq:'No', ae:'Scott Wilson', multithreading:'No' },
  'everydayhealth@historical':    { prospectName:'Kholilur Rahman', title:'Associate Director, QA', sourceChannel:'#growth-wins', outreachChannel:'Email', meetingDate:'2026-01-13', sqlDq:'Yes', sqlDate:'2026-01-13', ae:'Kathryn Hajjar', multithreading:'No', sqo:'Yes', sqoDate:'2026-02-03', acv:'72000', notes:'Kholilur has looped in CEO for next call for 1.29 to do scope and sample tests.' },
  'tradera@historical':           { prospectName:'Emma Carlsson', title:'QA Lead', sourceChannel:'#leads-bot', outreachChannel:'Email', meetingDate:'2026-01-22', sqlDq:'No', multithreading:'Yes' },
  'vidmob@historical':            { prospectName:'Ben Holm', title:'Senior Director of Engineering', sourceChannel:'leads-platform waitlist', outreachChannel:'Email', meetingDate:'2026-01-15', sqlDq:'Yes', sqlDate:'2026-01-27', ae:'Jordan Van Itallie', multithreading:'No', notes:'Moving forward to second meeting 1.27.26' },
  'circlemedical@historical':     { prospectName:'Florian Denu', title:'Senior Software Developer', sourceChannel:'leads-platform waitlist', outreachChannel:'Call', meetingDate:'2026-01-22', sqlDq:'No', multithreading:'Yes', notes:'Declined after checking out webpage' },
  'nagarro@historical':           { prospectName:'Nishant Thareja', title:'Lead Automation Engineer', sourceChannel:'#leads-bot', outreachChannel:'Call', meetingDate:'2026-02-06', sqlDq:'No', ae:'Scott Wilson' },
  'bloomcoaching@historical':     { prospectName:'Thomas Stevens', title:'Mid Frontend Software Engineer', sourceChannel:'#leads-bot', outreachChannel:'Call', meetingDate:'2026-01-23', sqlDq:'Yes', sqlDate:'2026-01-23', ae:'Stephen Stabile', multithreading:'Yes' },
  'f1arcade@historical':          { prospectName:'Gavin Williams', title:'CTO', sourceChannel:'#growth-wins', outreachChannel:'Email', meetingDate:'2026-01-22', sqlDq:'Yes', sqlDate:'2026-01-22', ae:'Veronika Fischer', multithreading:'No' },
  'pods@historical':              { prospectName:'Randy Withrow', title:'Director Enterprise Applications', sourceChannel:'QA Wolf inbox', outreachChannel:'Email', meetingDate:'2026-01-27', sqlDq:'Yes', sqlDate:'2026-01-29', ae:'Charlie Pie', multithreading:'No', sqo:'Yes', sqoDate:'2026-02-05', acv:'96000', notes:'Received RFP & moving to scope + sample tests' },
  'sharkninja@historical':        { prospectName:'Jake Rutter', title:'Senior Director, Global DTC Engineering', sourceChannel:'AE assist', outreachChannel:'Email', meetingDate:'2026-01-29', sqlDq:'Yes', sqlDate:'2026-01-28', ae:'Colin O\'Connor', multithreading:'No', notes:'Colin to get back in touch with Jake at later date' },
  'quince@historical':            { prospectName:'Prabhanjan Jha', title:'Senior SDET Manager', sourceChannel:'#leads-bot', outreachChannel:'Email', meetingDate:'2026-02-12', sqlDq:'Yes', sqlDate:'2026-02-12', ae:'Veronika Fischer', multithreading:'No', notes:'Veronika waiting to hear back from leadership' },
  'quartr@historical':            { prospectName:'Fabricio Vergara', title:'Mobile Tech Lead', sourceChannel:'#leads-bot', outreachChannel:'Email', meetingDate:'2026-02-10', sqlDq:'Yes', sqlDate:'2026-02-11', ae:'Veronika Fischer', multithreading:'Yes' },
  'prophetx@historical':          { prospectName:'Nathan Busscher', title:'Chief Product Officer', sourceChannel:'leads-platform waitlist', outreachChannel:'Call', meetingDate:'2026-02-17', sqlDq:'Yes', sqlDate:'2026-02-18', ae:'Ben Barrett', multithreading:'No', sqo:'Yes', sqoDate:'2026-02-25', acv:'72000', notes:'Mike, Jun, & Ben to go through mapping and decide best approach forward' },
  'yassir@historical':            { prospectName:'Artem Pashkov', title:'Staff iOS Engineer', sourceChannel:'webinar', outreachChannel:'Call', meetingDate:'2026-02-18', sqlDq:'No', multithreading:'Yes' },
  'westjet@historical':           { prospectName:'Santhosha Chandrashekharappa', title:'Automation Specialist', sourceChannel:'#leads-bot', outreachChannel:'Call', meetingDate:'2026-02-20' },
  'robbinsresearch@historical':   { prospectName:'Nick Jensen', title:'Principal Software Architect', sourceChannel:'#leads-bot', outreachChannel:'Call', meetingDate:'2026-02-23', ae:'Jordan Van Itallie', multithreading:'Yes' },
  'cradle@historical':            { prospectName:'Melanie Burger', title:'Frontend Developer', sourceChannel:'leads-platform waitlist', outreachChannel:'Email', meetingDate:'2026-03-17', nextStepStatus:'In Progress' },
  'onephase@historical':          { prospectName:'Louis Velez', title:'Director of QA', sourceChannel:'#leads-bot', outreachChannel:'LinkedIn', meetingDate:'2026-03-06', sqlDq:'Yes', ae:'Stephen Stabile', multithreading:'Yes' },
  'novemberfive@historical':      { prospectName:'Antonio Marquez', title:'QA Lead', sourceChannel:'leads-platform waitlist', outreachChannel:'LinkedIn', meetingDate:'2026-03-18', ae:'Sally Lopez', multithreading:'Yes' },
  'north@historical':             { prospectName:'Forum Vyas', title:'Quality Assurance Manager', sourceChannel:'leads-platform waitlist', outreachChannel:'Email', meetingDate:'2026-03-17', sqlDq:'Yes', ae:'Colin O\'Connor', multithreading:'Yes' },
  'enablecomp@historical':        { prospectName:'Keith Clayton', title:'Vice President of Application Development', sourceChannel:'#growth-wins', outreachChannel:'Email', meetingDate:'2026-03-12', sqlDq:'Yes', ae:'Jason Minster', multithreading:'No' },
  'nuqleous@historical':          { prospectName:'Steven Williams', title:'Director of Analytics', sourceChannel:'leads-platform waitlist', outreachChannel:'Email', meetingDate:'2026-03-13', sqlDq:'Yes', ae:'Devin Steinke', multithreading:'Yes' },
  'playtech@historical':          { prospectName:'Borislav Zhezhev', title:'Head of Casino Delivery PMO', sourceChannel:'leads-platform waitlist', outreachChannel:'Email', meetingDate:'2026-03-13', sqlDq:'Yes', sqlDate:'2026-03-26', ae:'Veronika Fischer', multithreading:'No' },
  'azets@historical':             { prospectName:'Kristijonas Bulzgis', title:'Technical Team Manager', sourceChannel:'leads-platform waitlist', outreachChannel:'Email', meetingDate:'2026-03-25', ae:'Stephen Stabile', multithreading:'No', notes:'Booked and accepted OB + IB (webinar), but got rescheduled' },
  'jpmorganchase@historical':     { prospectName:'Hikmet Tenis', title:'SAP Principal Enterprise Architect', sourceChannel:'#leads-bot', outreachChannel:'Call', meetingDate:'2026-04-08' },
  'pex@historical':               { prospectName:'Brandon Sim', title:'QA Engineer', sourceChannel:'leads-platform waitlist', outreachChannel:'Email', meetingDate:'2026-04-02', ae:'Jordan Van Itallie', multithreading:'Yes', nextStepStatus:'Waiting for AE' },
  'productleague@historical':     { prospectName:'Ingmar van Oostrum', title:'QA Manager & Operations Lead', sourceChannel:'#growth-wins', outreachChannel:'Email', meetingDate:'2026-04-07', ae:'Jordan Van Itallie', multithreading:'Yes', nextStepStatus:'Waiting for AE' },
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

// ─── localStorage ─────────────────────────────────────────────────────────────
const getSt      = (): Record<string,Status>     => { try { return JSON.parse(localStorage.getItem('mql-st')||'{}') } catch { return {} } }
const getDetails = (): Record<string,LeadDetail> => { try { return JSON.parse(localStorage.getItem('mql-dt')||'{}') } catch { return {} } }
const saveSt     = (email:string,v:Status)       => { const s=getSt(); s[email]=v; localStorage.setItem('mql-st',JSON.stringify(s)) }
const saveDetail = (email:string,d:LeadDetail)   => { const s=getDetails(); s[email]=d; localStorage.setItem('mql-dt',JSON.stringify(s)) }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getResponseDot(receivedAt:string|null,status:Status):{color:string;label:string}|null {
  if (!receivedAt||status!=='new') return null
  const mins=(Date.now()-new Date(receivedAt).getTime())/60000
  if (new Date(receivedAt).toDateString()!==new Date().toDateString()) return null
  if (mins<=20) return {color:C.green,label:`${Math.round(mins)}m ago`}
  if (mins<=59) return {color:C.amber,label:`${Math.round(mins)}m ago`}
  return {color:C.red,label:`${Math.round(mins)}m ago`}
}
// Convert email domain to readable company name: product-league.com → Product League
function formatDomain(domain:string):string {
  const base=domain.replace(/\.(com|io|co|net|org|ai|app|dev|inc|us|uk|ca|au)$/i,'').replace(/\.(co)$/i,'')
  return base.split(/[-_.]/).map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ')
}

function getPeriodStart(p:PeriodFilter):Date {
  if (p==='all') return new Date('2020-01-01')
  const n=new Date()
  if (p==='week') { const d=new Date(n); d.setDate(n.getDate()-n.getDay()); d.setHours(0,0,0,0); return d }
  if (p==='month') return new Date(n.getFullYear(),n.getMonth(),1)
  return new Date(n.getFullYear(),Math.floor(n.getMonth()/3)*3,1)
}
function getWeekLabel(date:Date):string {
  const d=new Date(date); d.setDate(d.getDate()-d.getDay())
  return `${d.toLocaleString('en-US',{month:'short'})} ${d.getDate()}`
}
function getMonthLabel(date:Date):string {
  return date.toLocaleString('en-US',{month:'short',year:'2-digit'})
}

const filterPill=(active:boolean,activeColor=C.purple):React.CSSProperties=>({
  fontSize:12,fontWeight:600,padding:'5px 13px',borderRadius:999,cursor:'pointer',
  border:active?`1px solid ${activeColor}`:`1px solid ${C.border2}`,
  background:active?activeColor:'transparent', color:active?'#fff':C.text3,
})
const card:React.CSSProperties={background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'16px 18px'}
const inputStyle:React.CSSProperties={fontSize:12,padding:'5px 9px',border:`1px solid ${C.border2}`,borderRadius:6,background:C.surface3,color:C.text,outline:'none',width:'100%'}
const selectStyle:React.CSSProperties={...inputStyle,appearance:'none' as const,cursor:'pointer'}
const labelStyle:React.CSSProperties={fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase' as const,letterSpacing:'.07em',marginBottom:4,display:'block'}

// ─── Detail Panel ─────────────────────────────────────────────────────────────
function DetailPanel({lead,detail,onSave,onClose}:{lead:AppLead;detail:LeadDetail;onSave:(d:LeadDetail)=>void;onClose:()=>void}) {
  const [d,setD]=useState<LeadDetail>(detail)
  const set=(k:keyof LeadDetail)=>(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>setD(p=>({...p,[k]:e.target.value}))
  const handleSave=()=>{saveDetail(lead.email,d);onSave(d);onClose()}
  const Field=({label,children}:{label:string;children:React.ReactNode})=>(
    <div style={{display:'flex',flexDirection:'column',gap:4}}><span style={labelStyle}>{label}</span>{children}</div>
  )
  const Sel=({k,opts}:{k:keyof LeadDetail;opts:string[]})=>(
    <select value={d[k]} onChange={set(k)} style={selectStyle}>{opts.map(o=><option key={o} value={o}>{o||'— Select —'}</option>)}</select>
  )
  const Inp=({k,placeholder}:{k:keyof LeadDetail;placeholder?:string})=>(
    <input value={d[k]} onChange={set(k)} placeholder={placeholder||''} style={inputStyle}/>
  )
  const DateInp=({k}:{k:keyof LeadDetail})=>(
    <input type="date" value={d[k]} onChange={set(k)} style={inputStyle}/>
  )
  return (
    <tr>
      <td colSpan={6} style={{padding:0}}>
        <div style={{background:C.surface2,borderBottom:`1px solid ${C.border}`,padding:'20px 24px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
            <div>
              <div style={{fontSize:13,fontWeight:700}}>{lead.account||lead.email}</div>
              <div style={{fontSize:11,color:C.text3}}>{lead.isHistorical?'Historical record':lead.email} {lead.sfUrl&&<a href={lead.sfUrl} target="_blank" rel="noopener noreferrer" style={{color:C.green,textDecoration:'none',marginLeft:8}}>↗ Open in SF</a>}</div>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={handleSave} style={{fontSize:12,fontWeight:700,padding:'7px 16px',borderRadius:7,border:'none',background:C.green,color:C.bg,cursor:'pointer'}}>Save</button>
              <button onClick={onClose} style={{fontSize:12,fontWeight:600,padding:'7px 12px',borderRadius:7,border:`1px solid ${C.border2}`,background:'transparent',color:C.text3,cursor:'pointer'}}>✕</button>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:12,marginBottom:14}}>
            <Field label="Prospect Name"><Inp k="prospectName" placeholder="Full name"/></Field>
            <Field label="Title"><Inp k="title" placeholder="Job title"/></Field>
            <Field label="AE"><Inp k="ae" placeholder="AE name"/></Field>
            <Field label="Source Channel"><Sel k="sourceChannel" opts={SOURCE_CHANNELS}/></Field>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:12,marginBottom:14}}>
            <Field label="Outreach Channel"><Sel k="outreachChannel" opts={OUTREACH_CH}/></Field>
            <Field label="Connected Date"><DateInp k="connectedDate"/></Field>
            <Field label="Meeting Booked Date"><DateInp k="meetingDate"/></Field>
            <Field label="Next Step"><Sel k="nextStep" opts={NEXT_STEPS}/></Field>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr 1fr',gap:12,marginBottom:14}}>
            <Field label="Next Step Status"><Sel k="nextStepStatus" opts={NEXT_STEP_STATUS}/></Field>
            <Field label="SQL / DQ"><Sel k="sqlDq" opts={SQL_OPTIONS}/></Field>
            <Field label="SQL Date"><DateInp k="sqlDate"/></Field>
            <Field label="SQO"><Sel k="sqo" opts={SQO_OPTIONS}/></Field>
            <Field label="SQO Date"><DateInp k="sqoDate"/></Field>
            <Field label="Multithreading"><Sel k="multithreading" opts={MT_OPTIONS}/></Field>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'160px 260px 1fr',gap:12}}>
            <Field label="ACV ($)"><Inp k="acv" placeholder="e.g. 72000"/></Field>
            <Field label="Salesforce Link"><Inp k="sfLink" placeholder="https://qawolf1.lightning.force.com/…"/></Field>
            <Field label="Notes">
              <textarea value={d.notes} onChange={e=>setD(p=>({...p,notes:e.target.value}))} placeholder="Any context, next steps, or flags…" style={{...inputStyle,height:60,resize:'vertical'}}/>
            </Field>
          </div>
        </div>
      </td>
    </tr>
  )
}

// ─── Simple SVG chart primitives ──────────────────────────────────────────────
function PieChart({data}:{data:{label:string;value:number;color:string}[]}) {
  const total=data.reduce((s,d)=>s+d.value,0)
  if (total===0) return <div style={{textAlign:'center',color:C.text3,fontSize:12,padding:'40px 0'}}>No data for this period</div>
  let angle=-Math.PI/2
  const slices=data.filter(d=>d.value>0).map(d=>{
    const pct=d.value/total; const start=angle; angle+=pct*2*Math.PI
    return {...d,pct,start,end:angle}
  })
  const arc=(cx:number,cy:number,r:number,start:number,end:number)=>{
    if (end-start>=2*Math.PI-0.001) return `M${cx},${cy-r} A${r},${r},0,1,1,${cx-0.001},${cy-r} Z`
    const x1=cx+r*Math.cos(start),y1=cy+r*Math.sin(start)
    const x2=cx+r*Math.cos(end),y2=cy+r*Math.sin(end)
    const large=end-start>Math.PI?1:0
    return `M${cx},${cy} L${x1},${y1} A${r},${r},0,${large},1,${x2},${y2} Z`
  }
  return (
    <div style={{display:'flex',alignItems:'center',gap:28,flexWrap:'wrap'}}>
      <svg width={160} height={160} viewBox="0 0 160 160">
        {slices.map((s,i)=><path key={i} d={arc(80,80,72,s.start,s.end)} fill={s.color} stroke={C.surface} strokeWidth={2}/>)}
        <circle cx={80} cy={80} r={36} fill={C.surface}/>
        <text x={80} y={76} textAnchor="middle" fill={C.text} fontSize={22} fontWeight={800}>{total}</text>
        <text x={80} y={93} textAnchor="middle" fill={C.text3} fontSize={10}>total</text>
      </svg>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {slices.map((s,i)=>(
          <div key={i} style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{width:10,height:10,borderRadius:'50%',background:s.color,flexShrink:0}}/>
            <span style={{fontSize:12,color:C.text2,minWidth:80}}>{s.label}</span>
            <span style={{fontSize:13,fontWeight:700,color:s.color}}>{s.value}</span>
            <span style={{fontSize:11,color:C.text3}}>{Math.round(s.pct*100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BarChart({bars,title}:{bars:{label:string;values:{status:Status;count:number}[];total:number}[];title:string}) {
  const maxTotal=Math.max(...bars.map(b=>b.total),1)
  const statuses:Status[]=['new','contacted','booked','nurture','lost','dq']
  return (
    <div>
      <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:14}}>{title}</div>
      <div style={{display:'flex',alignItems:'flex-end',gap:8,height:140}}>
        {bars.map((b,i)=>(
          <div key={i} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,flex:1}}>
            <span style={{fontSize:10,color:C.text3,fontWeight:600}}>{b.total||''}</span>
            <div style={{width:'100%',display:'flex',flexDirection:'column',justifyContent:'flex-end',height:120,borderRadius:4,overflow:'hidden',background:C.surface3}}>
              {statuses.map(s=>{
                const v=b.values.find(x=>x.status===s)?.count||0
                if (!v) return null
                const h=Math.round((v/maxTotal)*120)
                return <div key={s} style={{width:'100%',height:h,background:STATUS_CONFIG[s].color,flexShrink:0}}/>
              })}
            </div>
            <span style={{fontSize:10,color:C.text3,whiteSpace:'nowrap'}}>{b.label}</span>
          </div>
        ))}
      </div>
      {/* Legend */}
      <div style={{display:'flex',gap:12,marginTop:12,flexWrap:'wrap'}}>
        {statuses.map(s=>(
          <div key={s} style={{display:'flex',alignItems:'center',gap:4}}>
            <span style={{width:8,height:8,borderRadius:2,background:STATUS_CONFIG[s].color,flexShrink:0}}/>
            <span style={{fontSize:10,color:C.text3}}>{STATUS_CONFIG[s].label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Create Contact Modal ─────────────────────────────────────────────────────
function CreateContactModal({onSave,onClose}:{onSave:(account:string,email:string,domain:string)=>void;onClose:()=>void}) {
  const [account,setAccount]=useState('')
  const [email,setEmail]=useState('')
  const [domain,setDomain]=useState('')

  // Auto-derive domain from email
  const handleEmail=(v:string)=>{
    setEmail(v)
    const d=v.includes('@')?v.split('@')[1]:''
    if (d) setDomain(d)
  }

  const canSave=account.trim()&&email.trim()

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}} onClick={onClose}>
      <div style={{background:C.surface,border:`1px solid ${C.border2}`,borderRadius:12,padding:28,width:440,boxShadow:'0 24px 60px rgba(0,0,0,0.5)'}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:18,fontWeight:800,marginBottom:4}}>Create Contact</div>
        <div style={{fontSize:12,color:C.text3,marginBottom:20}}>Manually add a lead not sourced from Slack</div>

        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div>
            <span style={labelStyle}>Account Name *</span>
            <input value={account} onChange={e=>setAccount(e.target.value)} placeholder="e.g. Acme Corp" style={inputStyle}/>
          </div>
          <div>
            <span style={labelStyle}>Email *</span>
            <input value={email} onChange={e=>handleEmail(e.target.value)} placeholder="prospect@company.com" style={inputStyle}/>
          </div>
          <div>
            <span style={labelStyle}>Domain</span>
            <input value={domain} onChange={e=>setDomain(e.target.value)} placeholder="company.com" style={inputStyle}/>
          </div>
        </div>

        <div style={{display:'flex',gap:8,marginTop:24,justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{fontSize:12,fontWeight:600,padding:'8px 16px',borderRadius:7,border:`1px solid ${C.border2}`,background:'transparent',color:C.text3,cursor:'pointer'}}>Cancel</button>
          <button onClick={()=>canSave&&onSave(account.trim(),email.trim(),domain.trim()||email.split('@')[1]||'')} disabled={!canSave} style={{fontSize:12,fontWeight:700,padding:'8px 18px',borderRadius:7,border:'none',background:canSave?C.green:'rgba(0,229,160,0.3)',color:C.bg,cursor:canSave?'pointer':'default'}}>
            Create Contact
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [liveLeads,  setLiveLeads]  = useState<AppLead[]>([])
  const [statuses,   setStatuses]   = useState<Record<string,Status>>({})
  const [details,    setDetails]    = useState<Record<string,LeadDetail>>({})
  const [view,       setView]       = useState<View>('pipeline')
  const [period,     setPeriod]     = useState<PeriodFilter>('all')
  const [worked,     setWorked]     = useState<WorkedFilter>('all')
  const [stFilter,   setStFilter]   = useState<StatusFilter>('all')
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string|null>(null)
  const [fetchedAt,  setFetchedAt]  = useState<string|null>(null)
  const [copied,     setCopied]     = useState<string|null>(null)
  const [expanded,   setExpanded]   = useState<string|null>(null)
  const [chartPeriod,setChartPeriod]= useState<'week'|'month'>('week')
  const [showCreate, setShowCreate] = useState(false)
  const [manualLeads,setManualLeads]= useState<AppLead[]>([])

  const getManualLeads=():AppLead[]=>{ try { return JSON.parse(localStorage.getItem('mql-manual')||'[]') } catch { return [] } }
  const saveManualLeads=(leads:AppLead[])=>{ localStorage.setItem('mql-manual',JSON.stringify(leads)) }

  // Seed historical statuses & details into localStorage on first load
  useEffect(()=>{
    const st=getSt(); const dt=getDetails(); let stDirty=false; let dtDirty=false
    HISTORICAL_LEADS.forEach(l=>{
      if (!st[l.email]) { st[l.email]=HISTORICAL_STATUSES[l.email]||'new'; stDirty=true }
      if (!dt[l.email]) {
        const hd=HISTORICAL_DETAILS[l.email]||{}
        dt[l.email]={...EMPTY_DETAIL,...hd}
        dtDirty=true
      }
    })
    if (stDirty) localStorage.setItem('mql-st',JSON.stringify(st))
    if (dtDirty) localStorage.setItem('mql-dt',JSON.stringify(dt))
    setManualLeads(getManualLeads())
  },[])

  const fetchLeads=useCallback(async()=>{
    setLoading(true); setError(null)
    try {
      const res=await fetch('/api/leads'); const data=await res.json()
      if (data.error) throw new Error(data.error)
      setLiveLeads(data.leads); setFetchedAt(data.fetchedAt)
      setStatuses(getSt()); setDetails(getDetails())
    } catch(e) { setError(e instanceof Error?e.message:'Failed to fetch') }
    finally { setLoading(false) }
  },[])

  useEffect(()=>{ setStatuses(getSt()); setDetails(getDetails()); fetchLeads() },[fetchLeads])

  const updateStatus=(email:string,v:Status)=>{ saveSt(email,v); setStatuses(p=>({...p,[email]:v})) }
  const updateDetail=(email:string,d:LeadDetail)=>setDetails(p=>({...p,[email]:d}))
  const copyEmail=(email:string)=>{ navigator.clipboard.writeText(email).then(()=>{ setCopied(email); setTimeout(()=>setCopied(null),2000) }) }

  const createContact=(account:string,email:string,domain:string)=>{
    const newLead:AppLead={ email, domain, account, name:null, sfUrl:null, date:new Date().toISOString().split('T')[0], receivedAt:new Date().toISOString(), source:'bdr', isManual:true }
    const updated=[...manualLeads,newLead]
    setManualLeads(updated); saveManualLeads(updated)
    saveSt(email,'new')
    setStatuses(p=>({...p,[email]:'new'}))
    setShowCreate(false)
  }

  // All leads = historical + manual + live (deduped by email)
  const allLeads:AppLead[]=[
    ...HISTORICAL_LEADS,
    ...manualLeads.filter(l=>!HISTORICAL_LEADS.some(h=>h.email===l.email)),
    ...liveLeads.filter(l=>!HISTORICAL_LEADS.some(h=>h.email===l.email)&&!manualLeads.some(m=>m.email===l.email)),
  ]

  // ── Pipeline filters ────────────────────────────────────────────────────────
  const periodStart=getPeriodStart(period)
  const pipelineLeads=allLeads.filter(l=>{
    if (!l.receivedAt) return false
    if (new Date(l.receivedAt)<periodStart) return false
    const s=statuses[l.email]||'new'
    if (worked==='worked'&&s==='new') return false
    if (worked==='untouched'&&s!=='new') return false
    if (stFilter!=='all'&&s!==stFilter) return false
    return true
  })

  const pCounts=(Object.keys(STATUS_CONFIG) as Status[]).reduce((acc,s)=>{
    acc[s]=allLeads.filter(l=>{
      if (!l.receivedAt||new Date(l.receivedAt)<periodStart) return false
      return (statuses[l.email]||'new')===s
    }).length
    return acc
  },{} as Record<Status,number>)

  // SQL and SQO counts — driven by detail fields, scoped to period
  const sqlCount=allLeads.filter(l=>{
    if (!l.receivedAt||new Date(l.receivedAt)<periodStart) return false
    return (details[l.email]?.sqlDq||'')==='Yes'
  }).length
  const sqoCount=allLeads.filter(l=>{
    if (!l.receivedAt||new Date(l.receivedAt)<periodStart) return false
    return (details[l.email]?.sqo||'')==='Yes'
  }).length
  const sqlAllTime=allLeads.filter(l=>(details[l.email]?.sqlDq||'')==='Yes').length
  const sqoAllTime=allLeads.filter(l=>(details[l.email]?.sqo||'')==='Yes').length

  // ── Analytics data ──────────────────────────────────────────────────────────
  // Pie: all-time status breakdown
  const pieData=(Object.keys(STATUS_CONFIG) as Status[])
    .map(s=>({label:STATUS_CONFIG[s].label,value:allLeads.filter(l=>(statuses[l.email]||'new')===s).length,color:STATUS_CONFIG[s].color}))
    .filter(d=>d.value>0)

  // Bar: group leads by week or month, stacked by status
  const buildBars=(groupBy:'week'|'month')=>{
    const groups=new Map<string,{label:string;date:Date;byStatus:Record<Status,number>}>()
    allLeads.forEach(l=>{
      if (!l.receivedAt) return
      const d=new Date(l.receivedAt)
      const key=groupBy==='week'?getWeekLabel(d):getMonthLabel(d)
      if (!groups.has(key)) groups.set(key,{label:key,date:d,byStatus:{new:0,contacted:0,booked:0,nurture:0,lost:0,dq:0,na:0}})
      const s=statuses[l.email]||'new'
      groups.get(key)!.byStatus[s]++
    })
    return Array.from(groups.values())
      .sort((a,b)=>a.date.getTime()-b.date.getTime())
      .slice(-12)
      .map(g=>({
        label:g.label,
        total:Object.values(g.byStatus).reduce((s,v)=>s+v,0),
        values:(Object.keys(g.byStatus) as Status[]).map(s=>({status:s,count:g.byStatus[s]}))
      }))
  }

  // ── Row renderer ─────────────────────────────────────────────────────────────
  const renderRow=(lead:AppLead)=>{
    const s=statuses[lead.email]||'new'
    const cfg=STATUS_CONFIG[s]
    const dot=getResponseDot(lead.receivedAt,s)
    const dimmed=s==='dq'||s==='na'||s==='lost'
    const det=details[lead.email]||{...EMPTY_DETAIL,...(HISTORICAL_DETAILS[lead.email]||{})}
    const isOpen=expanded===lead.email
    const displayName=lead.account||(det.prospectName?det.prospectName:lead.domain?formatDomain(lead.domain):lead.email)
    const receivedDisplay=lead.receivedAt
      ? new Date(lead.receivedAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:lead.isHistorical?undefined:'numeric',minute:lead.isHistorical?undefined:'2-digit'})
      : lead.date||'—'

    return (
      <>
        <tr key={lead.email} style={{borderBottom:`1px solid ${C.border}`,cursor:'pointer'}} onClick={()=>setExpanded(p=>p===lead.email?null:lead.email)}>
          <td style={{padding:0,width:4}}><span style={{display:'block',width:4,minHeight:46,background:STRIPE[s]}}/></td>
          <td style={{padding:'10px 14px',opacity:dimmed?0.5:1}}>
            <div style={{display:'flex',alignItems:'center',gap:7,flexWrap:'wrap'}}>
              <span style={{fontWeight:600,fontSize:13}}>{displayName}</span>
              {lead.isHistorical&&<span style={{fontSize:10,color:C.text3,background:C.surface3,borderRadius:4,padding:'1px 6px'}}>historical</span>}
              {lead.isManual&&<span style={{fontSize:10,color:C.amber,background:'rgba(245,166,35,0.12)',borderRadius:4,padding:'1px 6px',border:`1px solid rgba(245,166,35,0.3)`}}>manual</span>}
              {det.prospectName&&!lead.isHistorical&&!lead.isManual&&<span style={{fontSize:11,color:C.text3}}>· {det.prospectName}</span>}
              {!lead.isHistorical&&(
                <button onClick={e=>{e.stopPropagation();copyEmail(lead.email)}} style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,fontWeight:600,padding:'3px 9px',borderRadius:999,border:`1px solid ${copied===lead.email?C.purpleL:C.border2}`,background:copied===lead.email?'rgba(123,110,246,0.18)':C.surface3,color:copied===lead.email?C.purpleL:C.text3,cursor:'pointer'}}>
                  {copied===lead.email?'✓ Copied!':'⎘ Copy'}
                </button>
              )}
            </div>
            {det.title&&<div style={{fontSize:11,color:C.text3,marginTop:2}}>{det.title}</div>}
          </td>
          <td style={{padding:'10px 14px',fontSize:12,color:C.text3,opacity:dimmed?0.5:1}}>
            <div style={{display:'flex',flexDirection:'column',gap:2}}>
              <span>{lead.domain}</span>
              {det.sourceChannel&&<span style={{fontSize:10,color:C.text3,background:C.surface3,borderRadius:4,padding:'1px 5px',display:'inline-block',width:'fit-content'}}>{det.sourceChannel}</span>}
            </div>
          </td>
          <td style={{padding:'10px 14px',opacity:dimmed?0.5:1}}>
            {(lead.sfUrl||det.sfLink)
              ? <a href={lead.sfUrl||det.sfLink} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:999,border:`1px solid ${C.green}`,background:'rgba(0,229,160,0.13)',color:C.green,textDecoration:'none'}}>↗ SF</a>
              : <span style={{fontSize:11,color:C.text3}}>—</span>}
          </td>
          <td style={{padding:'10px 14px',opacity:dimmed?0.5:1}}>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              {dot&&<><span style={{width:7,height:7,borderRadius:'50%',background:dot.color,flexShrink:0,boxShadow:`0 0 4px ${dot.color}`}}/><span style={{fontSize:11,color:dot.color,fontWeight:600}}>{dot.label}</span></>}
              <span style={{fontSize:12,color:C.text3,whiteSpace:'nowrap'}}>{receivedDisplay}</span>
            </div>
          </td>
          <td style={{padding:'10px 14px'}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{position:'relative',display:'inline-flex',alignItems:'center'}}>
                <span style={{width:7,height:7,borderRadius:'50%',position:'absolute',left:10,pointerEvents:'none',background:cfg.color}}/>
                <select value={s} onChange={e=>{e.stopPropagation();updateStatus(lead.email,e.target.value as Status)}} onClick={e=>e.stopPropagation()} style={{fontSize:12,fontWeight:600,padding:'4px 10px 4px 22px',borderRadius:999,border:`1px solid ${cfg.border}`,background:cfg.dim,color:cfg.color,cursor:'pointer',outline:'none',appearance:'none'}}>
                  {(Object.keys(STATUS_CONFIG) as Status[]).map(k=><option key={k} value={k}>{STATUS_CONFIG[k].label}</option>)}
                </select>
              </div>
              <span style={{fontSize:11,color:C.text3}}>{isOpen?'▲':'▼'}</span>
            </div>
          </td>
        </tr>
        {isOpen&&(
          <DetailPanel
            lead={lead}
            detail={{...EMPTY_DETAIL,...(HISTORICAL_DETAILS[lead.email]||{}),...(details[lead.email]||{})}}
            onSave={d=>updateDetail(lead.email,d)}
            onClose={()=>setExpanded(null)}
          />
        )}
      </>
    )
  }

  const navBtn=(active:boolean):React.CSSProperties=>({
    display:'flex',alignItems:'center',gap:10,padding:'8px 20px',cursor:'pointer',
    borderLeft:`3px solid ${active?C.purple:'transparent'}`,
    background:active?'rgba(123,110,246,0.18)':'transparent',
  })

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{display:'flex',minHeight:'100vh',background:C.bg,color:C.text,fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif'}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

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
        {([['pipeline','📊','Pipeline','MQL tracking · expandable'],['analytics','📈','Analytics','Charts · trends · breakdown']] as const).map(([v,icon,label,sub])=>(
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
        <div style={{height:1,background:C.border,margin:'10px 0'}}/>
        <div style={{padding:'8px 20px'}}>
          <button onClick={fetchLeads} disabled={loading} style={{display:'flex',alignItems:'center',gap:7,fontSize:12,fontWeight:700,color:C.bg,background:C.green,border:'none',borderRadius:7,padding:'8px 14px',cursor:loading?'default':'pointer',opacity:loading?0.6:1,width:'100%',justifyContent:'center'}}>
            <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={loading?{animation:'spin 0.7s linear infinite'}:{}}><path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.5 0 2.9.6 3.9 1.6"/><path d="M10.5 1.5L13.8 4 11 6.5"/></svg>
            {loading?'Refreshing…':'Refresh Leads'}
          </button>
          {fetchedAt&&<div style={{fontSize:10,color:C.text3,textAlign:'center',marginTop:6}}>{new Date(fetchedAt).toLocaleTimeString()}</div>}
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{flex:1,padding:'30px 34px 60px',overflowX:'auto',minWidth:0}}>

        {/* ══════════════════════════════════════════════════════
            PIPELINE VIEW
        ══════════════════════════════════════════════════════ */}
        {view==='pipeline'&&(<>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:16,marginBottom:24}}>
            <div>
              <div style={{fontSize:26,fontWeight:800,letterSpacing:'-0.02em',lineHeight:1.15}}>Pipeline<br/><span style={{color:C.green}}>Overview.</span></div>
              <div style={{fontSize:12,color:C.text3,marginTop:4}}>Jonathan Kim · {allLeads.length} total leads · click any row to expand</div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8,alignItems:'flex-end'}}>
              <div style={{display:'flex',gap:5}}>
                {(['all','week','month','quarter'] as PeriodFilter[]).map(p=>(
                  <button key={p} onClick={()=>{setPeriod(p);setStFilter('all')}} style={filterPill(period===p)}>{{all:'All Time',week:'This Week',month:'This Month',quarter:'This Quarter'}[p]}</button>
                ))}
              </div>
              <div style={{display:'flex',gap:5,alignItems:'center'}}>
                {(['all','worked','untouched'] as WorkedFilter[]).map(w=>(
                  <button key={w} onClick={()=>setWorked(w)} style={filterPill(worked===w,C.amber)}>{{all:'All leads',worked:'Worked',untouched:'Untouched'}[w]}</button>
                ))}
                <button onClick={()=>setShowCreate(true)} style={{fontSize:12,fontWeight:700,padding:'5px 14px',borderRadius:999,border:`1px solid ${C.green}`,background:'rgba(0,229,160,0.13)',color:C.green,cursor:'pointer'}}>+ Contact</button>
              </div>
            </div>
          </div>

          {error&&<div style={{display:'flex',alignItems:'center',gap:10,background:'rgba(255,92,92,0.12)',border:`1px solid ${C.red}`,borderRadius:7,padding:'10px 14px',fontSize:13,color:C.red,marginBottom:16}}>⚠ {error}</div>}

          {/* Summary cards — clickable to filter */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:12,marginBottom:20}}>
            {[
              {label:'Total in period', value:Object.values(pCounts).reduce((s,v)=>s+v,0), color:C.green,   sub:period,          filter:'all'      as StatusFilter},
              {label:'Booked',          value:pCounts.booked,                                color:C.green,   sub:'meetings set',  filter:'booked'   as StatusFilter},
              {label:'Contacted',       value:pCounts.contacted,                             color:C.purpleL, sub:'in progress',   filter:'contacted' as StatusFilter},
              {label:'Untouched',       value:pCounts.new,                                   color:C.amber,   sub:'needs action',  filter:'new'      as StatusFilter},
              {label:'SQLs',            value:sqlCount,                                      color:'#60d4f4',  sub:'qualified',     filter:'all'      as StatusFilter},
              {label:'SQOs',            value:sqoCount,                                      color:'#c084fc',  sub:'opp created',   filter:'all'      as StatusFilter},
            ].map(s=>(
              <div key={s.label} onClick={()=>s.filter!=='all'||s.label==='Total in period'?setStFilter(f=>f===s.filter&&s.label!=='Total in period'?'all':s.filter):undefined} style={{...card,cursor:s.label==='SQLs'||s.label==='SQOs'?'default':'pointer',border:`1px solid ${stFilter===s.filter&&s.label!=='SQLs'&&s.label!=='SQOs'&&s.label!=='Total in period'?s.color:C.border}`,transition:'border 0.15s'}}>
                <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>{s.label}</div>
                <div style={{fontSize:24,fontWeight:800,letterSpacing:'-0.03em',lineHeight:1,color:s.color}}>{s.value}</div>
                <div style={{fontSize:11,color:C.text3,marginTop:5}}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Status breakdown — clickable */}
          <div style={{...card,marginBottom:20}}>
            <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:14}}>
              Status breakdown · <span style={{fontWeight:400,textTransform:'none',letterSpacing:'normal'}}>click to filter · SQL and SQO from detail fields</span>
            </div>
            <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'flex-start'}}>
              {(Object.keys(STATUS_CONFIG) as Status[]).map(s=>{
                const count=pCounts[s]
                const pct=Object.values(pCounts).reduce((a,b)=>a+b,0)?Math.round(count/Object.values(pCounts).reduce((a,b)=>a+b,0)*100):0
                const cfg=STATUS_CONFIG[s]
                const active=stFilter===s
                return (
                  <div key={s} onClick={()=>setStFilter(f=>f===s?'all':s)} style={{display:'flex',flexDirection:'column',gap:6,minWidth:72,cursor:'pointer',padding:'8px 10px',borderRadius:8,border:`1px solid ${active?cfg.color:C.border}`,background:active?cfg.dim:'transparent',transition:'all 0.15s'}}>
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
              {/* SQL + SQO tiles */}
              {[
                {label:'SQL',value:sqlCount,color:'#60d4f4',sub:'SQL / DQ = Yes'},
                {label:'SQO',value:sqoCount,color:'#c084fc',sub:'SQO = Yes'},
              ].map(s=>(
                <div key={s.label} style={{display:'flex',flexDirection:'column',gap:6,minWidth:72,padding:'8px 10px',borderRadius:8,border:`1px solid rgba(255,255,255,0.07)`,background:'transparent'}}>
                  <div style={{display:'flex',alignItems:'center',gap:5}}>
                    <span style={{width:8,height:8,borderRadius:'50%',background:s.color,flexShrink:0}}/>
                    <span style={{fontSize:11,color:C.text2}}>{s.label}</span>
                  </div>
                  <div style={{fontSize:22,fontWeight:800,color:s.color,letterSpacing:'-0.02em'}}>{s.value}</div>
                  <div style={{fontSize:10,color:C.text3}}>{s.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Lead table */}
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,overflow:'hidden'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:C.surface2,borderBottom:`1px solid ${C.border}`}}>
                  <th style={{width:4,padding:0}}/>
                  {['Account / Email','Domain / Source','SF','Date','Status'].map(h=>(
                    <th key={h} style={{textAlign:'left',padding:'10px 14px',fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading&&liveLeads.length===0
                  ? <tr><td/><td colSpan={5} style={{textAlign:'center',padding:'52px 20px',color:C.text3,fontSize:14}}>Loading live leads from Slack…</td></tr>
                  : pipelineLeads.length===0
                  ? <tr><td/><td colSpan={5} style={{textAlign:'center',padding:'52px 20px',color:C.text3,fontSize:14}}>No leads match this filter.</td></tr>
                  : pipelineLeads.map(lead=>renderRow(lead))
                }
              </tbody>
            </table>
          </div>
          <div style={{marginTop:14,display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:12,color:C.text3}}>{pipelineLeads.length} leads shown</span>
            {stFilter!=='all'&&<button onClick={()=>setStFilter('all')} style={{fontSize:11,fontWeight:600,color:C.text3,background:'none',border:`1px solid ${C.border2}`,borderRadius:999,padding:'2px 10px',cursor:'pointer'}}>✕ Clear filter</button>}
          </div>
        </>)}

        {/* ══════════════════════════════════════════════════════
            ANALYTICS VIEW
        ══════════════════════════════════════════════════════ */}
        {view==='analytics'&&(<>
          <div style={{marginBottom:28}}>
            <div style={{fontSize:26,fontWeight:800,letterSpacing:'-0.02em',lineHeight:1.15}}>Analytics<br/><span style={{color:C.green}}>& Trends.</span></div>
            <div style={{fontSize:12,color:C.text3,marginTop:4}}>Jonathan Kim · all-time performance</div>
          </div>

          {/* Top stats */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:12,marginBottom:28}}>
            {[
              {label:'Total leads',  value:allLeads.length,                                                              color:C.green,   sub:'all time'},
              {label:'Booked',       value:allLeads.filter(l=>(statuses[l.email]||'new')==='booked').length,             color:C.green,   sub:'meetings set'},
              {label:'SQLs',         value:sqlAllTime,                                                                   color:'#60d4f4', sub:'SQL / DQ = Yes'},
              {label:'SQOs',         value:sqoAllTime,                                                                   color:'#c084fc', sub:'opp created'},
              {label:'SQL rate',     value:`${allLeads.length?Math.round(sqlAllTime/allLeads.length*100):0}%`,           color:C.purpleL, sub:'SQL / total'},
              {label:'Pipeline ACV', value:`$${allLeads.reduce((s,l)=>{const d=details[l.email]; return s+(d?.acv?parseInt(d.acv)||0:0)},0).toLocaleString()}`, color:C.amber, sub:'from filled records'},
            ].map(s=>(
              <div key={s.label} style={card}>
                <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>{s.label}</div>
                <div style={{fontSize:24,fontWeight:800,letterSpacing:'-0.03em',lineHeight:1,color:s.color}}>{s.value}</div>
                <div style={{fontSize:11,color:C.text3,marginTop:5}}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:16,marginBottom:24}}>
            {/* Pie */}
            <div style={card}>
              <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:16}}>Status breakdown · all time</div>
              <PieChart data={pieData}/>
            </div>

            {/* Bar */}
            <div style={card}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em'}}>Leads over time</div>
                <div style={{display:'flex',gap:5}}>
                  {(['week','month'] as const).map(p=>(
                    <button key={p} onClick={()=>setChartPeriod(p)} style={filterPill(chartPeriod===p)}>{{week:'Week over week',month:'Month over month'}[p]}</button>
                  ))}
                </div>
              </div>
              <BarChart bars={buildBars(chartPeriod)} title={chartPeriod==='week'?'Weekly lead volume':'Monthly lead volume'}/>
            </div>
          </div>

          {/* DQ / Nurture / Lost breakdown */}
          <div style={card}>
            <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:16}}>Leads needing attention</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
              {(['nurture','lost','dq'] as Status[]).map(s=>{
                const leads=allLeads.filter(l=>(statuses[l.email]||'new')===s)
                const cfg=STATUS_CONFIG[s]
                return (
                  <div key={s} style={{background:C.surface3,borderRadius:8,padding:'14px 16px',border:`1px solid ${cfg.border}`}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
                      <span style={{width:8,height:8,borderRadius:'50%',background:cfg.color}}/>
                      <span style={{fontSize:12,fontWeight:700,color:cfg.color}}>{cfg.label} · {leads.length}</span>
                    </div>
                    {leads.slice(0,4).map(l=>{
                      const det=details[l.email]
                      return (
                        <div key={l.email} style={{fontSize:11,color:C.text2,padding:'4px 0',borderBottom:`1px solid ${C.border}`}}>
                          {l.account||det?.prospectName||l.domain}
                          {det?.ae&&<span style={{color:C.text3,marginLeft:6}}>· {det.ae}</span>}
                        </div>
                      )
                    })}
                    {leads.length>4&&<div style={{fontSize:10,color:C.text3,marginTop:6}}>+{leads.length-4} more</div>}
                  </div>
                )
              })}
            </div>
          </div>
        </>)}
      </main>

      {/* ── Create Contact Modal ── */}
      {showCreate&&<CreateContactModal onSave={createContact} onClose={()=>setShowCreate(false)}/>}
    </div>
  )
}
