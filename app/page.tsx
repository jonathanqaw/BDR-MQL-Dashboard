'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import React from 'react'
import { signIn } from 'next-auth/react'
import type { Lead } from '@/lib/slack'


// ─── Rep Registry ─────────────────────────────────────────────────────────────
// Manager edits these in-dashboard. Stored in Edge Config under 'rep_registry'.
// slackId must match the Slack user ID tagged in #bdr-routed-leads messages.
type Rep = { id: string; name: string; slackId: string; passcode: string }

const DEFAULT_REPS: Rep[] = [
  { id: 'jonathan', name: 'Jonathan Kim', slackId: 'U098PSETPJ4', passcode: '' },
  { id: 'rep2',     name: 'Rep 2 (TBD)', slackId: '',             passcode: '' },
  { id: 'rep3',     name: 'Rep 3 (TBD)', slackId: '',             passcode: '' },
  { id: 'rep4',     name: 'Rep 4 (TBD)', slackId: '',             passcode: '' },
]

// ─── User Credentials ────────────────────────────────────────────────────────
type UserRole = 'manager' | 'cmo' | 'perf_marketing' | 'revops' | 'rep' | 'pm'
type DashView = 'pipeline' | 'analytics' | 'reporting' | 'commissions' | 'leaderboard' | 'revops_commissions' | 'roundrobin'
interface UserCredential { email:string; password:string; role:UserRole; name:string; allowedViews:DashView[]|'all' }
const USER_CREDENTIALS: UserCredential[] = [
  { email:'jonathankim@qawolf.com', password:'johnnywolfpack2026', role:'manager', name:'Jonathan Kim', allowedViews:'all' },
  { email:'scott@qawolf.com',       password:'ScottQAW2026',       role:'cmo',     name:'Scott Wilson', allowedViews:['pipeline','analytics','reporting','leaderboard','revops_commissions','roundrobin'] },
  { email:'arnav@qawolf.com',       password:'PMLQAW2026',         role:'pm', name:'Arnav Shome', allowedViews:['pipeline','reporting','analytics','revops_commissions','roundrobin'] },
  { email:'meenal@qawolf.com',      password:'RevOpsQAW#123',      role:'revops',  name:'Meenal Gupta', allowedViews:['revops_commissions','roundrobin'] },
  { email:'leon@qawolf.com',        password:'PMLQAW2026',         role:'pm',      name:'Leon Tang', allowedViews:['pipeline','reporting','analytics','revops_commissions','roundrobin'] },
]
const MANAGER_ROLES: UserRole[] = ['manager','cmo'] // full access roles that can edit reps, manage pipeline, etc.
// BDM-only: commission adjustments, cap attainment, manager commission view
const isBdmEmail=(email?:string):boolean=>email==='jonathankim@qawolf.com'

type AuthState = { role: UserRole; email?: string; allowedViews: DashView[]|'all' } | { role: 'rep'; repId: string; allowedViews: DashView[]|'all' } | null

// ─── Types ────────────────────────────────────────────────────────────────────
type Status       = 'new' | 'contacted' | 'inprogress' | 'booked' | 'nurture' | 'lost' | 'na' | 'dq' | 'closedwon'
type View         = 'pipeline' | 'analytics' | 'reporting' | 'commissions' | 'leaderboard' | 'revops_commissions' | 'roundrobin'
type LbMetric     = 'meetings' | 'meetings_held' | 'sqls' | 'sqos'
type LbPeriod     = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all'
interface Spiff { id:string; title:string; description:string; metric:LbMetric; target:number; reward:string; startDate:string; endDate:string; createdBy:string; active:boolean }
type PeriodFilter = 'week' | 'month' | 'quarter' | 'q1' | 'q2' | 'q3' | 'q4' | 'year' | 'custom' | 'all'
type WorkedFilter = 'all' | 'worked' | 'untouched'
type StatusFilter = 'all' | Status
type ReportTimeframe = 'monthly' | 'quarterly' | 'yearly' | 'custom'
type ReportScope = 'all_bdrs' | 'individual_bdr'
type ReportType = 'full_funnel' | 'pipeline_performance' | 'mql_quality' | 'conversion_analysis'

interface LeadDetail {
  prospectName: string; title: string; sourceChannel: string; outreachChannel: string
  connectedDate: string; meetingDate: string; nextStep: string; nextStepStatus: string
  sqlDq: string; sqlDate: string; ae: string; multithreading: string
  sqo: string; sqoDate: string; acv: string; closedWon: string; closedWonDate: string; notes: string; sfLink: string
  mqlQuality: string  // '' | 'hq' | 'lq' | 'dq'
  accountTier: string // '' | 'A' | 'B' | 'C' | 'E'
  gongUrl: string
}
interface AppLead extends Lead {
  isHistorical?: boolean
  account?: string
  isManual?: boolean
  repSlackId?: string | null
  repId?: string | null
}

const EMPTY_DETAIL: LeadDetail = {
  prospectName:'', title:'', sourceChannel:'', outreachChannel:'',
  connectedDate:'', meetingDate:'', nextStep:'', nextStepStatus:'',
  sqlDq:'', sqlDate:'', ae:'', multithreading:'', sqo:'', sqoDate:'', acv:'', closedWon:'', closedWonDate:'', notes:'', sfLink:'',
  mqlQuality:'',
  accountTier:'',
  gongUrl:''
}

// ─── Historical records from spreadsheet ─────────────────────────────────────
const HISTORICAL_LEADS: AppLead[] = [
  { email:'logicmonitor@historical',         domain:'logicmonitor.com',        account:'LogicMonitor',             name:'Jitender Kumar Prasad',    sfUrl:null, date:'2025-12-08', receivedAt:'2025-12-08T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'kenanadvantage@historical',        domain:'kenanadvantage.com',       account:'Kenan Advantage Group',    name:'Dave Derecskey',           sfUrl:null, date:'2025-12-09', receivedAt:'2025-12-09T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'evoke@historical',                domain:'evoke.com',                account:'evoke',                    name:'Cristian Mocanu',          sfUrl:null, date:'2025-12-11', receivedAt:'2025-12-11T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'gatewayticketing@historical',     domain:'gatewayticketing.com',     account:'Gateway Ticketing',        name:'Rebecca Lathrop',          sfUrl:null, date:'2025-12-03', receivedAt:'2025-12-03T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'trackunit@historical',            domain:'trackunit.com',            account:'Trackunit',                name:'Philip Quinn',             sfUrl:null, date:'2025-12-17', receivedAt:'2025-12-17T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'harrys@historical',               domain:'harrys.com',               account:"Harry's",                  name:'Simon Anguish / Matthew Dreyer', sfUrl:null, date:'2025-12-19', receivedAt:'2025-12-19T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'decisionresources@historical',    domain:'decisionresources.com',    account:'Decision Resources Inc.',  name:'Tim McManus',              sfUrl:null, date:'2026-01-12', receivedAt:'2026-01-12T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'everydayhealth@historical',       domain:'everydayhealth.com',       account:'Everyday Health Group',    name:'Kholilur Rahman',          sfUrl:null, date:'2026-01-13', receivedAt:'2026-01-13T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'tradera@historical',              domain:'tradera.com',              account:'Tradera',                  name:'Emma Carlsson',            sfUrl:null, date:'2026-01-14', receivedAt:'2026-01-14T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'vidmob@historical',               domain:'vidmob.com',               account:'Vidmob',                   name:'Ben Holm',                 sfUrl:null, date:'2026-01-14', receivedAt:'2026-01-14T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'circlemedical@historical',        domain:'circlemedical.com',        account:'Circle Medical',           name:'Florian Denu',             sfUrl:null, date:'2026-01-20', receivedAt:'2026-01-20T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'nagarro@historical',              domain:'nagarro.com',              account:'Nagarro',                  name:'Nishant Thareja',          sfUrl:null, date:'2026-02-04', receivedAt:'2026-02-04T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'bloomcoaching@historical',        domain:'bloomcoaching.com',        account:'Bloom Coaching',           name:'Thomas Stevens',           sfUrl:null, date:'2026-01-19', receivedAt:'2026-01-19T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'pods@historical',                 domain:'pods.com',                 account:'PODS',                     name:'Randy Withrow',            sfUrl:null, date:'2026-01-22', receivedAt:'2026-01-22T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'sharkninja@historical',           domain:'sharkninja.com',           account:'SharkNinja',               name:'Jake Rutter',              sfUrl:null, date:'2026-01-27', receivedAt:'2026-01-27T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'quince@historical',               domain:'quince.com',               account:'Quince',                   name:'Prabhanjan Jha',           sfUrl:null, date:'2026-02-04', receivedAt:'2026-02-04T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'quartr@historical',               domain:'quartr.com',               account:'Quartr',                   name:'Fabricio Vergara',         sfUrl:null, date:'2026-02-05', receivedAt:'2026-02-05T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'prophetx@historical',             domain:'prophetx.com',             account:'ProphetX',                 name:'Nathan Busscher',          sfUrl:null, date:'2026-02-17', receivedAt:'2026-02-17T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'yassir@historical',               domain:'yassir.com',               account:'Yassir',                   name:'Artem Pashkov',            sfUrl:null, date:'2026-02-18', receivedAt:'2026-02-18T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'westjet@historical',              domain:'westjet.com',              account:'WestJet',                  name:'Santhosha Chandrashekharappa', sfUrl:null, date:'2026-02-20', receivedAt:'2026-02-20T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'robbinsresearch@historical',      domain:'robbinsresearch.com',      account:'Robbins Research',         name:'Nick Jensen',              sfUrl:null, date:'2026-02-25', receivedAt:'2026-02-25T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'cradle@historical',               domain:'cradle.com',               account:'Cradle',                   name:'Melanie Burger',           sfUrl:null, date:'2026-02-25', receivedAt:'2026-02-25T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'onephase@historical',             domain:'onephase.com',             account:'onPhase',                  name:'Louis Velez',              sfUrl:null, date:'2026-03-03', receivedAt:'2026-03-03T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'novemberfive@historical',         domain:'novemberfive.com',         account:'November Five',            name:'Antonio Marquez',          sfUrl:null, date:'2026-03-05', receivedAt:'2026-03-05T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'north@historical',                domain:'north.com',                account:'North',                    name:'Forum Vyas',               sfUrl:null, date:'2026-03-05', receivedAt:'2026-03-05T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'enablecomp@historical',           domain:'enablecomp.com',           account:'EnableComp',               name:'Keith Clayton',            sfUrl:null, date:'2026-03-10', receivedAt:'2026-03-10T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'nuqleous@historical',             domain:'nuqleous.com',             account:'Nuqleous',                 name:'Steven Williams',          sfUrl:null, date:'2026-03-12', receivedAt:'2026-03-12T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'playtech@historical',             domain:'playtech.com',             account:'Playtech',                 name:'Borislav Zhezhev',         sfUrl:null, date:'2026-03-12', receivedAt:'2026-03-12T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'azets@historical',                domain:'azets.com',                account:'Azets',                    name:'Kristijonas Bulzgis',      sfUrl:null, date:'2026-03-24', receivedAt:'2026-03-24T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'jpmorganchase@historical',        domain:'jpmorganchase.com',        account:'JPMorganChase',            name:'Hikmet Tenis',             sfUrl:null, date:'2026-03-26', receivedAt:'2026-03-26T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'pex@historical',                  domain:'pex.com',                  account:'PEX',                      name:'Brandon Sim',              sfUrl:null, date:'2026-03-31', receivedAt:'2026-03-31T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
  { email:'productleague@historical',        domain:'product-league.com',       account:'Product League',           name:'Ingmar van Oostrum',       sfUrl:'https://qawolf1.lightning.force.com/lightning/r/Contact/003PA00000ZIU9yYAH/view', date:'2026-04-02', receivedAt:'2026-04-02T00:00:00.000Z', source:'bdr', repSlackId:null, isHistorical:true },
]

// Historical default statuses & details
const HISTORICAL_STATUSES: Record<string,Status> = {
  'logicmonitor@historical':      'booked',
  'kenanadvantage@historical':    'closedwon',
  'evoke@historical':             'closedwon',
  'gatewayticketing@historical':  'closedwon',
  'trackunit@historical':         'booked',
  'harrys@historical':            'booked',
  'decisionresources@historical': 'closedwon',
  'everydayhealth@historical':    'booked',
  'tradera@historical':           'dq',
  'vidmob@historical':            'booked',
  'circlemedical@historical':     'dq',
  'nagarro@historical':           'dq',
  'bloomcoaching@historical':     'booked',
  'pods@historical':              'booked',
  'sharkninja@historical':        'booked',
  'quince@historical':            'booked',
  'quartr@historical':            'booked',
  'prophetx@historical':          'booked',
  'yassir@historical':            'lost',
  'westjet@historical':           'nurture',
  'robbinsresearch@historical':   'lost',
  'cradle@historical':            'closedwon',
  'onephase@historical':          'booked',
  'novemberfive@historical':      'nurture',
  'north@historical':             'booked',
  'enablecomp@historical':        'booked',
  'nuqleous@historical':          'booked',
  'playtech@historical':          'booked',
  'azets@historical':             'nurture',
  'jpmorganchase@historical':     'closedwon',
  'pex@historical':               'closedwon',
  'productleague@historical':     'closedwon',
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
  'nagarro@historical':           { prospectName:'Nishant Thareja', title:'Lead Automation Engineer', sourceChannel:'#leads-bot', outreachChannel:'Call', meetingDate:'2026-02-06', sqlDq:'No', ae:'Ben Barrett' },
  'bloomcoaching@historical':     { prospectName:'Thomas Stevens', title:'Mid Frontend Software Engineer', sourceChannel:'#leads-bot', outreachChannel:'Call', meetingDate:'2026-01-23', sqlDq:'Yes', sqlDate:'2026-01-23', ae:'Stephen Stabile', multithreading:'Yes' },
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

// ─── SF links baked in from Slack — permanent fallback so they survive cache clears ──
const LIVE_SF_LINKS: Record<string,string> = {
  'naoufel.razouane@symdrik.com':       'https://qawolf1.lightning.force.com/lightning/r/Lead/00QPA00000WKSYn2AP/view',
  'hassan@raspire.com':                  'https://qawolf1.lightning.force.com/lightning/r/Lead/00QPA00000WIr6i2AD/view',
  'tori@portfolioxpressway.com':         'https://qawolf1.lightning.force.com/lightning/r/Lead/00QPA00000WIPtb2AH/view',
  'mahmut.cemrek@hesap.com':             'https://qawolf1.lightning.force.com/lightning/r/Lead/00QPA00000WINer2AH/view',
  'cleo@futureholidays.co':              'https://qawolf1.lightning.force.com/lightning/r/Lead/00QPA00000WI1862AD/view',
  'petersons@reninc.com':                'https://qawolf1.lightning.force.com/lightning/r/Contact/003PA00000ZIU9yYAH/view',
  'bhollenbeck@guardiandd.com':          'https://qawolf1.lightning.force.com/lightning/r/Lead/00QPA00000WCFYk2AP/view',
  'aleksa.jankovic@freetrade.io':        'https://qawolf1.lightning.force.com/lightning/r/Lead/00QPA00000WGQs92AH/view',
  'chad@blueyard.com':                   'https://qawolf1.lightning.force.com/lightning/r/Lead/00QPA00000WHPE52AP/view',
  'oladapo.olasunkanmi@machineslikeme.com': 'https://qawolf1.lightning.force.com/lightning/r/Lead/00QPA00000WHORh2AP/view',
  'javeria@erlystage.com':               'https://qawolf1.lightning.force.com/lightning/r/Lead/00QPA00000WHA702AH/view',
  'ethan@piastech.com':                  'https://qawolf1.lightning.force.com/lightning/r/Lead/00QPA00000WH58v2AD/view',
  'abdullah@connexease.com':             'https://qawolf1.lightning.force.com/lightning/r/Lead/00QPA00000WG9Uj2AL/view',
  'arun.kumar1@forcepoint.com':          'https://qawolf1.lightning.force.com/lightning/r/Lead/00QPA00000WFbuV2AT/view',
  'support@nursenest.ca':                'https://qawolf1.lightning.force.com/lightning/r/Lead/00QPA00000WFbRS2A1/view',
  'csd@reach52.com':                     'https://qawolf1.lightning.force.com/lightning/r/Lead/00QPA00000WFONm2AP/view',
  'bharden@northcapital.com':            'https://qawolf1.lightning.force.com/lightning/r/Lead/00QPA00000WFMDu2AP/view',
  'jochen@norento.com':                  'https://qawolf1.lightning.force.com/lightning/r/Lead/00QPA00000WDW4U2AX/view',
  'ernest.lam@dvcorporate.com':          'https://qawolf1.lightning.force.com/lightning/r/Lead/00QPA00000WDCSL2A5/view',
  'diana.lang.ext@bureauveritas.com':    'https://qawolf1.lightning.force.com/lightning/r/Lead/00QPA00000WHCdR2AX/view',
  'r@turek.co':                          'https://qawolf1.lightning.force.com/lightning/r/Lead/00QPA00000WO7ig2AD/view',
  'yogesh@frugaltestingin.com':          'https://qawolf1.lightning.force.com/lightning/r/Lead/00QPA00000WNsBl2AL/view',
  'rohit.rawat@smartboxlockers.com':     'https://qawolf1.lightning.force.com/lightning/r/Lead/00QPA00000WNZCL2A5/view',
  'anvisha@nullframe.ai':                'https://qawolf1.lightning.force.com/lightning/r/Lead/00QPA00000WMq5b2AD/view',
  'xxia@inductivesolution.ai':           'https://qawolf1.lightning.force.com/lightning/r/Lead/00QPA00000WMJw32AH/view',
  'keerthana@icustomer.ai':              'https://qawolf1.lightning.force.com/lightning/r/Lead/00QPA00000RZFe92AH/view',
  'ahmad@basheer.app':                   'https://qawolf1.lightning.force.com/lightning/r/Lead/00QPA00000WMJHh2AP/view',
}

// ─── Prospect names recovered from chilinbot DMs ─────────────────────────────
const LIVE_PROSPECT_NAMES: Record<string,string> = {
  'naoufel.razouane@symdrik.com':           'Naoufel Razouane',
  'hassan@raspire.com':                      'Hassan Mostafa',
  'cleo@futureholidays.co':                  'Cleo Hissatugu',
  'chad@blueyard.com':                       'Chad Fowler',
  'oladapo.olasunkanmi@machineslikeme.com':  'Oladapo Olasunkanmi',
  'javeria@erlystage.com':                   'Javeria Nasir',
  'bhollenbeck@guardiandd.com':              'Brett Hollenbeck',
  'aleksa.jankovic@freetrade.io':            'Aleksa Jankovic',
  'abdullah@connexease.com':                 'Abdullah Külcü',
  'bharden@northcapital.com':                'Benjamin Harden',
  'alice.porcu@check24.de':                  'Alice Porcu',
  'jochen@norento.com':                      'Jochen Norento',
}
const STATUS_CONFIG: Record<Status,{label:string;color:string;dim:string;border:string}> = {
  new:        {label:'New',         color:'rgba(255,255,255,0.38)', dim:'#2a2654',               border:'rgba(255,255,255,0.13)'},
  contacted:  {label:'Contacted',   color:'#a89cf8',                dim:'rgba(123,110,246,0.18)', border:'rgba(123,110,246,0.4)'},
  inprogress: {label:'In Progress', color:'#60a5fa',                dim:'rgba(96,165,250,0.15)',  border:'rgba(96,165,250,0.35)'},
  booked:     {label:'Booked',      color:'#00e5a0',                dim:'rgba(0,229,160,0.15)',   border:'rgba(0,229,160,0.35)'},
  nurture:    {label:'Nurture',     color:'#e879f9',                dim:'rgba(232,121,249,0.15)', border:'rgba(232,121,249,0.35)'},
  lost:       {label:'Lost',        color:'#ff5c5c',                dim:'rgba(255,92,92,0.12)',   border:'rgba(255,92,92,0.35)'},
  dq:         {label:"DQ'd",        color:'#ff5c5c',                dim:'rgba(255,92,92,0.12)',   border:'rgba(255,92,92,0.35)'},
  closedwon:  {label:'Closed-Won', color:'#00e5a0', dim:'rgba(0,229,160,0.15)', border:'rgba(0,229,160,0.35)'},
  na:         {label:'N/A',         color:'rgba(255,255,255,0.25)', dim:'rgba(255,255,255,0.06)', border:'rgba(255,255,255,0.1)'},
}
const STRIPE: Record<Status,string> = {
  new:'#322e60', contacted:'#7b6ef6', inprogress:'#3b82f6', booked:'#00e5a0', nurture:'#e879f9', lost:'#ff5c5c', dq:'#ff5c5c', na:'#1c1840', closedwon:'#00e5a0'
}
const C = {
  bg:'#13102a', surface:'#1c1840', surface2:'#231f4a', surface3:'#2a2654',
  border:'rgba(255,255,255,0.07)', border2:'rgba(255,255,255,0.13)',
  text:'#ffffff', text2:'rgba(255,255,255,0.68)', text3:'rgba(255,255,255,0.38)',
  green:'#00e5a0', purple:'#7b6ef6', purpleL:'#a89cf8', amber:'#f5a623', red:'#ff5c5c',
}

// ─── Frozen commission override data (Spiff-verified) ────────────────────────
// Used by both Commissions Tracker and RevOps views.
const FROZEN_COMMISSION_EVENTS: Record<string,{meetings:{email:string;account:string;date:string;amount:number}[];sqls:{email:string;account:string;date:string;amount:number}[]}> = {
  '2025-09':{meetings:[],sqls:[
    {email:'josh.barrett@pep.com',account:'Josh Barrett — pep, LLC',date:'2025-09-10',amount:500},
    {email:'joseph.sintum@quantummetric.com',account:'Joseph Sintum — Quantum Metric',date:'2025-09-05',amount:500},
    {email:'mani.suri@follett.com',account:'Mani Suri — Follett Higher Education',date:'2025-09-05',amount:500},
    {email:'sean.grice@ny.gov',account:'Sean Grice — New York State',date:'2025-09-19',amount:500},
    {email:'wei.si@wyze.com',account:'Wei Si — Wyze',date:'2025-09-22',amount:500},
  ]},
  '2025-10':{meetings:[],sqls:[
    {email:'alejandro.mallea@dakotasoft.com',account:'Alejandro Mallea — Dakota Software',date:'2025-10-17',amount:500},
    {email:'srinivasan.dayalan@trimble.com',account:'Srinivasan Dayalan — Trimble',date:'2025-10-21',amount:500},
    {email:'arthur.miller@sixfold.com',account:'Arthur Miller — Sixfold',date:'2025-10-02',amount:500},
    {email:'devario.johnson@imentor.org',account:'Devario Johnson — iMentor',date:'2025-10-09',amount:500},
  ]},
  '2025-11':{sqls:[],meetings:[
    {email:'michael.wahl@tweddlegroup.com',account:'Michael Wahl — Tweddle Group',date:'2025-11-06',amount:100},
    {email:'geraldine.bai@deloitte.com',account:'Geraldine Bai — Deloitte',date:'2025-11-22',amount:100},
    {email:'suzanne.robinson@gentrack.com',account:'Suzanne Robinson — Gentrack',date:'2025-11-09',amount:100},
    {email:'ilir.kosumi@enmacc.com',account:'Ilir Kosumi — enmacc',date:'2025-11-17',amount:100},
  ]},
  '2025-12':{meetings:[
    {email:'richard.tep@textnow.com',account:'Richard Tep — TextNow',date:'2025-12-08',amount:100},
    {email:'jf.cantin@lgi.com',account:'Jean-Francois Cantin — LGI Healthcare',date:'2025-12-08',amount:100},
    {email:'kenanadvantage@historical',account:'Dave Derecskey — Kenan Advantage Group',date:'2025-12-12',amount:100},
  ],sqls:[
    {email:'michael.wahl@tweddlegroup.com',account:'Michael Wahl — Tweddle Group',date:'2025-12-04',amount:400},
  ]},
  '2026-01':{meetings:[
    {email:'logicmonitor@historical',account:'Jitender Prasad — LogicMonitor',date:'2025-12-11',amount:150},
    {email:'everydayhealth@historical',account:'Kholilur Rahman — Everyday Health',date:'2026-01-13',amount:150},
    {email:'vidmob@historical',account:'Ben Holm — Vidmob',date:'2026-01-15',amount:150},
    {email:'circlemedical@historical',account:'Florian Denu — Circle Medical',date:'2026-01-22',amount:150},
    {email:'tradera@historical',account:'Emma Carlsson — Tradera',date:'2026-01-22',amount:150},
    {email:'bloomcoaching@historical',account:'Thomas Stevens — Bloom Coaching',date:'2026-01-23',amount:150},
  ],sqls:[
    {email:'everydayhealth@historical',account:'Kholilur Rahman — Everyday Health',date:'2026-01-13',amount:620},
    {email:'harrys@historical',account:"Simon Anguish — Harry's",date:'2026-01-15',amount:620},
    {email:'trackunit@historical',account:'Philip Quinn — Trackunit',date:'2026-01-19',amount:620},
    {email:'bloomcoaching@historical',account:'Thomas Stevens — Bloom Coaching',date:'2026-01-23',amount:930},
    {email:'vidmob@historical',account:'Ben Holm — Vidmob',date:'2026-01-27',amount:930},
    {email:'sharkninja@historical',account:'Jake Rutter — SharkNinja',date:'2026-01-28',amount:930},
    {email:'pods@historical',account:'Randy Withrow — PODS',date:'2026-01-29',amount:930},
    {email:'gavin.williams@f1arcade.com',account:'Gavin Williams — F1 Arcade',date:'2026-01-30',amount:930},
    {email:'logicmonitor@historical',account:'Jitender Prasad — LogicMonitor',date:'2026-01-13',amount:930},
    {email:'harry.selvaratnam@iterate.ai',account:'Harry Selvaratnam — Iterate.ai',date:'2026-01-13',amount:930},
    {email:'suzanne.robinson@gentrack.com',account:'Suzanne Robinson — Gentrack',date:'2026-01-13',amount:930},
  ]},
  '2026-02':{meetings:[
    {email:'sharkninja@historical',account:'Jake Rutter — SharkNinja',date:'2026-02-01',amount:150},
    {email:'bloomcoaching@historical',account:'Thomas Stevens — Bloom Coaching',date:'2026-02-01',amount:150},
    {email:'quince@historical',account:'Prabhanjan Jha — Quince',date:'2026-02-12',amount:150},
    {email:'prophetx@historical',account:'Nathan Busscher — ProphetX',date:'2026-02-17',amount:150},
    {email:'westjet@historical',account:'Santhosha C. — WestJet',date:'2026-02-20',amount:150},
    {email:'robbinsresearch@historical',account:'Nick Jensen — Robbins Research',date:'2026-02-23',amount:150},
  ],sqls:[
    {email:'quartr@historical',account:'Fabricio Vergara — Quartr',date:'2026-02-11',amount:620},
    {email:'prophetx@historical',account:'Nathan Busscher — ProphetX',date:'2026-02-18',amount:620},
  ]},
  '2026-03':{meetings:[
    {email:'onephase@historical',account:'Louis Velez — onPhase',date:'2026-03-06',amount:150},
    {email:'enablecomp@historical',account:'Keith Clayton — EnableComp',date:'2026-03-12',amount:150},
    {email:'nuqleous@historical',account:'Steven Williams — Nuqleous',date:'2026-03-13',amount:150},
    {email:'playtech@historical',account:'Borislav Zhezhev — Playtech',date:'2026-03-13',amount:150},
    {email:'north@historical',account:'Forum Vyas — North',date:'2026-03-17',amount:150},
    {email:'cradle@historical',account:'Melanie Burger — Cradle',date:'2026-03-17',amount:150},
    {email:'novemberfive@historical',account:'Antonio Marquez — November Five',date:'2026-03-18',amount:150},
    {email:'azets@historical',account:'Kristijonas Bulzgis — Azets',date:'2026-03-25',amount:150},
  ],sqls:[
    {email:'brandon.hall@everyonesocial.com',account:'Brandon Hall — EveryoneSocial',date:'2026-03-03',amount:620},
    {email:'bhargav.mehta@octaura.com',account:'Bhargav Mehta — Octaura',date:'2026-03-04',amount:620},
    {email:'onephase@historical',account:'Louis Velez — onPhase',date:'2026-03-06',amount:620},
    {email:'nuqleous@historical',account:'Steven Williams — Nuqleous',date:'2026-03-13',amount:930},
    {email:'north@historical',account:'Forum Vyas — North American Bancard',date:'2026-03-17',amount:930},
    {email:'enablecomp@historical',account:'Keith Clayton — EnableComp',date:'2026-03-13',amount:930},
  ]},
}
function getCommissionOverride(mk:string){return FROZEN_COMMISSION_EVENTS[mk]||null}

// ─── Dropdown options ─────────────────────────────────────────────────────────
const SOURCE_CHANNELS  = ['','#growth-wins','#leads-bot','leads-platform waitlist','gated-content','QA Wolf inbox','webinar','AE assist','gen OB','Swan','leads-lonescale','Other']
const OUTBOUND_SOURCES = new Set(['Swan','gen OB','AE assist','leads-lonescale'])
const OUTREACH_CH      = ['','Email','LinkedIn','Call','Other']
const NEXT_STEPS       = ['','Discovery Call','Demo','Sample Tests','Reconnect','Other']
const NEXT_STEP_STATUS = ['','In Progress','Discovery Held','Waiting for AE','TBD - Evaluation','Scheduled']
const SQL_OPTIONS      = ['','Yes','No','Pending']
const SQO_OPTIONS      = ['','Yes','No']
const CLOSED_WON_OPTIONS = ['','Yes','No']
const MT_OPTIONS       = ['','Yes','No']

// ─── AE Round Robin Roster (v2) ─────────────────────────────────────────────
interface AERosterEntry { name:string; calendarId:string; team:string; se:string }
const AE_ROSTER:{west:{major:AERosterEntry[];commercial:AERosterEntry[]};east:{major:AERosterEntry[];commercial:AERosterEntry[]}} = {
  west:{
    major:[
      {name:'Colin',calendarId:'colin@qawolf.com',team:'Yoshi',se:'Ricky'},
      {name:'Kathryn',calendarId:'kathryn@qawolf.com',team:'Bowser',se:'Dion'},
    ],
    commercial:[
      {name:'Sally',calendarId:'sally@qawolf.com',team:'Bowser',se:'Dion'},
      {name:'Rob',calendarId:'rob@qawolf.com',team:'Yoshi',se:'Ricky'},
      {name:'Burke',calendarId:'burke@qawolf.com',team:'Yoshi',se:'Ricky'},
    ],
  },
  east:{
    major:[
      {name:'Devin',calendarId:'devin@qawolf.com',team:'Kirby',se:'Becca'},
      {name:'Charlie',calendarId:'charlie@qawolf.com',team:'Zelda',se:'Jun'},
      {name:'Ben',calendarId:'benbarrett@qawolf.com',team:'Zelda',se:'Jun'},
      {name:'Jason',calendarId:'jason@qawolf.com',team:'Sonic',se:'Ian'},
    ],
    commercial:[
      {name:'Stephen',calendarId:'stephen@qawolf.com',team:'Sonic',se:'Ian'},
      {name:'Jordan',calendarId:'jordan.vanitallie@qawolf.com',team:'Kirby',se:'Becca'},
    ],
  },
}
const SE_ROSTER:Record<string,{name:string;calendarId:string;tz:string}>={
  Ricky:{name:'Ricky Moore',calendarId:'ricky@qawolf.com',tz:'PST'},
  Dion:{name:'Dion Pham',calendarId:'dinhan@qawolf.com',tz:'PST'},
  Ian:{name:'Ian Schaefer',calendarId:'ian@qawolf.com',tz:'EST'},
  Becca:{name:'Becca',calendarId:'becca@qawolf.com',tz:'CST/EST'},
  Jun:{name:'Jun Park',calendarId:'jun@qawolf.com',tz:'EST'},
}
interface RRAssignment { id:string; accountName:string; segment:'Major'|'Commercial'; region:'West'|'East'; assignedAE:string; calendarId:string; meetingTime:string; assignedAt:string; skippedAEs:{name:string;reason:string}[]; seIncluded?:string; manualBackfill?:boolean; prospectName?:string; prospectCompany?:string; source?:string; sfUrl?:string; notes?:string }
interface RRSkip { timestamp:string; accountName:string; skippedAE:string; reason:string; assignedTo:string }
interface RRManagerSettings { removedAEs:string[] }
interface RosterAE { id:string; name:string; calendarId:string; se:string; team:string; segment:'Major'|'Commercial'; region:'West'|'East'; status:'Active'|'Inactive'; dateAdded:string }
const SE_TO_TEAM:Record<string,string>={Ricky:'Yoshi',Dion:'Bowser',Ian:'Sonic',Becca:'Kirby',Jun:'Zelda'}
const BACKFILL_SOURCES=['Inbound MQL','Outbound','Self-sourced','Hand-off','Other'] as const
const migrateAERoster=():RosterAE[]=>{
  const r:RosterAE[]=[]
  const add=(entries:AERosterEntry[],region:'West'|'East',segment:'Major'|'Commercial')=>{entries.forEach(ae=>r.push({id:`ae-${ae.name.toLowerCase().replace(/\s+/g,'-')}`,name:ae.name,calendarId:ae.calendarId,se:ae.se,team:ae.team,segment,region,status:'Active',dateAdded:'2026-01-01'}))}
  add(AE_ROSTER.west.major,'West','Major');add(AE_ROSTER.west.commercial,'West','Commercial')
  add(AE_ROSTER.east.major,'East','Major');add(AE_ROSTER.east.commercial,'East','Commercial')
  return r
}

// ─── localStorage ─────────────────────────────────────────────────────────────
const getSt        = (): Record<string,Status>     => { try { return JSON.parse(localStorage.getItem('mql-st')||'{}') } catch { return {} } }
const getDetails   = (): Record<string,LeadDetail> => { try { return JSON.parse(localStorage.getItem('mql-dt')||'{}') } catch { return {} } }
const saveSt       = (email:string,v:Status)       => { const s=getSt(); s[email]=v; localStorage.setItem('mql-st',JSON.stringify(s)) }
const saveDetail   = (email:string,d:LeadDetail)   => { const s=getDetails(); s[email]=d; localStorage.setItem('mql-dt',JSON.stringify(s)) }
const getNameOverrides = (): Record<string,string> => { try { return JSON.parse(localStorage.getItem('mql-names')||'{}') } catch { return {} } }
const saveNameOverride = (email:string,name:string)=> { const s=getNameOverrides(); if(name.trim()) s[email]=name.trim(); else delete s[email]; localStorage.setItem('mql-names',JSON.stringify(s)) }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getResponseDot(receivedAt:string|null,status:Status):{color:string;label:string}|null {
  if (!receivedAt) return null
  // Only show on leads that haven't been touched yet (status is still new)
  if (status!=='new') return null
  const mins=(Date.now()-new Date(receivedAt).getTime())/60000
  // Only show within 48 hours
  if (mins>60*48) return null

  // Format: Xm / Xh Xm / Xd Xh
  const formatAge=(m:number)=>{
    if (m<60) return `${Math.round(m)}m ago`
    const h=Math.floor(m/60); const rm=Math.round(m%60)
    if (h<24) return rm>0?`${h}h ${rm}m ago`:`${h}h ago`
    const d=Math.floor(h/24); const rh=h%24
    return rh>0?`${d}d ${rh}h ago`:`${d}d ago`
  }

  if (mins<=20) return {color:C.green,label:formatAge(mins)}
  if (mins<=60) return {color:C.amber,label:formatAge(mins)}
  return {color:C.red,label:formatAge(mins)}
}
// Convert email domain to readable company name: product-league.com → Product League
function formatDomain(domain:string):string {
  const base=domain.replace(/\.(com|io|co|net|org|ai|app|dev|inc|us|uk|ca|au)$/i,'').replace(/\.(co)$/i,'')
  return base.split(/[-_.]/).map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ')
}

function getPeriodRange(p:PeriodFilter,customFrom?:string,customTo?:string):{start:Date;end:Date} {
  const n=new Date()
  const y=n.getFullYear()
  const farFuture=new Date('2099-12-31T23:59:59')
  if (p==='all') return {start:new Date('2020-01-01'),end:farFuture}
  if (p==='week') { const d=new Date(n); d.setDate(n.getDate()-n.getDay()); d.setHours(0,0,0,0); return {start:d,end:farFuture} }
  if (p==='month') return {start:new Date(y,n.getMonth(),1),end:new Date(y,n.getMonth()+1,0,23,59,59)}
  if (p==='quarter') { const qm=Math.floor(n.getMonth()/3)*3; return {start:new Date(y,qm,1),end:new Date(y,qm+3,0,23,59,59)} }
  if (p==='q1') return {start:new Date(y,0,1),end:new Date(y,2,31,23,59,59)}
  if (p==='q2') return {start:new Date(y,3,1),end:new Date(y,5,30,23,59,59)}
  if (p==='q3') return {start:new Date(y,6,1),end:new Date(y,8,30,23,59,59)}
  if (p==='q4') return {start:new Date(y,9,1),end:new Date(y,11,31,23,59,59)}
  if (p==='year') return {start:new Date(y,0,1),end:new Date(y,11,31,23,59,59)}
  if (p==='custom'&&customFrom) return {start:new Date(customFrom),end:customTo?new Date(customTo+'T23:59:59'):farFuture}
  return {start:new Date('2020-01-01'),end:farFuture}
}
function getPeriodStart(p:PeriodFilter):Date { return getPeriodRange(p).start }
function getWeekLabel(date:Date):string {
  const d=new Date(date); d.setDate(d.getDate()-d.getDay())
  return `${d.toLocaleString('en-US',{month:'short'})} ${d.getDate()}`
}
function getMonthLabel(date:Date):string {
  return date.toLocaleString('en-US',{month:'short',year:'2-digit'})
}

function parseAcv(value:string|undefined):number {
  if (!value) return 0
  const cleaned = String(value).replace(/[^0-9.-]/g,'')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

function getQuarterLabel(value:string|undefined):string {
  if (!value) return 'No Date'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'No Date'
  const q = Math.floor(d.getMonth()/3)+1
  return `Q${q} ${d.getFullYear()}`
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
// ─── AE names (pre-populated, user can add more) ─────────────────────────────
const DEFAULT_AES = [
  'Ben Barrett','Charlie Pie','Colin O\'Connor','Devin Steinke',
  'Jason Minster','Jordan Van Itallie','Kathryn Hajjar','Robert Linsmayer',
  'Sally Lopez','Scott Wilson','Stephen Stabile','Veronika Fischer'
]

const AE_STORAGE_KEY = 'mql-ae-opts-v2'

function getStoredAEs(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(AE_STORAGE_KEY)||'null')
    if (Array.isArray(stored)) return stored
    // Migrate from old key
    const old = JSON.parse(localStorage.getItem('mql-ae-opts')||'null')
    if (Array.isArray(old)) {
      // Merge old list with defaults (add Robert if missing)
      const merged = Array.from(new Set([...DEFAULT_AES,...old])).sort()
      localStorage.setItem(AE_STORAGE_KEY, JSON.stringify(merged))
      return merged
    }
  } catch {}
  return DEFAULT_AES
}

// ─── AE Combobox — dropdown + free text, with add and delete ─────────────────
function AECombobox({value,onChange}:{value:string;onChange:(v:string)=>void}) {
  const [open,setOpen]=useState(false)
  const [opts,setOpts]=useState<string[]>(getStoredAEs)
  const [inputVal,setInputVal]=useState(value)
  const [hoveredIdx,setHoveredIdx]=useState<number|null>(null)
  const [confirmDelete,setConfirmDelete]=useState<string|null>(null)
  const ref=React.useRef<HTMLDivElement>(null)

  useEffect(()=>setInputVal(value),[value])

  useEffect(()=>{
    const handler=(e:MouseEvent)=>{ if (ref.current&&!ref.current.contains(e.target as Node)){setOpen(false);setConfirmDelete(null)} }
    document.addEventListener('mousedown',handler)
    return ()=>document.removeEventListener('mousedown',handler)
  },[])

  const save=(updated:string[])=>{
    const sorted=updated.slice().sort()
    setOpts(sorted)
    localStorage.setItem(AE_STORAGE_KEY,JSON.stringify(sorted))
  }

  const filtered=opts.filter(o=>o.toLowerCase().includes(inputVal.toLowerCase()))
  const showAdd=inputVal.trim()&&!opts.some(o=>o.toLowerCase()===inputVal.trim().toLowerCase())

  const select=(v:string)=>{ onChange(v); setInputVal(v); setOpen(false); setConfirmDelete(null) }

  const addNew=()=>{
    const v=inputVal.trim()
    if (!v) return
    save([...opts,v])
    select(v)
  }

  const deleteAE=(name:string,e:React.MouseEvent)=>{
    e.preventDefault(); e.stopPropagation()
    if (confirmDelete===name) {
      // confirmed — remove
      save(opts.filter(o=>o!==name))
      if (value===name) onChange('')
      setConfirmDelete(null)
    } else {
      setConfirmDelete(name)
    }
  }

  return (
    <div ref={ref} style={{position:'relative'}} onClick={e=>e.stopPropagation()}>
      <input
        value={inputVal}
        onChange={e=>{setInputVal(e.target.value);onChange(e.target.value);setOpen(true);setConfirmDelete(null)}}
        onFocus={()=>setOpen(true)}
        onMouseDown={e=>e.stopPropagation()}
        onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){setOpen(false);setConfirmDelete(null)}}}
        onKeyUp={e=>e.stopPropagation()}
        placeholder="Select or type AE name…"
        style={{...inputStyle,paddingRight:28}}
        onClick={e=>e.stopPropagation()}
      />
      <span onClick={e=>{e.stopPropagation();setOpen(p=>!p);setConfirmDelete(null)}}
            style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',fontSize:9,color:C.text3,cursor:'pointer',userSelect:'none'}}>▼</span>
      {open&&(
        <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:100,background:C.surface,border:`1px solid ${C.border2}`,borderRadius:6,boxShadow:'0 8px 24px rgba(0,0,0,0.4)',maxHeight:220,overflowY:'auto',marginTop:2}}>
          {filtered.length===0&&!showAdd&&<div style={{padding:'8px 10px',fontSize:11,color:C.text3}}>No matches</div>}
          {filtered.map((o,i)=>{
            const isConfirming=confirmDelete===o
            return (
              <div key={o}
                   onMouseEnter={()=>setHoveredIdx(i)}
                   onMouseLeave={()=>setHoveredIdx(null)}
                   style={{display:'flex',alignItems:'center',padding:'0 6px 0 10px',background:hoveredIdx===i&&!isConfirming?C.surface2:isConfirming?'rgba(255,92,92,0.1)':'transparent',transition:'background 0.1s'}}>
                {/* Name — click to select */}
                <div
                  onMouseDown={e=>{e.preventDefault();if(!isConfirming)select(o);else setConfirmDelete(null)}}
                  style={{flex:1,padding:'7px 0',fontSize:12,color:isConfirming?C.red:C.text2,cursor:'pointer',fontWeight:isConfirming?600:400}}
                >
                  {isConfirming?`Delete "${o}"?`:o}
                </div>
                {/* Delete button — always visible on hover or confirming */}
                {(hoveredIdx===i||isConfirming)&&(
                  <div style={{display:'flex',gap:4,flexShrink:0,paddingLeft:6}}>
                    {isConfirming&&(
                      <button
                        onMouseDown={e=>{e.preventDefault();setConfirmDelete(null)}}
                        style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:4,border:`1px solid ${C.border2}`,background:'transparent',color:C.text3,cursor:'pointer'}}
                      >Cancel</button>
                    )}
                    <button
                      onMouseDown={e=>deleteAE(o,e)}
                      style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:4,border:`1px solid ${isConfirming?C.red:C.border2}`,background:isConfirming?'rgba(255,92,92,0.15)':'transparent',color:isConfirming?C.red:C.text3,cursor:'pointer'}}
                    >{isConfirming?'Confirm':'✕'}</button>
                  </div>
                )}
              </div>
            )
          })}
          {showAdd&&(
            <div onMouseDown={e=>{e.preventDefault();addNew()}}
                 style={{padding:'7px 10px',fontSize:12,color:C.green,cursor:'pointer',borderTop:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:14,fontWeight:700}}>+</span> Add &ldquo;{inputVal.trim()}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Editable Combobox — generic add/edit/delete dropdown (same UX as AE) ────
const SC_STORAGE_KEY = 'mql-source-ch-opts'
function getStoredSourceChannels(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(SC_STORAGE_KEY)||'null')
    if (Array.isArray(stored)) return stored
  } catch {}
  return SOURCE_CHANNELS.filter(c=>c)
}

function EditableCombobox({value,onChange,storageKey,defaults,placeholder}:{value:string;onChange:(v:string)=>void;storageKey:string;defaults:string[];placeholder?:string}) {
  const [open,setOpen]=useState(false)
  const [opts,setOpts]=useState<string[]>(()=>{try{const s=JSON.parse(localStorage.getItem(storageKey)||'null');if(Array.isArray(s))return s}catch{}return defaults})
  const [inputVal,setInputVal]=useState(value)
  const [hoveredIdx,setHoveredIdx]=useState<number|null>(null)
  const [confirmDelete,setConfirmDelete]=useState<string|null>(null)
  const ref=React.useRef<HTMLDivElement>(null)

  useEffect(()=>setInputVal(value),[value])

  useEffect(()=>{
    const handler=(e:MouseEvent)=>{ if (ref.current&&!ref.current.contains(e.target as Node)){setOpen(false);setConfirmDelete(null)} }
    document.addEventListener('mousedown',handler)
    return ()=>document.removeEventListener('mousedown',handler)
  },[])

  const save=(updated:string[])=>{
    const sorted=updated.slice().sort()
    setOpts(sorted)
    localStorage.setItem(storageKey,JSON.stringify(sorted))
  }

  const filtered=opts.filter(o=>o.toLowerCase().includes(inputVal.toLowerCase()))
  const showAdd=inputVal.trim()&&!opts.some(o=>o.toLowerCase()===inputVal.trim().toLowerCase())

  const select=(v:string)=>{ onChange(v); setInputVal(v); setOpen(false); setConfirmDelete(null) }

  const addNew=()=>{
    const v=inputVal.trim()
    if (!v) return
    save([...opts,v])
    select(v)
  }

  const deleteOpt=(name:string,e:React.MouseEvent)=>{
    e.preventDefault(); e.stopPropagation()
    if (confirmDelete===name) {
      save(opts.filter(o=>o!==name))
      if (value===name) onChange('')
      setConfirmDelete(null)
    } else {
      setConfirmDelete(name)
    }
  }

  return (
    <div ref={ref} style={{position:'relative'}} onClick={e=>e.stopPropagation()}>
      <input
        value={inputVal}
        onChange={e=>{setInputVal(e.target.value);onChange(e.target.value);setOpen(true);setConfirmDelete(null)}}
        onFocus={()=>setOpen(true)}
        onMouseDown={e=>e.stopPropagation()}
        onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){setOpen(false);setConfirmDelete(null)}}}
        onKeyUp={e=>e.stopPropagation()}
        placeholder={placeholder||'Select or type…'}
        style={{...inputStyle,paddingRight:28}}
        onClick={e=>e.stopPropagation()}
      />
      <span onClick={e=>{e.stopPropagation();setOpen(p=>!p);setConfirmDelete(null)}}
            style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',fontSize:9,color:C.text3,cursor:'pointer',userSelect:'none'}}>▼</span>
      {open&&(
        <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:100,background:C.surface,border:`1px solid ${C.border2}`,borderRadius:6,boxShadow:'0 8px 24px rgba(0,0,0,0.4)',maxHeight:220,overflowY:'auto',marginTop:2}}>
          {filtered.length===0&&!showAdd&&<div style={{padding:'8px 10px',fontSize:11,color:C.text3}}>No matches</div>}
          {filtered.map((o,i)=>{
            const isConfirming=confirmDelete===o
            return (
              <div key={o}
                   onMouseEnter={()=>setHoveredIdx(i)}
                   onMouseLeave={()=>setHoveredIdx(null)}
                   style={{display:'flex',alignItems:'center',padding:'0 6px 0 10px',background:hoveredIdx===i&&!isConfirming?C.surface2:isConfirming?'rgba(255,92,92,0.1)':'transparent',transition:'background 0.1s'}}>
                <div
                  onMouseDown={e=>{e.preventDefault();if(!isConfirming)select(o);else setConfirmDelete(null)}}
                  style={{flex:1,padding:'7px 0',fontSize:12,color:isConfirming?C.red:C.text2,cursor:'pointer',fontWeight:isConfirming?600:400}}
                >
                  {isConfirming?`Delete "${o}"?`:o}
                </div>
                {(hoveredIdx===i||isConfirming)&&(
                  <div style={{display:'flex',gap:4,flexShrink:0,paddingLeft:6}}>
                    {isConfirming&&(
                      <button
                        onMouseDown={e=>{e.preventDefault();setConfirmDelete(null)}}
                        style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:4,border:`1px solid ${C.border2}`,background:'transparent',color:C.text3,cursor:'pointer'}}
                      >Cancel</button>
                    )}
                    <button
                      onMouseDown={e=>deleteOpt(o,e)}
                      style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:4,border:`1px solid ${isConfirming?C.red:C.border2}`,background:isConfirming?'rgba(255,92,92,0.15)':'transparent',color:isConfirming?C.red:C.text3,cursor:'pointer'}}
                    >{isConfirming?'Confirm':'✕'}</button>
                  </div>
                )}
              </div>
            )
          })}
          {showAdd&&(
            <div onMouseDown={e=>{e.preventDefault();addNew()}}
                 style={{padding:'7px 10px',fontSize:12,color:C.green,cursor:'pointer',borderTop:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:14,fontWeight:700}}>+</span> Add &ldquo;{inputVal.trim()}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Date input wrapper — prevents calendar icon from disappearing ────────────
function toDateInputValue(value:string) {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value

  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return value

  const mm = m[1].padStart(2,'0')
  const dd = m[2].padStart(2,'0')
  const yyyy = m[3]
  return `${yyyy}-${mm}-${dd}`
}

function DateField({value,onChange}:{value:string;onChange:(v:string)=>void}) {
  return (
    <div
      style={{position:'relative'}}
      onClick={e=>e.stopPropagation()}
      onMouseDown={e=>e.stopPropagation()}
      onFocus={e=>e.stopPropagation()}
      onKeyDown={e=>e.stopPropagation()}
    >
      <input
        type="date"
        value={value}
        onChange={e=>{e.stopPropagation();onChange(e.target.value)}}
        onClick={e=>e.stopPropagation()}
        onMouseDown={e=>e.stopPropagation()}
        onFocus={e=>e.stopPropagation()}
        onKeyDown={e=>e.stopPropagation()}
        style={{
          ...inputStyle,
          colorScheme:'dark',
          minWidth:'100%',
          WebkitAppearance:'none' as const,
        }}
      />
    </div>
  )
}

// ─── Inline account name editor — click pencil to edit, Enter/blur to save ───
function AccountNameEditor({name,onSave}:{name:string;onSave:(v:string)=>void}) {
  const [editing,setEditing]=useState(false)
  const [val,setVal]=useState(name)
  const inputRef=React.useRef<HTMLInputElement>(null)

  useEffect(()=>{ if(editing) { setVal(name); setTimeout(()=>inputRef.current?.select(),0) } },[editing])

  const commit=()=>{ const v=val.trim(); if(v&&v!==name) onSave(v); setEditing(false) }

  if (editing) return (
    <input
      ref={inputRef}
      value={val}
      onChange={e=>{e.stopPropagation();setVal(e.target.value)}}
      onBlur={commit}
      onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter')commit();if(e.key==='Escape')setEditing(false)}}
      onMouseDown={e=>e.stopPropagation()}
      onClick={e=>e.stopPropagation()}
      style={{fontWeight:600,fontSize:13,background:'transparent',border:'none',borderBottom:`1px solid ${C.purple}`,outline:'none',color:C.text,padding:'0 2px',width:Math.max(val.length*8,80)+'px'}}
    />
  )

  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:5,cursor:'default'}}>
      <span style={{fontWeight:600,fontSize:13}}>{name}</span>
      <button
        onClick={e=>{e.stopPropagation();setEditing(true)}}
        onMouseDown={e=>e.stopPropagation()}
        title="Edit account name"
        style={{fontSize:10,opacity:0.35,background:'none',border:'none',cursor:'pointer',padding:'1px 3px',color:C.text3,lineHeight:1}}
        onMouseEnter={e=>(e.currentTarget.style.opacity='1')}
        onMouseLeave={e=>(e.currentTarget.style.opacity='0.35')}
      >✎</button>
    </span>
  )
}

// ─── DetailPanel sub-components — ALL defined OUTSIDE to prevent remount ──────
const Field=({label,children}:{label:string;children:React.ReactNode})=>(
  <div style={{display:'flex',flexDirection:'column',gap:4}} onClick={e=>e.stopPropagation()}>
    <span style={labelStyle}>{label}</span>
    {children}
  </div>
)

const Sel=({value,onChange,opts}:{value:string;onChange:(v:string)=>void;opts:string[]})=>(
  <select
    value={value}
    onChange={e=>{e.stopPropagation();onChange(e.target.value)}}
    onClick={e=>e.stopPropagation()}
    onMouseDown={e=>e.stopPropagation()}
    onKeyDown={e=>e.stopPropagation()}
    style={selectStyle}
  >
    {opts.map(o=><option key={o} value={o}>{o||'— Select —'}</option>)}
  </select>
)

const Inp=({value,onChange,placeholder}:{value:string;onChange:(v:string)=>void;placeholder?:string})=>(
  <input
    value={value}
    onChange={e=>{e.stopPropagation();onChange(e.target.value)}}
    onClick={e=>e.stopPropagation()}
    onFocus={e=>e.stopPropagation()}
    onKeyDown={e=>e.stopPropagation()}
    onKeyUp={e=>e.stopPropagation()}
    onMouseDown={e=>e.stopPropagation()}
    placeholder={placeholder||''}
    style={inputStyle}
  />
)

function DetailPanel({lead,detail,onSave,onClose}:{lead:AppLead;detail:LeadDetail;onSave:(d:LeadDetail)=>void;onClose:()=>void}) {
  const [d,setD]=useState<LeadDetail>(detail)
  const [hydrating,setHydrating]=useState(false)

  // Sync internal state when external detail changes (e.g. inline dropdown)
  useEffect(()=>{setD(prev=>{
    // Merge: keep unsaved edits but pick up external changes to mqlQuality/accountTier
    if(prev.mqlQuality!==detail.mqlQuality||prev.accountTier!==detail.accountTier)
      return {...prev,mqlQuality:detail.mqlQuality,accountTier:detail.accountTier}
    return prev
  })},[detail.mqlQuality,detail.accountTier])
  const notesRef=React.useRef<HTMLTextAreaElement>(null)

  const stopProp=(e:React.SyntheticEvent)=>e.stopPropagation()
  const setVal=(k:keyof LeadDetail)=>(v:string)=>setD(p=>({...p,[k]:v}))

 const handleSave=(e:React.MouseEvent)=>{
  e.stopPropagation()
  const finalD={...d, notes: notesRef.current?.value??d.notes}
  saveDetail(lead.email,finalD)
  onSave(finalD)
  onClose()
}
  const handleClose=(e:React.MouseEvent)=>{ e.stopPropagation(); onClose() }

  return (
    <tr onClick={stopProp} onMouseDown={stopProp} onKeyDown={stopProp}>
      <td colSpan={6} style={{padding:0}} onClick={stopProp} onMouseDown={stopProp}>
        <div style={{background:C.surface2,borderBottom:`1px solid ${C.border}`,padding:'20px 24px'}} onClick={stopProp} onMouseDown={stopProp}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
            <div>
              <div style={{fontSize:13,fontWeight:700}}>{lead.account||lead.email}</div>
              <div style={{fontSize:11,color:C.text3}}>
                {lead.isHistorical?'Historical record':lead.email}
                {(lead.sfUrl||d.sfLink)&&<a href={lead.sfUrl||d.sfLink} target="_blank" rel="noopener noreferrer" style={{color:C.green,textDecoration:'none',marginLeft:8}}>↗ Open in SF</a>}
              </div>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={handleSave} style={{fontSize:12,fontWeight:700,padding:'7px 16px',borderRadius:7,border:'none',background:C.green,color:C.bg,cursor:'pointer'}}>Save</button>
              <button onClick={handleClose} style={{fontSize:12,fontWeight:600,padding:'7px 12px',borderRadius:7,border:`1px solid ${C.border2}`,background:'transparent',color:C.text3,cursor:'pointer'}}>✕</button>
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:12,marginBottom:14}}>
            <Field label="Prospect Name"><Inp value={d.prospectName} onChange={setVal('prospectName')} placeholder="Full name"/></Field>
            <Field label="Title"><Inp value={d.title} onChange={setVal('title')} placeholder="Job title"/></Field>
            <Field label="AE"><AECombobox value={d.ae} onChange={setVal('ae')}/></Field>
            <Field label="Source Channel"><EditableCombobox value={d.sourceChannel} onChange={setVal('sourceChannel')} storageKey={SC_STORAGE_KEY} defaults={SOURCE_CHANNELS.filter(c=>c)} placeholder="Select or type source…"/></Field>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:12,marginBottom:14}}>
            <Field label="Outreach Channel"><Sel value={d.outreachChannel} onChange={setVal('outreachChannel')} opts={OUTREACH_CH}/></Field>
            <Field label="Connected Date"><DateField value={d.connectedDate} onChange={setVal('connectedDate')}/></Field>
            <Field label="Meeting Booked Date"><DateField value={d.meetingDate} onChange={setVal('meetingDate')}/></Field>
            <Field label="Next Step"><Sel value={d.nextStep} onChange={setVal('nextStep')} opts={NEXT_STEPS}/></Field>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr 1fr',gap:12,marginBottom:14}}>
            <Field label="Next Step Status"><Sel value={d.nextStepStatus} onChange={setVal('nextStepStatus')} opts={NEXT_STEP_STATUS}/></Field>
            <Field label="SQL / DQ"><Sel value={d.sqlDq} onChange={setVal('sqlDq')} opts={SQL_OPTIONS}/></Field>
            <Field label="SQL Date"><DateField value={d.sqlDate} onChange={setVal('sqlDate')}/></Field>
            <Field label="SQO"><Sel value={d.sqo} onChange={setVal('sqo')} opts={SQO_OPTIONS}/></Field>
            <Field label="SQO Date"><DateField value={d.sqoDate} onChange={setVal('sqoDate')}/></Field>
            <Field label="Multithreading"><Sel value={d.multithreading} onChange={setVal('multithreading')} opts={MT_OPTIONS}/></Field>
          </div>

          {/* MQL Quality — feeds the Analytics quality chart */}
          <div style={{marginBottom:14,padding:'12px 14px',background:C.surface3,borderRadius:8,border:`1px solid ${C.border2}`}} onClick={stopProp} onMouseDown={stopProp}>
            <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10}}>
              MQL Quality · <span style={{fontWeight:400,textTransform:'none',letterSpacing:'normal',color:C.text3}}>feeds the quality chart in Analytics</span>
            </div>
            <div style={{display:'flex',gap:8}}>
              {[
                {val:'hq', label:'HQ MQL', desc:'Squarely ICP', color:'#f5a623', dim:'rgba(245,166,35,0.18)', border:'rgba(245,166,35,0.45)'},
                {val:'lq', label:'LQ MQL', desc:'Partial ICP', color:'#fb923c', dim:'rgba(251,146,60,0.15)', border:'rgba(251,146,60,0.4)'},
              ].map(opt=>{
                const active = d.mqlQuality===opt.val
                return (
                  <button
                    key={opt.val}
                    onMouseDown={stopProp}
                    onClick={e=>{
                      e.stopPropagation()
                      const newVal=active?'':opt.val
                      setVal('mqlQuality')(newVal)
                      // Save immediately so inline dropdown stays in sync
                      const updated={...d,mqlQuality:newVal}
                      saveDetail(lead.email,updated); onSave(updated)
                    }}
                    style={{
                      flex:1, padding:'9px 12px', borderRadius:7, cursor:'pointer',
                      border:`1px solid ${active?opt.border:C.border2}`,
                      background:active?opt.dim:'transparent',
                      transition:'all 0.15s', textAlign:'left' as const,
                    }}
                  >
                    <div style={{fontSize:12,fontWeight:700,color:active?opt.color:C.text2,marginBottom:2}}>{opt.label}</div>
                    <div style={{fontSize:10,color:active?opt.color:C.text3}}>{opt.desc}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Account Tier — determines commission eligibility */}
          <div style={{marginBottom:14,padding:'12px 14px',background:C.surface3,borderRadius:8,border:`1px solid ${C.border2}`}} onClick={stopProp} onMouseDown={stopProp}>
            <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10}}>
              Account Tier · <span style={{fontWeight:400,textTransform:'none',letterSpacing:'normal',color:C.text3}}>A/B/E = ICP (commission eligible) · C = not ICP</span>
            </div>
            <div style={{display:'flex',gap:8}}>
              {[
                {val:'A', label:'Tier A', desc:'Top ICP', color:C.green, dim:'rgba(0,229,160,0.15)', border:'rgba(0,229,160,0.35)'},
                {val:'B', label:'Tier B', desc:'Strong ICP', color:'#60d4f4', dim:'rgba(96,212,244,0.15)', border:'rgba(96,212,244,0.35)'},
                {val:'E', label:'Tier E', desc:'Approved ICP', color:C.purpleL, dim:'rgba(168,156,248,0.15)', border:'rgba(168,156,248,0.35)'},
                {val:'C', label:'Tier C', desc:'Not ICP · no commission', color:C.red, dim:'rgba(255,92,92,0.12)', border:'rgba(255,92,92,0.35)'},
              ].map(opt=>{
                const active = d.accountTier===opt.val
                return (
                  <button
                    key={opt.val}
                    onMouseDown={stopProp}
                    onClick={e=>{
                      e.stopPropagation()
                      const newVal=active?'':opt.val
                      setVal('accountTier')(newVal)
                      const updated={...d,accountTier:newVal}
                      saveDetail(lead.email,updated); onSave(updated)
                    }}
                    style={{
                      flex:1, padding:'9px 12px', borderRadius:7, cursor:'pointer',
                      border:`1px solid ${active?opt.border:C.border2}`,
                      background:active?opt.dim:'transparent',
                      transition:'all 0.15s', textAlign:'left' as const,
                    }}
                  >
                    <div style={{fontSize:12,fontWeight:700,color:active?opt.color:C.text2,marginBottom:2}}>{opt.label}</div>
                    <div style={{fontSize:10,color:active?opt.color:C.text3}}>{opt.desc}</div>
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'160px 140px 160px 1fr 1fr 1fr',gap:12}}>
            <Field label="ACV ($)"><Inp value={d.acv} onChange={setVal('acv')} placeholder="e.g. 72000"/></Field>
            <Field label="Closed-Won"><Sel value={d.closedWon} onChange={setVal('closedWon')} opts={CLOSED_WON_OPTIONS}/></Field>
            <Field label="Closed-Won Date"><DateField value={d.closedWonDate} onChange={setVal('closedWonDate')}/></Field>
            <Field label="Salesforce URL"><Inp value={d.sfLink} onChange={setVal('sfLink')} placeholder="https://qawolf.lightning.force.com/…"/></Field>
            <Field label="Gong URL"><Inp value={d.gongUrl} onChange={setVal('gongUrl')} placeholder="https://app.gong.io/…"/></Field>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              <span style={labelStyle}>Notes</span>
              <textarea
                ref={notesRef}
                defaultValue={d.notes}
                onClick={stopProp}
                onFocus={stopProp}
                onKeyDown={stopProp}
                onKeyUp={stopProp}
                onMouseDown={stopProp}
                placeholder="Any context, next steps, or flags…"
                style={{...inputStyle,height:60,resize:'vertical'}}
              />
            </div>
          </div>
        </div>
      </td>
    </tr>
  )
}

// ─── Interactive chart primitives ────────────────────────────────────────────
function PieChart({data,onSliceClick}:{data:{label:string;value:number;color:string}[];onSliceClick?:(label:string)=>void}) {
  const [hovered,setHovered]=useState<number|null>(null)
  const total=data.reduce((s,d)=>s+d.value,0)
  if (total===0) return <div style={{textAlign:'center',color:C.text3,fontSize:12,padding:'40px 0'}}>No data for this period</div>
  let angle=-Math.PI/2
  const slices=data.filter(d=>d.value>0).map((d,i)=>{
    const pct=d.value/total; const start=angle; angle+=pct*2*Math.PI
    return {...d,pct,start,end:angle,i}
  })
  const arc=(cx:number,cy:number,r:number,start:number,end:number)=>{
    if (end-start>=2*Math.PI-0.001) return `M${cx},${cy-r} A${r},${r},0,1,1,${cx-0.001},${cy-r} Z`
    const x1=cx+r*Math.cos(start),y1=cy+r*Math.sin(start)
    const x2=cx+r*Math.cos(end),y2=cy+r*Math.sin(end)
    const large=end-start>Math.PI?1:0
    return `M${cx},${cy} L${x1},${y1} A${r},${r},0,${large},1,${x2},${y2} Z`
  }
  const hov=hovered!==null?slices[hovered]:null
  return (
    <div style={{display:'flex',alignItems:'center',gap:28,flexWrap:'wrap'}}>
      <svg width={170} height={170} viewBox="0 0 170 170" style={{overflow:'visible'}}>
        {slices.map((s,i)=>{
          const isHov=hovered===i
          const scale=isHov?1.05:1
          const mid=(s.start+s.end)/2
          const tx=isHov?Math.cos(mid)*5:0
          const ty=isHov?Math.sin(mid)*5:0
          return (
            <g key={i} transform={`translate(${tx},${ty}) scale(${scale})`} style={{transformOrigin:`85px 85px`,cursor:onSliceClick?'pointer':'default',transition:'transform 0.15s'}}
               onMouseEnter={()=>setHovered(i)} onMouseLeave={()=>setHovered(null)}
               onClick={()=>onSliceClick&&onSliceClick(s.label)}>
              <path d={arc(85,85,76,s.start,s.end)} fill={s.color} stroke={C.surface} strokeWidth={2} opacity={hovered!==null&&!isHov?0.65:1}/>
            </g>
          )
        })}
        <circle cx={85} cy={85} r={38} fill={C.surface} style={{pointerEvents:'none'}}/>
        {hov?(
          <>
            <text x={85} y={80} textAnchor="middle" fill={hov.color} fontSize={20} fontWeight={800} style={{pointerEvents:'none'}}>{hov.value}</text>
            <text x={85} y={95} textAnchor="middle" fill={C.text3} fontSize={9} style={{pointerEvents:'none'}}>{hov.label}</text>
          </>
        ):(
          <>
            <text x={85} y={80} textAnchor="middle" fill={C.text} fontSize={22} fontWeight={800} style={{pointerEvents:'none'}}>{total}</text>
            <text x={85} y={95} textAnchor="middle" fill={C.text3} fontSize={10} style={{pointerEvents:'none'}}>total</text>
          </>
        )}
      </svg>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {slices.map((s,i)=>(
          <div key={i} onClick={()=>onSliceClick&&onSliceClick(s.label)} onMouseEnter={()=>setHovered(i)} onMouseLeave={()=>setHovered(null)}
               style={{display:'flex',alignItems:'center',gap:8,cursor:onSliceClick?'pointer':'default',padding:'3px 6px',borderRadius:6,background:hovered===i?'rgba(255,255,255,0.05)':'transparent',transition:'background 0.1s'}}>
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

function BarChart({bars,title,statuses:stMap,details:dets,onViewLead}:{
  bars:{label:string;values:{status:Status;count:number}[];total:number;leads:AppLead[]}[];
  title:string;
  statuses:Record<string,Status>;
  details:Record<string,LeadDetail>;
  onViewLead:(email:string)=>void;
}) {
  const [hovered,setHovered]=useState<number|null>(null)
  const [selected,setSelected]=useState<number|null>(null)
  const maxTotal=Math.max(...bars.map(b=>b.total),1)
  const stOrder:Status[]=['new','contacted','inprogress','closedwon','booked','nurture','lost','dq','na']

  const selectedBar=selected!==null?bars[selected]:null

  return (
    <div>
      <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:14}}>{title} · <span style={{fontWeight:400,textTransform:'none',letterSpacing:'normal',color:C.text3}}>click a bar to see leads</span></div>
      <div style={{display:'flex',alignItems:'flex-end',gap:6,height:160}}>
        {bars.map((b,i)=>{
          const isHov=hovered===i
          const isSel=selected===i
          return (
            <div key={i}
                 onMouseEnter={()=>setHovered(i)}
                 onMouseLeave={()=>setHovered(null)}
                 onClick={()=>setSelected(p=>p===i?null:i)}
                 style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,flex:1,cursor:'pointer',transition:'opacity 0.15s',opacity:selected!==null&&!isSel?0.4:1}}>
              <span style={{fontSize:10,color:isSel||isHov?C.text:C.text3,fontWeight:isSel||isHov?700:600,transition:'color 0.1s'}}>{b.total||''}</span>
              <div style={{
                width:'100%',display:'flex',flexDirection:'column',justifyContent:'flex-end',height:130,
                borderRadius:4,overflow:'hidden',background:C.surface3,
                boxShadow:isSel?`0 0 0 2px ${C.purple}`:isHov?`0 0 0 1px rgba(255,255,255,0.2)`:undefined,
                transition:'box-shadow 0.15s'
              }}>
                {stOrder.map(s=>{
                  const v=b.values.find(x=>x.status===s)?.count||0
                  if (!v) return null
                  const h=Math.round((v/maxTotal)*130)
                  return (
                    <div key={s} title={`${STATUS_CONFIG[s].label}: ${v}`}
                         style={{width:'100%',height:h,background:STATUS_CONFIG[s].color,flexShrink:0}}/>
                  )
                })}
              </div>
              <span style={{fontSize:9,color:isSel?C.purple:C.text3,whiteSpace:'nowrap',transform:'rotate(-35deg)',transformOrigin:'top center',marginTop:4,display:'block',height:24,fontWeight:isSel?700:400}}>{b.label}</span>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{display:'flex',gap:12,marginTop:20,flexWrap:'wrap'}}>
        {stOrder.filter(s=>bars.some(b=>b.values.find(v=>v.status===s&&v.count>0))).map(s=>(
          <div key={s} style={{display:'flex',alignItems:'center',gap:4}}>
            <span style={{width:8,height:8,borderRadius:2,background:STATUS_CONFIG[s].color,flexShrink:0}}/>
            <span style={{fontSize:10,color:C.text3}}>{STATUS_CONFIG[s].label}</span>
          </div>
        ))}
      </div>

      {/* Drill-down panel */}
      {selectedBar&&(
        <div style={{marginTop:16,background:C.surface3,borderRadius:8,border:`1px solid ${C.purple}`,overflow:'hidden'}}>
          {/* Panel header */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderBottom:`1px solid ${C.border}`}}>
            <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <span style={{fontSize:13,fontWeight:700}}>{selectedBar.label}</span>
              <span style={{fontSize:12,color:C.text3}}>· {selectedBar.total} lead{selectedBar.total!==1?'s':''}</span>
              {/* Status breakdown pills */}
              <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                {stOrder.filter(s=>(selectedBar.values.find(v=>v.status===s)?.count||0)>0).map(s=>{
                  const count=selectedBar.values.find(v=>v.status===s)?.count||0
                  return (
                    <span key={s} style={{fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:999,background:STATUS_CONFIG[s].dim,color:STATUS_CONFIG[s].color,border:`1px solid ${STATUS_CONFIG[s].border}`}}>
                      {STATUS_CONFIG[s].label} {count}
                    </span>
                  )
                })}
              </div>
            </div>
            <button onClick={()=>setSelected(null)} style={{fontSize:11,color:C.text3,background:'none',border:'none',cursor:'pointer',padding:'2px 6px'}}>✕</button>
          </div>

          {/* Lead list */}
          <div style={{maxHeight:280,overflowY:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:C.surface2}}>
                  {['Account','Domain','SF','Received','AE','Status'].map(h=>(
                    <th key={h} style={{textAlign:'left',padding:'7px 12px',fontSize:9,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedBar.leads
                  .sort((a,b)=>(new Date(b.receivedAt||0).getTime())-(new Date(a.receivedAt||0).getTime()))
                  .map(lead=>{
                    const s=stMap[lead.email]||'new'
                    const cfg=STATUS_CONFIG[s]
                    const det=dets[lead.email]
                    const displayName=lead.account||det?.prospectName||formatDomain(lead.domain)
                    const sfLink=lead.sfUrl||det?.sfLink
                    const received=lead.receivedAt?new Date(lead.receivedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}):lead.date||'—'
                    return (
                      <tr key={lead.email} style={{borderBottom:`1px solid ${C.border}`,cursor:'pointer'}} onClick={()=>onViewLead(lead.email)}>
                        <td style={{padding:'8px 12px'}}>
                          <div style={{fontSize:12,fontWeight:600,color:C.text}}>{displayName}</div>
                          {det?.prospectName&&lead.account&&<div style={{fontSize:10,color:C.text3}}>{det.prospectName}</div>}
                        </td>
                        <td style={{padding:'8px 12px',fontSize:11,color:C.text3}}>{lead.domain}</td>
                        <td style={{padding:'8px 12px'}}>
                          {sfLink
                            ? <a href={sfLink} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:999,border:`1px solid ${C.green}`,background:'rgba(0,229,160,0.1)',color:C.green,textDecoration:'none'}}>↗ SF</a>
                            : <span style={{fontSize:11,color:C.text3}}>—</span>}
                        </td>
                        <td style={{padding:'8px 12px',fontSize:11,color:C.text3,whiteSpace:'nowrap'}}>{received}</td>
                        <td style={{padding:'8px 12px',fontSize:11,color:C.text3}}>{det?.ae||'—'}</td>
                        <td style={{padding:'8px 12px'}}>
                          <span style={{fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:999,background:cfg.dim,color:cfg.color,border:`1px solid ${cfg.border}`,whiteSpace:'nowrap'}}>{cfg.label}</span>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
          <div style={{padding:'8px 16px',fontSize:11,color:C.text3,borderTop:`1px solid ${C.border}`}}>Click any row to jump to that lead in Pipeline view</div>
        </div>
      )}
    </div>
  )
}

// ─── MQL Quality Chart ────────────────────────────────────────────────────────
// Historical Notion data covers Mar 21–Apr 1. From Apr 2 onward the chart reads
// live from pipeline statuses: hqmql=HQ, lqmql=LQ, new/dq/na=DQ (didn't pursue).
const NOTION_MQL_DATA = [
  { date:'Mar 21', iso:'2026-03-21', dq:5,  hq:0, lq:0 },
  { date:'Mar 22', iso:'2026-03-22', dq:2,  hq:0, lq:0 },
  { date:'Mar 23', iso:'2026-03-23', dq:7,  hq:0, lq:0 },
  { date:'Mar 24', iso:'2026-03-24', dq:10, hq:0, lq:0 },
  { date:'Mar 25', iso:'2026-03-25', dq:9,  hq:1, lq:2 },
  { date:'Mar 26', iso:'2026-03-26', dq:12, hq:1, lq:2 },
  { date:'Mar 27', iso:'2026-03-27', dq:10, hq:0, lq:0 },
  { date:'Mar 28', iso:'2026-03-28', dq:7,  hq:0, lq:0 },
  { date:'Mar 29', iso:'2026-03-29', dq:1,  hq:0, lq:1 },
  { date:'Mar 30', iso:'2026-03-30', dq:19, hq:0, lq:0 },
  { date:'Mar 31', iso:'2026-03-31', dq:9,  hq:0, lq:1 },
  { date:'Apr 1',  iso:'2026-04-01', dq:10, hq:0, lq:0 },
]
// Live tracking starts Apr 2 — statuses drive quality classification
const LIVE_QUALITY_START = '2026-04-02'

function MQLQualityChart({allLeads,statuses,details}:{allLeads:AppLead[];statuses:Record<string,Status>;details:Record<string,LeadDetail>}) {
  const [hovered,  setHovered]  = useState<number|null>(null)
  const [groupBy,  setGroupBy]  = useState<'day'|'week'|'quarter'>('week')
  const [fromDate, setFromDate] = useState('')
  const [toDate,   setToDate]   = useState('')
  const barH = 120

  // Build live data from Apr 2 onward keyed by ISO date
  const liveDayMap = new Map<string,{dq:number;hq:number;lq:number}>()
  allLeads.forEach(l=>{
    if (!l.receivedAt) return
    const iso = l.receivedAt.slice(0,10)
    if (iso < LIVE_QUALITY_START) return
    if (!liveDayMap.has(iso)) liveDayMap.set(iso,{dq:0,hq:0,lq:0})
    const quality = details[l.email]?.mqlQuality||''
    const entry = liveDayMap.get(iso)!
    if (quality==='hq') entry.hq++
    else if (quality==='lq') entry.lq++
    else entry.dq++
  })

  const liveDays = Array.from(liveDayMap.entries())
    .sort(([a],[b])=>a.localeCompare(b))
    .map(([iso,counts])=>({
      date: new Date(iso+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}),
      iso, ...counts, isLive:true
    }))

  // All individual days (historical + live), filtered by date range
  const allDaysRaw = [
    ...NOTION_MQL_DATA.map(d=>({...d,isLive:false})),
    ...liveDays,
  ].filter(d=>{
    if (fromDate && d.iso < fromDate) return false
    if (toDate   && d.iso > toDate)   return false
    return true
  })

  // Group into bars — either per-day or per-week
  type Bar = {label:string; dq:number; hq:number; lq:number; isLive:boolean; isoStart:string}
  let bars: Bar[]

  if (groupBy==='day') {
    bars = allDaysRaw.map(d=>({
      label:d.date, dq:d.dq, hq:d.hq, lq:d.lq,
      isLive:d.isLive, isoStart:d.iso
    }))
  } else if (groupBy==='quarter') {
    const qMap = new Map<string,Bar>()
    allDaysRaw.forEach(d=>{
      const dt = new Date(d.iso+'T12:00:00')
      const q = Math.floor(dt.getMonth()/3)+1
      const y = dt.getFullYear()
      const key = `Q${q} ${y}`
      if (!qMap.has(key)) qMap.set(key, {label:`Q${q} ${y}`,dq:0,hq:0,lq:0,isLive:d.isLive,isoStart:d.iso})
      const b = qMap.get(key)!
      b.dq += d.dq; b.hq += d.hq; b.lq += d.lq
      if (d.isLive) b.isLive = true
    })
    bars = [...qMap.values()]
  } else {
    // Group by Monday-anchored week
    const weekMap = new Map<string,Bar>()
    allDaysRaw.forEach(d=>{
      const dt  = new Date(d.iso+'T12:00:00')
      const dow = (dt.getDay()+6)%7
      const mon = new Date(dt); mon.setDate(dt.getDate()-dow)
      const key = mon.toISOString().slice(0,10)
      if (!weekMap.has(key)) {
        const label = mon.toLocaleDateString('en-US',{month:'short',day:'numeric'})
        weekMap.set(key,{label:`Wk ${label}`,dq:0,hq:0,lq:0,isLive:false,isoStart:key})
      }
      const bar = weekMap.get(key)!
      bar.dq += d.dq; bar.hq += d.hq; bar.lq += d.lq
      if (d.isLive) bar.isLive = true
    })
    bars = Array.from(weekMap.entries()).sort(([a],[b])=>a.localeCompare(b)).map(([,b])=>b)
  }

  const maxTotal = Math.max(...bars.map(b=>b.dq+b.hq+b.lq), 1)

  return (
    <div>
      {/* Controls */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14,flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:4}}>
          {(['quarter','week','day'] as const).map(g=>(
            <button key={g} onClick={()=>setGroupBy(g)}
                    style={{fontSize:11,fontWeight:600,padding:'4px 10px',borderRadius:6,cursor:'pointer',border:`1px solid ${groupBy===g?C.purple:C.border2}`,background:groupBy===g?'rgba(123,110,246,0.18)':'transparent',color:groupBy===g?C.purpleL:C.text3}}>
              {g==='week'?'Weekly':g==='quarter'?'Quarterly':'Daily'}
            </button>
          ))}
        </div>
        <span style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em'}}>From</span>
        <input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}
               style={{fontSize:11,padding:'4px 8px',border:`1px solid ${C.border2}`,borderRadius:6,background:C.surface3,color:C.text2,outline:'none',colorScheme:'dark'}}/>
        <span style={{fontSize:11,color:C.text3}}>→</span>
        <input type="date" value={toDate} onChange={e=>setToDate(e.target.value)}
               style={{fontSize:11,padding:'4px 8px',border:`1px solid ${C.border2}`,borderRadius:6,background:C.surface3,color:C.text2,outline:'none',colorScheme:'dark'}}/>
        {(fromDate||toDate)&&(
          <button onClick={()=>{setFromDate('');setToDate('')}}
                  style={{fontSize:10,fontWeight:600,color:C.text3,background:'none',border:'none',cursor:'pointer',padding:'2px 6px'}}>✕ Clear</button>
        )}
        <span style={{fontSize:10,color:C.text3,marginLeft:'auto'}}>{bars.length} {groupBy==='week'?'weeks':groupBy==='quarter'?'quarters':'days'} shown</span>
      </div>

      {/* Bars */}
      <div style={{display:'flex',alignItems:'flex-end',gap:groupBy==='quarter'?12:groupBy==='week'?8:4,height:barH+40,position:'relative',overflowX:'hidden'}}>
        {bars.length===0&&(
          <div style={{fontSize:12,color:C.text3,padding:'40px 0'}}>No data for selected range</div>
        )}
        {bars.map((b,i)=>{
          const total=b.dq+b.hq+b.lq
          const isHov=hovered===i
          const dqH=Math.round((b.dq/maxTotal)*barH)
          const hqH=Math.round((b.hq/maxTotal)*barH)
          const lqH=Math.round((b.lq/maxTotal)*barH)
          return (
            <div key={i} onMouseEnter={()=>setHovered(i)} onMouseLeave={()=>setHovered(null)}
                 style={{display:'flex',flexDirection:'column',alignItems:'center',flex:1,minWidth:groupBy==='quarter'?60:groupBy==='week'?32:16,cursor:'default',transition:'opacity 0.15s',opacity:hovered!==null&&!isHov?0.4:1,position:'relative'}}>
              {isHov&&(
                <div style={{position:'absolute',bottom:barH+10,left:'50%',transform:'translateX(-50%)',background:C.surface,border:`1px solid ${C.border2}`,borderRadius:6,padding:'6px 10px',zIndex:10,whiteSpace:'nowrap',boxShadow:'0 4px 12px rgba(0,0,0,0.4)'}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:4}}>
                    {b.label} · {total} total
                    {b.isLive&&<span style={{fontSize:9,color:C.green,marginLeft:6,fontWeight:400}}>● live</span>}
                  </div>
                  <div style={{fontSize:10,color:C.red}}>DQ / untagged: {b.dq}</div>
                  {b.hq>0&&<div style={{fontSize:10,color:C.amber}}>HQ MQL: {b.hq}</div>}
                  {b.lq>0&&<div style={{fontSize:10,color:'#fb923c'}}>LQ MQL: {b.lq}</div>}
                  {total>0&&<div style={{fontSize:10,color:C.text3,marginTop:2}}>{Math.round(((b.hq+b.lq)/total)*100)}% qualified</div>}
                </div>
              )}
              <span style={{fontSize:10,color:isHov?C.text:C.text3,fontWeight:isHov?700:400,marginBottom:2}}>{total||''}</span>
              <div style={{width:'100%',height:barH,display:'flex',flexDirection:'column',justifyContent:'flex-end',
                           borderRadius:4,overflow:'hidden',background:C.surface3,
                           boxShadow:isHov?`0 0 0 1.5px ${b.isLive?C.green:C.purple}`:undefined,
                           outline:b.isLive?`1px solid rgba(0,229,160,0.15)`:'none',transition:'box-shadow 0.15s'}}>
                {dqH>0&&<div style={{width:'100%',height:dqH,background:C.red,flexShrink:0}}/>}
                {lqH>0&&<div style={{width:'100%',height:lqH,background:'#fb923c',flexShrink:0}}/>}
                {hqH>0&&<div style={{width:'100%',height:hqH,background:C.amber,flexShrink:0}}/>}
              </div>
              <span style={{fontSize:groupBy==='quarter'?9:groupBy==='week'?9:7,color:isHov?(b.isLive?C.green:C.purpleL):C.text3,
                            whiteSpace:'nowrap',transform:'rotate(-35deg)',transformOrigin:'top center',
                            marginTop:4,display:'block',height:22,fontWeight:isHov?700:400}}>{b.label}</span>
            </div>
          )
        })}
      </div>

      {/* Summary row */}
      {bars.length>0&&(
        <div style={{display:'flex',gap:16,marginTop:8,fontSize:11,flexWrap:'wrap',paddingTop:8,borderTop:`1px solid ${C.border}`}}>
          {(()=>{
            const totDq=bars.reduce((s,b)=>s+b.dq,0)
            const totHq=bars.reduce((s,b)=>s+b.hq,0)
            const totLq=bars.reduce((s,b)=>s+b.lq,0)
            const tot=totDq+totHq+totLq
            return <>
              <span style={{color:C.text2,fontWeight:600}}>{tot} total{fromDate||toDate?' in range':''}</span>
              <span style={{color:C.red}}>DQ {totDq}</span>
              {totHq>0&&<span style={{color:C.amber}}>HQ {totHq}</span>}
              {totLq>0&&<span style={{color:'#fb923c'}}>LQ {totLq}</span>}
              {tot>0&&<span style={{color:C.text3}}>{Math.round(((totHq+totLq)/tot)*100)}% qualified</span>}
            </>
          })()}
        </div>
      )}

      {/* Live callout */}
      {liveDays.length>0&&(
        <div style={{marginTop:10,fontSize:11,color:C.text3,display:'flex',alignItems:'center',gap:6}}>
          <span style={{width:7,height:7,borderRadius:'50%',background:C.green,display:'inline-block',flexShrink:0}}/>
          Live from Apr 2. Tag leads <strong style={{color:C.amber}}>HQ MQL</strong> or <strong style={{color:'#fb923c'}}>LQ MQL</strong> in the expanded card to classify. Untagged = DQ.
        </div>
      )}
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
  const [auth, setAuth] = useState<AuthState>(null)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [passErr, setPassErr] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [activeRepId, setActiveRepId] = useState('jonathan')
  const [ecSaving, setEcSaving] = useState(false)
  const [reps, setReps] = useState<Rep[]>(DEFAULT_REPS)
  const [showRepEditor, setShowRepEditor] = useState(false)
  const [editingRep, setEditingRep] = useState<Rep|null>(null)

  // ── Auth: check sessionStorage on mount ───────────────────────────────────
  useEffect(()=>{
    const saved = sessionStorage.getItem('mql-auth')
    if (saved) { try {
      const parsed=JSON.parse(saved)
      // Clear stale auth from old format (missing allowedViews)
      if (parsed && parsed.role && !('allowedViews' in parsed) && parsed.role!=='rep') {
        sessionStorage.removeItem('mql-auth')
      } else {
        // Re-validate allowedViews from current credentials to pick up permission changes
        if (parsed && parsed.email && parsed.role!=='rep') {
          const cred=USER_CREDENTIALS.find(u=>u.email===parsed.email)
          if (cred) { parsed.allowedViews=cred.allowedViews; parsed.role=cred.role; sessionStorage.setItem('mql-auth',JSON.stringify(parsed)) }
        }
        setAuth(parsed)
      }
    } catch { sessionStorage.removeItem('mql-auth') } }
    // Check URL param for direct rep access (bypasses login)
    const params = new URLSearchParams(window.location.search)
    const REP_VIEWS: DashView[] = ['pipeline','analytics','reporting','commissions','leaderboard','roundrobin']
    const repParam = params.get('rep')
    if (repParam) {
      const a:AuthState = { role:'rep', repId: repParam, allowedViews:REP_VIEWS }
      setAuth(a); sessionStorage.setItem('mql-auth', JSON.stringify(a))
    }
    // Public leaderboard access via ?view=leaderboard
    const viewParam = params.get('view')
    if (viewParam === 'leaderboard') {
      setView('leaderboard')
      if (!saved && !repParam) {
        const a:AuthState = { role:'rep', repId: 'jonathan', allowedViews:REP_VIEWS }
        setAuth(a); sessionStorage.setItem('mql-auth', JSON.stringify(a))
      }
    }
    // RevOps access via ?view=revops
    if (viewParam === 'revops') {
      const a:AuthState = { role:'revops', allowedViews:['revops_commissions','commissions','analytics'] }
      setAuth(a); sessionStorage.setItem('mql-auth', JSON.stringify(a))
      setView('revops_commissions')
    }
    // Load rep registry from Edge Config
    fetch('/api/rep-data?repId=__registry__').then(r=>r.json()).then(({data})=>{
      if (data?.reps) setReps(data.reps)
    }).catch(()=>{})
    // Load spiffs and commission adjustments from localStorage
    try { const s=JSON.parse(localStorage.getItem('mql-spiffs')||'[]'); if(Array.isArray(s)) setSpiffs(s) } catch {}
    try { const a=JSON.parse(localStorage.getItem('mql-comm-adj')||'[]'); if(Array.isArray(a)) setCommAdjustments(a) } catch {}
    try { const a=JSON.parse(localStorage.getItem('rr-assignments')||'[]'); if(Array.isArray(a)) setRrAssignments(a) } catch {}
    try { const a=JSON.parse(localStorage.getItem('rr-skips')||'[]'); if(Array.isArray(a)) setRrSkips(a) } catch {}
    try { const a=JSON.parse(localStorage.getItem('rr-manager')||'{}'); if(a&&typeof a==='object'&&Array.isArray(a.removedAEs)) setRrMgr(a) } catch {}
    try { const s=localStorage.getItem('rr-seg'); if(s==='Major'||s==='Commercial') setRrSeg(s) } catch {}
    try { const r=localStorage.getItem('rr-region'); if(r==='West'||r==='East') setRrRegion(r) } catch {}
    try { const r=JSON.parse(localStorage.getItem('roundRobinAERoster')||'null'); if(Array.isArray(r)&&r.length>0) setRrRoster(r); else { const m=migrateAERoster(); setRrRoster(m); localStorage.setItem('roundRobinAERoster',JSON.stringify(m)) } } catch { const m=migrateAERoster(); setRrRoster(m); localStorage.setItem('roundRobinAERoster',JSON.stringify(m)) }
    try { const w=localStorage.getItem('rr-equity-window'); if(w==='week'||w==='month'||w==='quarter'||w==='year') setRrEquityWindow(w) } catch {}
  },[])

  const isManagerRole=(a:AuthState):boolean=>!!a&&'role' in a&&MANAGER_ROLES.includes(a.role as UserRole)
  const isBdm=auth&&'email' in auth&&isBdmEmail(auth.email)
  const canView=(v:DashView):boolean=>{
    if (!auth) return false
    if (!('allowedViews' in auth) || !auth.allowedViews || auth.allowedViews==='all') return true
    return auth.allowedViews.includes(v)
  }

  const handleLogin=()=>{
    const emailLower=loginEmail.trim().toLowerCase()
    // Check user credentials (email + password)
    const user=USER_CREDENTIALS.find(u=>u.email.toLowerCase()===emailLower&&u.password===loginPass)
    if (user) {
      const a:AuthState = { role:user.role, email:user.email, allowedViews:user.allowedViews }
      setAuth(a); sessionStorage.setItem('mql-auth', JSON.stringify(a))
      setPassErr(false)
      // Set default view based on access
      if (user.allowedViews!=='all') {
        setView(user.allowedViews[0])
      }
      return
    }
    // Fall back: check rep passcodes (email + password, for reps set by manager)
    const rep = reps.find(r=>r.slackId && r.slackId.toLowerCase()===emailLower && r.passcode && r.passcode===loginPass)
    const REP_VIEWS: DashView[] = ['pipeline','analytics','reporting','commissions','leaderboard','roundrobin']
    if (rep) {
      const a:AuthState = { role:'rep', repId: rep.id, allowedViews:REP_VIEWS }
      setAuth(a); sessionStorage.setItem('mql-auth', JSON.stringify(a))
      setPassErr(false)
      return
    }
    setPassErr(true)
  }

  const saveRepRegistry = async (updated: Rep[]) => {
    setReps(updated)
    await fetch('/api/rep-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repId: '__registry__', data: { reps: updated } }),
    }).catch(()=>{})
  }

  // Which rep's data are we currently viewing?
  const currentRep = (auth && 'repId' in auth)
    ? (reps.find(r=>r.id===auth.repId) || reps[0])
    : (reps.find(r=>r.id===activeRepId) || reps[0])

  // ── Edge Config sync ──────────────────────────────────────────────────────
  const syncToEdgeConfig = useCallback(async () => {
    if (!currentRep?.slackId) return
    setEcSaving(true)
    try {
      const data = {
        statuses: localStorage.getItem('mql-st'),
        details:  localStorage.getItem('mql-dt'),
        names:    localStorage.getItem('mql-names'),
        manual:   localStorage.getItem('mql-manual'),
        deleted:  localStorage.getItem('mql-deleted'),
        spiffs:   localStorage.getItem('mql-spiffs'),
        commAdj:  localStorage.getItem('mql-comm-adj'),
        savedAt:  new Date().toISOString(),
      }
      await fetch('/api/rep-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repId: currentRep.slackId, data }),
      })
    } catch(e) { console.error('Edge Config sync failed:', e) }
    finally { setEcSaving(false) }
  }, [currentRep])

  const loadFromEdgeConfig = useCallback(async (slackId: string) => {
    const keys = ['mql-st','mql-dt','mql-names','mql-manual','mql-deleted'] as const

    // Always start clean when switching reps so one rep never inherits another rep's view
    keys.forEach(k => localStorage.removeItem(k))

    try {
      const res = await fetch(`/api/rep-data?repId=${slackId}`)
      const payload = await res.json()
      const data = payload?.data ?? payload

      if (data) {
        if (data['mql-st'] || data.statuses) localStorage.setItem('mql-st', data['mql-st'] ?? data.statuses)
        if (data['mql-dt'] || data.details) localStorage.setItem('mql-dt', data['mql-dt'] ?? data.details)
        if (data['mql-names'] || data.names) localStorage.setItem('mql-names', data['mql-names'] ?? data.names)
        if (data['mql-manual'] || data.manual) localStorage.setItem('mql-manual', data['mql-manual'] ?? data.manual)
        if (data['mql-deleted'] || data.deleted) localStorage.setItem('mql-deleted', data['mql-deleted'] ?? data.deleted)
      }
    } catch(e) {
      console.error('Rep data load failed:', e)
    }

    setStatuses(getSt())
    setDetails(getDetails())
    setNameOverrides(getNameOverrides())
    setManualLeads(getManualLeads())
    setDeletedEmails(getDeletedEmails())
  }, [])

  const [liveLeads,  setLiveLeads]  = useState<AppLead[]>([])
  const [statuses,   setStatuses]   = useState<Record<string,Status>>({})
  const [details,    setDetails]    = useState<Record<string,LeadDetail>>({})
  const [view,       setView]       = useState<View>('pipeline')
  const [period,     setPeriod]     = useState<PeriodFilter>('all')
  const [pipCustomFrom,setPipCustomFrom]=useState('')
  const [pipCustomTo,setPipCustomTo]=useState('')
  const [pipCompare,setPipCompare]=useState(false)
  const [pipComparePeriod,setPipComparePeriod]=useState<PeriodFilter>('q1')
  const [pipCompareFrom,setPipCompareFrom]=useState('')
  const [pipCompareTo,setPipCompareTo]=useState('')
  const [worked,     setWorked]     = useState<WorkedFilter>('all')
  const [stFilter,   setStFilter]   = useState<StatusFilter>('all')
  const [reportTimeframe, setReportTimeframe] = useState<ReportTimeframe>('quarterly')
  const [reportScope, setReportScope] = useState<ReportScope>('all_bdrs')
  const [reportBdrId, setReportBdrId] = useState<string>('')
  const [reportType, setReportType] = useState<ReportType>('full_funnel')
  const [reportRangeStart, setReportRangeStart] = useState('')
  const [reportRangeEnd, setReportRangeEnd] = useState('')
  const [reportGenerated, setReportGenerated] = useState(false)
  const [reportExpandedStatus,setReportExpandedStatus]=useState<string|null>(null)
  const [reportExpandedSource,setReportExpandedSource]=useState<string|null>(null)
  const [reportExpandedVelocity,setReportExpandedVelocity]=useState<string|null>(null)
  const [oppPeriod,setOppPeriod]=useState<'week'|'month'|'quarter'>('quarter')
  const [oppMode,setOppMode]=useState<'sqo'|'active'|'lost'|'closedwon'>('sqo')
  const [oppFrom,setOppFrom]=useState('')
  const [oppTo,setOppTo]=useState('')
  const [mqlView,setMqlView]=useState<'daily'|'quarterly'>('daily')
  const [detailFilter,setDetailFilter]=useState<'none'|'sql'|'sqo'>('none')
  const [pipelineDir,setPipelineDir]=useState<'all'|'inbound'|'outbound'>('all')
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string|null>(null)
  const [fetchedAt,  setFetchedAt]  = useState<string|null>(null)
  const [copied,     setCopied]     = useState<string|null>(null)
  const [expanded,   setExpanded]   = useState<string|null>(null)
  const [chartPeriod,setChartPeriod]= useState<'week'|'month'|'quarter'>('week')
  const [chartFrom,  setChartFrom]  = useState('')
  const [chartTo,    setChartTo]    = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [manualLeads,setManualLeads]= useState<AppLead[]>([])
  const [nameOverrides,setNameOverrides]=useState<Record<string,string>>({})
  const [deletedEmails,setDeletedEmails]=useState<Set<string>>(new Set())
  const [showHistory,setShowHistory]=useState(false)
  const [expandedMonth,setExpandedMonth]=useState<string|null>(null)
  const [lbMetrics,setLbMetrics]=useState<Set<LbMetric>>(new Set(['meetings','meetings_held','sqls','sqos']))
  const [lbPeriod,setLbPeriod]=useState<LbPeriod>('week')
  const [ocSegment,setOcSegment]=useState<'day'|'week'|'month'|'quarter'|'year'>('month')
  const [ocFrom,setOcFrom]=useState('')
  const [ocTo,setOcTo]=useState('')
  const [ocCompare,setOcCompare]=useState<'week'|'month'|'quarter'|'year'|null>(null)
  const [scSegment,setScSegment]=useState<'day'|'week'|'month'|'quarter'|'year'>('month')
  const [scFrom,setScFrom]=useState('')
  const [scTo,setScTo]=useState('')
  const [scCompare,setScCompare]=useState<'week'|'month'|'quarter'|'year'|null>(null)
  const [revopsSelectedRep,setRevopsSelectedRep]=useState('all')
  const [revopsPeriod,setRevopsPeriod]=useState<'week'|'month'|'quarter'|'year'|'all'|'custom'>('month')
  const [revopsFrom,setRevopsFrom]=useState('')
  const [revopsExpandedEvent,setRevopsExpandedEvent]=useState<string|null>(null)
  const [revopsTo,setRevopsTo]=useState('')
  const [commAdjustments,setCommAdjustments]=useState<{id:string;repId:string;month:string;amount:number;reason:string;createdAt:string}[]>([])
  const [showAdjModal,setShowAdjModal]=useState(false)
  const [editingAdj,setEditingAdj]=useState<{id:string;repId:string;month:string;amount:number;reason:string;createdAt:string}|null>(null)
  const [adjUndoStack,setAdjUndoStack]=useState<{snapshot:typeof commAdjustments;label:string}[]>([])
  const [adjUndoMsg,setAdjUndoMsg]=useState<string|null>(null)
  const [compPeriod,setCompPeriod]=useState<'comp_change'|'ytd'|'quarter'|'month'|'custom'>('comp_change')
  const [compFrom,setCompFrom]=useState('')
  const [compTo,setCompTo]=useState('')
  const [commRepFilter,setCommRepFilter]=useState('all')
  const [sqoTimeSeg,setSqoTimeSeg]=useState<'year'|'quarter'|'month'|'week'>('quarter')
  const [sqoExpandedAcct,setSqoExpandedAcct]=useState<string|null>(null)
  const [convSeg,setConvSeg]=useState<'year'|'quarter'|'month'|'week'>('month')
  const [convCompare,setConvCompare]=useState(false)
  const [convExpandedRow,setConvExpandedRow]=useState<string|null>(null)
  const [convExpandedMetric,setConvExpandedMetric]=useState<string>('all')
  // Round Robin state (v2 — click-to-book)
  const [rrAssignments,setRrAssignments]=useState<RRAssignment[]>([])
  const [rrSkips,setRrSkips]=useState<RRSkip[]>([])
  const [rrSeg,setRrSeg]=useState<'Major'|'Commercial'>('Commercial')
  const [rrRegion,setRrRegion]=useState<'West'|'East'>('East')
  const [rrMgr,setRrMgr]=useState<RRManagerSettings>({removedAEs:[]})
  const [rrViewAeIdx,setRrViewAeIdx]=useState(0) // which AE in the queue is currently shown
  const [rrWeekOffset,setRrWeekOffset]=useState(0) // 0=this week, 1=next, -1=prev
  const [rrShowSe,setRrShowSe]=useState(false)
  const [rrBookSlot,setRrBookSlot]=useState<{day:string;hour:number;min:number}|null>(null) // clicked slot
  const [rrBookAcct,setRrBookAcct]=useState('')
  const [rrShowSkipLog,setRrShowSkipLog]=useState(false)
  const [rrShowRecent,setRrShowRecent]=useState(false)
  const [rrBookOver,setRrBookOver]=useState(false) // allow booking over busy slots
  const [rrCalEvents,setRrCalEvents]=useState<{summary:string;start:string;end:string;isAllDay:boolean;isOOO:boolean}[]>([])
  const [rrCalError,setRrCalError]=useState<string|null>(null)
  const [rrCalLoading,setRrCalLoading]=useState(false)
  const [rrSeEvents,setRrSeEvents]=useState<{summary:string;start:string;end:string;isAllDay:boolean;isOOO:boolean}[]>([])
  const [rrSeError,setRrSeError]=useState<string|null>(null)
  const [rrFetchedCalKey,setRrFetchedCalKey]=useState('')
  const [rrFetchedSeKey,setRrFetchedSeKey]=useState('')
  const [rrRoster,setRrRoster]=useState<RosterAE[]>([])
  const [rrEquityWindow,setRrEquityWindow]=useState<'week'|'month'|'quarter'|'year'>('month')
  const [rrShowBackfillModal,setRrShowBackfillModal]=useState(false)
  const [rrShowManageModal,setRrShowManageModal]=useState(false)
  const [rrBfAE,setRrBfAE]=useState('')
  const [rrBfDate,setRrBfDate]=useState('')
  const [rrBfTime,setRrBfTime]=useState('')
  const [rrBfProspectName,setRrBfProspectName]=useState('')
  const [rrBfCompany,setRrBfCompany]=useState('')
  const [rrBfSource,setRrBfSource]=useState<string>('Inbound MQL')
  const [rrBfSfUrl,setRrBfSfUrl]=useState('')
  const [rrBfNotes,setRrBfNotes]=useState('')
  const [rrBfPass,setRrBfPass]=useState('')
  const [rrBfPassErr,setRrBfPassErr]=useState(false)
  const [rrEditAssignId,setRrEditAssignId]=useState<string|null>(null)
  const [rrEditAE,setRrEditAE]=useState('')
  const [rrEditSeg,setRrEditSeg]=useState<'Major'|'Commercial'>('Commercial')
  const [rrEditRegion,setRrEditRegion]=useState<'West'|'East'>('East')
  const [rrEditAcct,setRrEditAcct]=useState('')
  const [rrMgmtEditId,setRrMgmtEditId]=useState<string|null>(null)
  const [rrMgmtAddOpen,setRrMgmtAddOpen]=useState(false)
  const [rrMgmtName,setRrMgmtName]=useState('')
  const [rrMgmtEmail,setRrMgmtEmail]=useState('')
  const [rrMgmtCalEmail,setRrMgmtCalEmail]=useState('')
  const [rrMgmtSe,setRrMgmtSe]=useState('Ricky')
  const [rrMgmtSeg,setRrMgmtSeg]=useState<'Major'|'Commercial'>('Commercial')
  const [rrMgmtRegion,setRrMgmtRegion]=useState<'West'|'East'>('East')
  const [rrMgmtStatus,setRrMgmtStatus]=useState<'Active'|'Inactive'>('Active')
  const [rrMgmtPass,setRrMgmtPass]=useState('')
  const [rrMgmtPassErr,setRrMgmtPassErr]=useState(false)
  const [rrMgmtToast,setRrMgmtToast]=useState('')

  // Fetch AE calendar when the viewed AE or week changes
  const rrFetchCal=useCallback(async(calendarId:string,weekStart:string)=>{
    setRrCalLoading(true);setRrCalError(null)
    try{
      const res=await fetch(`/api/calendar?calendarId=${encodeURIComponent(calendarId)}&weekStart=${weekStart}`)
      const data=await res.json()
      if(data.error==='not_authenticated'){setRrCalError('not_authenticated');setRrCalEvents([])}
      else if(data.error){setRrCalError(data.error+(data.detail?': '+data.detail:''));setRrCalEvents([])}
      else{setRrCalEvents(data.events||[]);setRrCalError(null)}
    }catch{setRrCalError('fetch_failed');setRrCalEvents([])}
    finally{setRrCalLoading(false)}
  },[])

  const rrFetchSe=useCallback(async(calendarId:string,weekStart:string)=>{
    setRrSeError(null)
    try{
      const res=await fetch(`/api/calendar?calendarId=${encodeURIComponent(calendarId)}&weekStart=${weekStart}`)
      const data=await res.json()
      if(data.error){setRrSeError(data.error);setRrSeEvents([])}
      else{setRrSeEvents(data.events||[]);setRrSeError(null)}
    }catch{setRrSeError('fetch_failed');setRrSeEvents([])}
  },[])
  const [spiffs,setSpiffs]=useState<Spiff[]>([])
  const [showSpiffModal,setShowSpiffModal]=useState(false)
  const [editingSpiff,setEditingSpiff]=useState<Spiff|null>(null)

  const getManualLeads=():AppLead[]=>{ try { return JSON.parse(localStorage.getItem('mql-manual')||'[]') } catch { return [] } }
  const saveManualLeads=(leads:AppLead[])=>{ localStorage.setItem('mql-manual',JSON.stringify(leads)) }

  const getDeletedEmails=():Set<string>=>{ try { return new Set(JSON.parse(localStorage.getItem('mql-deleted')||'[]')) } catch { return new Set() } }
  const deleteAccount=(email:string)=>{
    // Remove from manual leads if it's a manual entry
    const isManual=manualLeads.some(l=>l.email===email)
    if(isManual){
      const cleaned=manualLeads.filter(l=>l.email!==email)
      setManualLeads(cleaned);saveManualLeads(cleaned)
    }
    // Also add to deleted set (needed for live/historical leads that keep reappearing from Slack)
    const updated=new Set([...getDeletedEmails(),email])
    localStorage.setItem('mql-deleted',JSON.stringify([...updated]))
    setDeletedEmails(updated)
    if (expanded===email) setExpanded(null)
    saveSnapshot('delete')
  }

  // ── History snapshots ────────────────────────────────────────────────────
  const MAX_SNAPSHOTS=20
  const getSnapshots=()=>{ try { return JSON.parse(localStorage.getItem('mql-history')||'[]') } catch { return [] } }
  const saveSnapshot=(trigger:string)=>{
    const snap={
      savedAt: new Date().toISOString(),
      trigger,
      'mql-st':   localStorage.getItem('mql-st'),
      'mql-dt':   localStorage.getItem('mql-dt'),
      'mql-names':localStorage.getItem('mql-names'),
      'mql-manual':localStorage.getItem('mql-manual'),
      'mql-deleted':localStorage.getItem('mql-deleted'),
    }
    const snaps=[snap,...getSnapshots()].slice(0,MAX_SNAPSHOTS)
    localStorage.setItem('mql-history',JSON.stringify(snaps))
  }
  const restoreSnapshot=(snap:any)=>{
    if (!window.confirm('Restore this snapshot? Current data will be replaced.')) return
    saveSnapshot('before-restore')
    const keys=['mql-st','mql-dt','mql-names','mql-manual','mql-deleted'] as const
    keys.forEach(k=>{ if(snap[k]) localStorage.setItem(k,snap[k]); else localStorage.removeItem(k) })
    setStatuses(getSt()); setDetails(getDetails())
    setNameOverrides(getNameOverrides()); setManualLeads(getManualLeads())
    setDeletedEmails(getDeletedEmails())
    setShowHistory(false)
    alert('Snapshot restored.')
  }

  const updateNameOverride=(email:string,name:string)=>{
    saveNameOverride(email,name)
    setNameOverrides(getNameOverrides())
  }

  // Seed historical statuses & details — NEVER overwrite existing user data
  const DATA_VERSION='v5'
  useEffect(()=>{
    const st=getSt(); const dt=getDetails()
    // Only fill in MISSING entries — never overwrite what the user has set
    HISTORICAL_LEADS.forEach(l=>{
      if (!st[l.email]) st[l.email]=HISTORICAL_STATUSES[l.email]||'new'
      if (!dt[l.email]) dt[l.email]={...EMPTY_DETAIL,...(HISTORICAL_DETAILS[l.email]||{})}
    })
    localStorage.setItem('mql-st',JSON.stringify(st))
    localStorage.setItem('mql-dt',JSON.stringify(dt))
    localStorage.setItem('mql-seeded-version',DATA_VERSION)
    setStatuses(st)
    setDetails(dt)
    setManualLeads(getManualLeads())
    setNameOverrides(getNameOverrides())
    setDeletedEmails(getDeletedEmails())
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

  // Load Edge Config data: on initial auth ONLY if localStorage is empty, always on manager rep switch
  const prevRepId = useRef<string|null>(null)
  const initialEcLoaded = useRef(false)
  useEffect(()=>{
    if (!currentRep?.slackId) return

    const isRepSwitch = prevRepId.current !== null && prevRepId.current !== currentRep.id && isManagerRole(auth)
    const isFirstAuth = !initialEcLoaded.current && auth
    const localDataEmpty = !localStorage.getItem('mql-st')

    if (!isRepSwitch && !isFirstAuth) {
      if (prevRepId.current === null) prevRepId.current = currentRep.id
      return
    }

    prevRepId.current = currentRep.id
    if (isFirstAuth) initialEcLoaded.current = true

    // Rep switch: always clear + reload from Edge Config
    // Initial auth: only load from EC if localStorage has no data (new device / cleared cache)
    if (isRepSwitch || (isFirstAuth && localDataEmpty)) {
      loadFromEdgeConfig(currentRep.slackId).then(()=>{
        // Re-seed historical entries on top of Edge Config data
        const st=getSt(); const dt=getDetails()
        HISTORICAL_LEADS.forEach(l=>{
          if (!st[l.email]) st[l.email]=HISTORICAL_STATUSES[l.email]||'new'
          if (!dt[l.email]) dt[l.email]={...EMPTY_DETAIL,...(HISTORICAL_DETAILS[l.email]||{})}
        })
        localStorage.setItem('mql-st',JSON.stringify(st))
        localStorage.setItem('mql-dt',JSON.stringify(dt))
        setStatuses(st); setDetails(dt)
        setManualLeads(getManualLeads()); setNameOverrides(getNameOverrides())
        setDeletedEmails(getDeletedEmails())
      })
    }
  },[currentRep?.id, auth?.role])

  const updateStatus=(email:string,v:Status)=>{ saveSt(email,v); setStatuses(p=>({...p,[email]:v})); if(v==='closedwon'){const d={...(getDetails()[email]||EMPTY_DETAIL),closedWon:'Yes'};saveDetail(email,d);setDetails(p=>({...p,[email]:d}))} saveSnapshot('status'); syncToEdgeConfig() }
  const updateDetail=(email:string,d:LeadDetail)=>{ saveDetail(email,d); setDetails(p=>({...p,[email]:d})); saveSnapshot('detail'); syncToEdgeConfig() }
  const copyEmail=(email:string)=>{ navigator.clipboard.writeText(email).then(()=>{ setCopied(email); setTimeout(()=>setCopied(null),2000) }) }

  const createContact=(account:string,email:string,domain:string)=>{
    // If this email was previously deleted, un-delete it so the new lead is visible
    if(deletedEmails.has(email)){
      const cleaned=new Set([...deletedEmails]);cleaned.delete(email)
      localStorage.setItem('mql-deleted',JSON.stringify([...cleaned]));setDeletedEmails(cleaned)
    }
    const newLead:AppLead={ email, domain, account, name:null, sfUrl:null, date:new Date().toISOString().split('T')[0], receivedAt:new Date().toISOString(), source:'bdr', repSlackId: currentRep?.slackId||null, repId: currentRep?.id||null, isManual:true }
    // Replace any existing manual lead with the same email (prevent duplicates)
    const updated=[...manualLeads.filter(l=>l.email!==email),newLead]
    setManualLeads(updated); saveManualLeads(updated)
    saveSt(email,'new')
    setStatuses(p=>({...p,[email]:'new'}))
    setShowCreate(false)
    syncToEdgeConfig()
  }

  // All leads = historical + manual + live (deduped by email AND domain)
  // Enrich live leads with baked-in SF links as permanent fallback
  const historicalDomains=new Set(HISTORICAL_LEADS.map(h=>h.domain))
  const enriched=(leads:AppLead[])=>leads.map(l=>({
    ...l,
    sfUrl: l.sfUrl || LIVE_SF_LINKS[l.email] || null,
    name: l.name || LIVE_PROSPECT_NAMES[l.email] || null,
  }))

  // Filter live leads by rep Slack ID.
  // Only filter when multiple reps are active AND current rep has a Slack ID.
  // Manager viewing Jonathan (only active rep) = show all leads unfiltered.
  const activeReps = reps.filter(r => r.slackId)
  const repSlackId = currentRep?.slackId || ''
  const isManagerView = currentRep?.id === 'jonathan'
  const shouldFilterByRep = !isManagerView && activeReps.length > 1 && !!repSlackId
  const filteredLiveLeads =
    isManagerView
      ? liveLeads.filter(l => !l.repSlackId || l.repSlackId === repSlackId)
      : repSlackId
        ? liveLeads.filter(l => l.repSlackId === repSlackId)
        : []

  const historicalLeadsForView = isManagerView ? HISTORICAL_LEADS : []

  const allLeads:AppLead[]=[
  ...historicalLeadsForView,
  ...enriched(
    manualLeads.filter(
      l =>
        (
          !currentRep?.id ||
          l.repId === currentRep.id ||
          (!l.repId && !!currentRep?.slackId && l.repSlackId === currentRep.slackId)
        ) &&
        !historicalLeadsForView.some(h=>h.email===l.email) &&
        !historicalDomains.has(l.domain)
    )
  ),
  ...enriched(filteredLiveLeads.filter(l=>!historicalLeadsForView.some(h=>h.email===l.email)&&!manualLeads.some(m=>m.email===l.email)&&!historicalDomains.has(l.domain))),
].filter(l=>!deletedEmails.has(l.email))

  // ── Pipeline filters ────────────────────────────────────────────────────────
  // Use the lead's business date (date field) for period filtering, not the Slack message timestamp.
  // For period checks, consider the lead date AND any activity dates (connected, meeting, SQL, SQO)
  // so a lead with recent activity in its details still appears in the relevant period.
  const periodRange=getPeriodRange(period,pipCustomFrom,pipCustomTo)
  const periodStart=periodRange.start
  const hasActivityInRange=(l:AppLead,start:Date,end:Date):boolean=>{
    const det=details[l.email]
    const activityDates=[det?.connectedDate,det?.meetingDate,det?.sqlDate,det?.sqoDate,det?.closedWonDate].filter(Boolean)
    if (activityDates.length>0) {
      return activityDates.some(d=>{const dt=new Date(d);return dt>=start&&dt<=end})
    }
    const fallback=l.date||l.receivedAt
    if (!fallback) return false
    const dt=new Date(fallback)
    return dt>=start&&dt<=end
  }
  const hasActivityInPeriod=(l:AppLead,start:Date):boolean=>hasActivityInRange(l,start,periodRange.end)
  // Inbound / Outbound direction filter
  const isOutbound=(l:AppLead):boolean=>OUTBOUND_SOURCES.has(details[l.email]?.sourceChannel||'')||l.email.includes('_lonescale')
  const dirFilter=(l:AppLead):boolean=>pipelineDir==='all'?true:pipelineDir==='outbound'?isOutbound(l):!isOutbound(l)

  const pipelineLeads=allLeads.filter(l=>{
    if (!l.date&&!l.receivedAt) return false
    if (period!=='all'&&!hasActivityInPeriod(l,periodStart)) return false
    if (!dirFilter(l)) return false
    const s=statuses[l.email]||'new'
    if (worked==='worked'&&s==='new') return false
    if (worked==='untouched'&&s!=='new') return false
    if (stFilter!=='all'&&s!==stFilter) return false
    const det=details[l.email]
    if (detailFilter==='sql'&&(det?.sqlDq||'')!=='Yes') return false
    if (detailFilter==='sqo'&&(det?.sqo||'')!=='Yes') return false
    return true
  })

  const pCounts=(Object.keys(STATUS_CONFIG) as Status[]).reduce((acc,s)=>{
    acc[s]=allLeads.filter(l=>{
      if (!l.date&&!l.receivedAt) return false
      if (period!=='all'&&!hasActivityInPeriod(l,periodStart)) return false
      if (!dirFilter(l)) return false
      return (statuses[l.email]||'new')===s
    }).length
    return acc
  },{} as Record<Status,number>)

  // ── Milestone-based counts (date-driven, not status-driven) ──
  // A lead counts as "booked" if it has a meetingDate OR is in a post-booked status
  // (inprogress, closedwon). Scoped to period using meetingDate.
  const BOOKED_STATUSES_SET=new Set<Status>(['booked','inprogress','closedwon'])
  const dateInRange=(d:string|undefined,start:Date,end:Date):boolean=>{if(!d)return false;const dt=new Date(d);return dt>=start&&dt<=end}
  const bookedCount=allLeads.filter(l=>{
    if (!dirFilter(l)) return false
    const det=details[l.email]
    const s=statuses[l.email]||'new'
    const isBooked=!!(det?.meetingDate)||BOOKED_STATUSES_SET.has(s)
    if (!isBooked) return false
    if (period==='all') return true
    // Use meetingDate for period scoping if available, else fall back to activity dates
    if (det?.meetingDate) return dateInRange(det.meetingDate,periodRange.start,periodRange.end)
    return hasActivityInRange(l,periodRange.start,periodRange.end)
  }).length
  // SQL and SQO counts — driven by detail fields, scoped to period by their specific dates
  const sqlCount=allLeads.filter(l=>{
    if (!dirFilter(l)) return false
    const det=details[l.email]
    if ((det?.sqlDq||'')!=='Yes') return false
    if (period==='all') return true
    const rd=det?.sqlDate||det?.meetingDate
    if (rd) return dateInRange(rd,periodRange.start,periodRange.end)
    return hasActivityInRange(l,periodRange.start,periodRange.end)
  }).length
  const sqoCount=allLeads.filter(l=>{
    if (!dirFilter(l)) return false
    const det=details[l.email]
    if ((det?.sqo||'')!=='Yes') return false
    if (period==='all') return true
    const rd=det?.sqoDate||det?.sqlDate||det?.meetingDate
    if (rd) return dateInRange(rd,periodRange.start,periodRange.end)
    return hasActivityInRange(l,periodRange.start,periodRange.end)
  }).length
  const sqlAllTime=allLeads.filter(l=>(details[l.email]?.sqlDq||'')==='Yes').length
  const sqoAllTime=allLeads.filter(l=>(details[l.email]?.sqo||'')==='Yes').length

  // ── Analytics data ──────────────────────────────────────────────────────────
  // Pie: all-time status breakdown
  const pieData=(Object.keys(STATUS_CONFIG) as Status[])
    .map(s=>({label:STATUS_CONFIG[s].label,value:allLeads.filter(l=>(statuses[l.email]||'new')===s).length,color:STATUS_CONFIG[s].color}))
    .filter(d=>d.value>0)

  // Bar: group leads by week or month, stacked by status, with optional date range filter
  const buildBars=(groupBy:'week'|'month'|'quarter')=>{
    const groups=new Map<string,{label:string;date:Date;byStatus:Record<Status,number>;leads:AppLead[]}>()
    allLeads.forEach(l=>{
      if (!l.receivedAt) return
      const d=new Date(l.receivedAt)
      if (chartFrom && d < new Date(chartFrom)) return
      if (chartTo   && d > new Date(chartTo+'T23:59:59')) return
      const key=groupBy==='week'?getWeekLabel(d):groupBy==='quarter'?getQuarterLabel(d.toISOString()):getMonthLabel(d)
      if (!groups.has(key)) groups.set(key,{label:key,date:d,byStatus:{new:0,contacted:0,inprogress:0,booked:0,nurture:0,lost:0,dq:0,na:0,closedwon:0},leads:[]})
      const s=statuses[l.email]||'new'
      groups.get(key)!.byStatus[s]++
      groups.get(key)!.leads.push(l)
    })
    return Array.from(groups.values())
      .sort((a,b)=>a.date.getTime()-b.date.getTime())
      .slice(-24)
      .map(g=>({
        label:g.label,
        total:Object.values(g.byStatus).reduce((s,v)=>s+v,0),
        values:(Object.keys(g.byStatus) as Status[]).map(s=>({status:s,count:g.byStatus[s]})),
        leads:g.leads,
      }))
  }

  // ── Row renderer ─────────────────────────────────────────────────────────────
  const renderRow=(lead:AppLead)=>{
    // Guard: if localStorage has stale hqmql/lqmql from old version, treat as new
    const rawStatus=statuses[lead.email]||'new'
    const s=(rawStatus in STATUS_CONFIG ? rawStatus : 'new') as Status
    const cfg=STATUS_CONFIG[s]
    const dot=getResponseDot(lead.receivedAt,s)
    const dimmed=s==='dq'||s==='na'||s==='lost'
    const det=details[lead.email]||{...EMPTY_DETAIL,...(HISTORICAL_DETAILS[lead.email]||{})}
    const isOpen=expanded===lead.email
    // Account name always takes priority — never overridden by prospect name
    const displayName=nameOverrides[lead.email]||lead.account||formatDomain(lead.domain)||lead.email
    const receivedDisplay=lead.receivedAt
      ? new Date(lead.receivedAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:lead.isHistorical?undefined:'numeric',minute:lead.isHistorical?undefined:'2-digit'})
      : lead.date||'—'

    return (
      <>
        <tr
          key={lead.email}
          style={{borderBottom:`1px solid ${C.border}`,cursor:'pointer'}}
          onClick={e=>{
            // Only toggle if the click came from the row itself, not a child interactive element
            const target=e.target as HTMLElement
            const isInteractive=target.closest('button,select,input,a,textarea,[data-nopropagate]')
            if (!isInteractive) setExpanded(p=>p===lead.email?null:lead.email)
          }}
        >
          <td style={{padding:0,width:4}}><span style={{display:'block',width:4,minHeight:46,background:STRIPE[s]}}/></td>
          <td style={{padding:'10px 14px',opacity:dimmed?0.5:1}}>
            <div style={{display:'flex',alignItems:'center',gap:7,flexWrap:'wrap'}}>
              <AccountNameEditor
                name={displayName}
                onSave={name=>updateNameOverride(lead.email,name)}
              />
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
              {/* Quality dropdown — HQ MQL / LQ MQL only, separate from Status */}
              {(()=>{
                const det=details[lead.email]||{...EMPTY_DETAIL,...(HISTORICAL_DETAILS[lead.email]||{})}
                const q=det.mqlQuality||''
                const qCfg:{color:string;dim:string;border:string}=
                  q==='hq'?{color:'#f5a623',dim:'rgba(245,166,35,0.18)',border:'rgba(245,166,35,0.45)'}:
                  q==='lq'?{color:'#fb923c',dim:'rgba(251,146,60,0.15)',border:'rgba(251,146,60,0.4)'}:
                  {color:C.text3,dim:'transparent',border:C.border2}
                return (
                  <select
                    value={q}
                    onChange={e=>{
                      e.stopPropagation()
                      const updated={...EMPTY_DETAIL,...(HISTORICAL_DETAILS[lead.email]||{}),...(details[lead.email]||{}),mqlQuality:e.target.value}
                      updateDetail(lead.email,updated)
                    }}
                    onClick={e=>e.stopPropagation()}
                    style={{fontSize:11,fontWeight:600,padding:'4px 10px',borderRadius:999,border:`1px solid ${qCfg.border}`,background:qCfg.dim,color:qCfg.color,cursor:'pointer',outline:'none',appearance:'none'}}
                  >
                    <option value=''>— Quality —</option>
                    <option value='hq'>HQ MQL</option>
                    <option value='lq'>LQ MQL</option>
                  </select>
                )
              })()}
              {/* Account Tier — A/B/E = ICP (commission eligible), C = DQ */}
              {(()=>{
                const det=details[lead.email]||{...EMPTY_DETAIL,...(HISTORICAL_DETAILS[lead.email]||{})}
                const t=det.accountTier||''
                const tCfg:{color:string;dim:string;border:string}=
                  t==='A'?{color:C.green,dim:'rgba(0,229,160,0.15)',border:'rgba(0,229,160,0.35)'}:
                  t==='B'?{color:'#60d4f4',dim:'rgba(96,212,244,0.15)',border:'rgba(96,212,244,0.35)'}:
                  t==='E'?{color:C.purpleL,dim:'rgba(168,156,248,0.15)',border:'rgba(168,156,248,0.35)'}:
                  t==='C'?{color:C.red,dim:'rgba(255,92,92,0.12)',border:'rgba(255,92,92,0.35)'}:
                  {color:C.text3,dim:'transparent',border:C.border2}
                return (
                  <select
                    value={t}
                    onChange={e=>{
                      e.stopPropagation()
                      const updated={...EMPTY_DETAIL,...(HISTORICAL_DETAILS[lead.email]||{}),...(details[lead.email]||{}),accountTier:e.target.value}
                      updateDetail(lead.email,updated)
                    }}
                    onClick={e=>e.stopPropagation()}
                    style={{fontSize:11,fontWeight:600,padding:'4px 10px',borderRadius:999,border:`1px solid ${tCfg.border}`,background:tCfg.dim,color:tCfg.color,cursor:'pointer',outline:'none',appearance:'none'}}
                  >
                    <option value=''>— Tier —</option>
                    <option value='A'>Tier A</option>
                    <option value='B'>Tier B</option>
                    <option value='C'>Tier C</option>
                    <option value='E'>Tier E</option>
                  </select>
                )
              })()}
              <span style={{fontSize:11,color:C.text3}}>{isOpen?'▲':'▼'}</span>
              <button
                onClick={e=>{e.stopPropagation(); if(window.confirm(`Delete "${displayName}"? This can be undone from the Export backup.`)) deleteAccount(lead.email)}}
                onMouseDown={e=>e.stopPropagation()}
                title="Delete account"
                style={{fontSize:11,color:'rgba(255,92,92,0.4)',background:'none',border:'none',cursor:'pointer',padding:'2px 4px',lineHeight:1}}
                onMouseEnter={e=>(e.currentTarget.style.color=C.red)}
                onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,92,92,0.4)')}
              >✕</button>
            </div>
          </td>
        </tr>
        {isOpen&&(
         <DetailPanel
  lead={lead}
  detail={{
    ...det,
    mqlQuality: (statuses[lead.email]||'new') === 'dq'
      ? 'dq'
      : det.mqlQuality
  }}
  onSave={updatedDetail=>{
    setDetails(p=>({...p,[lead.email]:updatedDetail}))

    if (updatedDetail.mqlQuality === 'dq') {
      setStatuses(prev => ({
        ...prev,
        [lead.email]: 'dq'
      }))
      saveSt(lead.email,'dq')
    }
  }}
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

  // ── Report date range (must be computed before reportBaseLeads) ──
  const getReportRange = () => {
    const now = new Date()
    if (reportTimeframe === 'monthly') return {start:new Date(now.getFullYear(),now.getMonth(),1),end:new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59)}
    if (reportTimeframe === 'quarterly') {const qm=Math.floor(now.getMonth()/3)*3;return {start:new Date(now.getFullYear(),qm,1),end:new Date(now.getFullYear(),qm+3,0,23,59,59)}}
    if (reportTimeframe === 'yearly') return {start:new Date(now.getFullYear(),0,1),end:new Date(now.getFullYear(),11,31,23,59,59)}
    if (reportTimeframe === 'custom' && reportRangeStart && reportRangeEnd) return {start:new Date(reportRangeStart+'T00:00:00'),end:new Date(reportRangeEnd+'T23:59:59')}
    const qm2=Math.floor(now.getMonth()/3)*3;return {start:new Date(now.getFullYear(),qm2,1),end:new Date(now.getFullYear(),qm2+3,0,23,59,59)}
  }
  const { start: reportStart, end: reportEnd } = getReportRange()
  const reportRangeMs = Math.max(1, reportEnd.getTime() - reportStart.getTime())
  const reportPrevStart = new Date(reportStart.getTime() - reportRangeMs)
  const reportPrevEnd = new Date(reportEnd.getTime() - reportRangeMs)

  const reportScopeLeads =
  reportScope === 'individual_bdr' && reportBdrId
    ? allLeads.filter(l => {
        const rep = reps.find(r => r.id === reportBdrId)
        if (!rep) return false
        if (rep.id === 'jonathan') {
          return !l.repSlackId || (rep.slackId && l.repSlackId === rep.slackId)
        }
        return !!rep.slackId && l.repSlackId === rep.slackId
      })
    : allLeads
  // Scope by report date range using activity dates
  const reportInRange=(l:AppLead):boolean=>{
    const det=details[l.email]
    const dates=[det?.connectedDate,det?.meetingDate,det?.sqlDate,det?.sqoDate,det?.closedWonDate,l.date,l.receivedAt].filter(Boolean)
    if(dates.length===0) return false
    return dates.some(d=>{const dt=new Date(d as string);return dt>=reportStart&&dt<=reportEnd})
  }
  const reportBaseLeads = reportScopeLeads.filter(reportInRange)
  const pct = (n:number,d:number)=> d>0 ? Math.round((n/d)*100) : 0

  const reportStatusCounts = {
    new: reportBaseLeads.filter(l => (statuses[l.email] || 'new') === 'new').length,
    contacted: reportBaseLeads.filter(l => (statuses[l.email] || 'new') === 'contacted').length,
    inprogress: reportBaseLeads.filter(l => (statuses[l.email] || 'new') === 'inprogress').length,
    closedwon: reportBaseLeads.filter(l => (statuses[l.email] || 'new') === 'closedwon').length,
    booked: reportBaseLeads.filter(l => (statuses[l.email] || 'new') === 'booked').length,
    nurture: reportBaseLeads.filter(l => (statuses[l.email] || 'new') === 'nurture').length,
    lost: reportBaseLeads.filter(l => (statuses[l.email] || 'new') === 'lost').length,
    dq: reportBaseLeads.filter(l => (statuses[l.email] || 'new') === 'dq').length,
    na: reportBaseLeads.filter(l => (statuses[l.email] || 'new') === 'na').length,
  }

  const reportTotal = reportBaseLeads.length
  const reportSqlCount = reportBaseLeads.filter(l => (details[l.email]?.sqlDq || '').toLowerCase() === 'yes').length
  const reportSqoCount = reportBaseLeads.filter(l => (details[l.email]?.sqo || '').toLowerCase() === 'yes').length
  const reportPipeline = reportBaseLeads.reduce((sum,l)=>sum + parseAcv(details[l.email]?.acv), 0)

  const reportSummaryText = `Generated ${reportTotal} leads, ${reportSqlCount} SQLs (${pct(reportSqlCount, reportTotal)}%), ${reportSqoCount} SQOs (${pct(reportSqoCount, reportSqlCount || reportTotal)}%), and $${reportPipeline.toLocaleString()} in pipeline.`
  const workedLeads = reportBaseLeads.filter(l => (statuses[l.email] || 'new') !== 'new')
  const meetingLeads = reportBaseLeads.filter(l => ['booked','closedwon'].includes(statuses[l.email] || 'new') || (details[l.email]?.sqlDq || '').toLowerCase() === 'yes')
  const reportRatioCards = [
    { label:'Contact Rate', value:`${pct(workedLeads.length, reportTotal)}%`, sub:`${workedLeads.length} of ${reportTotal} leads touched` },
    { label:'Meeting Rate', value:`${pct(meetingLeads.length, reportTotal)}%`, sub:`${meetingLeads.length} meetings or SQLs` },
    { label:'SQL Rate', value:`${pct(reportSqlCount, reportTotal)}%`, sub:`${reportSqlCount} SQLs from ${reportTotal} leads` },
    { label:'SQO Rate', value:`${pct(reportSqoCount, reportTotal)}%`, sub:`${reportSqoCount} SQOs created` },
    { label:'Win Rate', value:`${pct(reportStatusCounts.closedwon, reportTotal)}%`, sub:`${reportStatusCounts.closedwon} closed-won` },
    { label:'Lost %', value:`${pct(reportStatusCounts.lost, reportTotal)}%`, sub:`${reportStatusCounts.lost} lost` },
    { label:'DQ %', value:`${pct(reportStatusCounts.dq, reportTotal)}%`, sub:`${reportStatusCounts.dq} disqualified` },
    { label:'Nurture Pool', value:`${pct(reportStatusCounts.nurture, reportTotal)}%`, sub:`${reportStatusCounts.nurture} in nurture` },
  ]

  const velocityData = (()=>{
    const vMqlSql:number[]=[], vSqlSqo:number[]=[], vSqoWon:number[]=[], vMqlWon:number[]=[]
    reportBaseLeads.forEach(l=>{
      const d=details[l.email]; const r=new Date(l.receivedAt||l.date||Date.now())
      const isWon=(d?.closedWon==='Yes'||(statuses[l.email]||'new')==='closedwon')
      // MQL → SQL: lead date to sqlDate (only for SQLs)
      if((d?.sqlDq||'').toLowerCase()==='yes'&&d?.sqlDate){const dy=Math.round((new Date(d.sqlDate).getTime()-r.getTime())/864e5);if(dy>=0&&dy<730)vMqlSql.push(dy)}
      // SQL → SQO: sqlDate to sqoDate (only for SQOs)
      if((d?.sqo||'').toLowerCase()==='yes'&&d?.sqlDate&&d?.sqoDate){const dy=Math.round((new Date(d.sqoDate).getTime()-new Date(d.sqlDate).getTime())/864e5);if(dy>=0&&dy<730)vSqlSqo.push(dy)}
      // SQO → Closed Won: sqoDate to closedWonDate (only for won deals)
      if(isWon&&d?.sqoDate&&d?.closedWonDate){const dy=Math.round((new Date(d.closedWonDate).getTime()-new Date(d.sqoDate).getTime())/864e5);if(dy>=0&&dy<730)vSqoWon.push(dy)}
      // MQL → Closed Won: full funnel (only for won deals)
      if(isWon&&d?.closedWonDate){const dy=Math.round((new Date(d.closedWonDate).getTime()-r.getTime())/864e5);if(dy>=0&&dy<730)vMqlWon.push(dy)}
    })
    const avg=(a:number[])=>a.length?Math.round(a.reduce((s,n)=>s+n,0)/a.length):null
    return {mqlSql:{avg:avg(vMqlSql),n:vMqlSql.length},sqlSqo:{avg:avg(vSqlSqo),n:vSqlSqo.length},sqoWon:{avg:avg(vSqoWon),n:vSqoWon.length},mqlWon:{avg:avg(vMqlWon),n:vMqlWon.length}}
  })()


  const reportSourceRows = Object.entries(
    reportBaseLeads.reduce((acc, lead) => {
      const source = (details[lead.email]?.sourceChannel || lead.source || 'unknown').toString()
      if (!acc[source]) acc[source] = { mqls:0, sqls:0, sqos:0, pipeline:0 }
      acc[source].mqls += 1
      if ((details[lead.email]?.sqlDq || '').toLowerCase() === 'yes') acc[source].sqls += 1
      if ((details[lead.email]?.sqo || '').toLowerCase() === 'yes') acc[source].sqos += 1
      acc[source].pipeline += parseAcv(details[lead.email]?.acv)
      return acc
    }, {} as Record<string,{mqls:number,sqls:number,sqos:number,pipeline:number}>)
  ).map(([source,vals])=>({
    source,
    mqls: vals.mqls,
    sqlRate: pct(vals.sqls, vals.mqls),
    sqoRate: pct(vals.sqos, vals.mqls),
    pipeline: vals.pipeline,
  })).sort((a,b)=>b.mqls-a.mqls)

  const reportBdrRows = reps.map(rep => {
    const repLeads = rep.id === 'jonathan'
      ? reportBaseLeads
      : reportBaseLeads.filter(l => l.repSlackId && l.repSlackId === rep.slackId)

    const sqls = repLeads.filter(l => (details[l.email]?.sqlDq || '').toLowerCase() === 'yes').length
    const sqos = repLeads.filter(l => (details[l.email]?.sqo || '').toLowerCase() === 'yes').length
    const pipeline = repLeads.reduce((sum,l)=>sum + parseAcv(details[l.email]?.acv), 0)

    return {
      name: rep.name,
      mqls: repLeads.length,
      sqls,
      sqos,
      pipeline,
    }
  })

  const progressionRatios = [
    { label:'New → Contacted', value:Math.min(100,pct(reportStatusCounts.contacted, reportStatusCounts.new || reportStatusCounts.contacted)) },
    { label:'Contacted → In Progress', value:Math.min(100,pct(reportStatusCounts.inprogress, reportStatusCounts.contacted || reportStatusCounts.inprogress)) },
    { label:'In Progress → Booked', value:Math.min(100,pct(reportStatusCounts.booked, reportStatusCounts.inprogress || reportStatusCounts.booked)) },
    { label:'Booked → SQL', value:Math.min(100,pct(reportSqlCount, reportStatusCounts.booked || reportSqlCount)) },
    { label:'SQL → SQO', value:Math.min(100,pct(reportSqoCount, reportSqlCount || reportSqoCount)) },
  ]

  const biggestDropoff = progressionRatios.reduce((worst, r) => r.value < worst.value ? r : worst, progressionRatios[0])
  const strongestStage = progressionRatios.reduce((best, r) => r.value > best.value ? r : best, progressionRatios[0])

  const terminalPools = [
    { label:'Lost', value:reportStatusCounts.lost },
    { label:'DQ', value:reportStatusCounts.dq },
    { label:'Nurture', value:reportStatusCounts.nurture },
  ]
  const mostCommonTerminal = terminalPools.reduce((a,b)=>b.value>a.value?b:a, terminalPools[0])
  const mostRecoverablePool = terminalPools.reduce((a,b)=>b.label==='Nurture' && b.value>=a.value ? b : a, terminalPools[0])



  const reportLeadInRange = (lead:any, start:Date, end:Date) => {
    const det=details[lead.email]
    const dates=[det?.connectedDate,det?.meetingDate,det?.sqlDate,det?.sqoDate,det?.closedWonDate,lead.date,lead.receivedAt].filter(Boolean)
    if(dates.length===0) return false
    return dates.some((d:string)=>{const dt=new Date(d);return dt>=start&&dt<=end})
  }

  const previousPeriodLeads = reportScopeLeads.filter(l => reportLeadInRange(l, reportPrevStart, reportPrevEnd))
  const currentPeriodLeads = reportBaseLeads

  const calcPeriodMetrics = (leads:any[]) => {
    const total = leads.length
    const sqls = leads.filter(l => (details[l.email]?.sqlDq || '').toLowerCase() === 'yes').length
    const sqos = leads.filter(l => (details[l.email]?.sqo || '').toLowerCase() === 'yes').length
    const pipeline = leads.reduce((sum,l)=>sum + parseAcv(details[l.email]?.acv), 0)
    return {
      total,
      sqls,
      sqos,
      pipeline,
      sqlRate: pct(sqls, total),
      sqoRate: pct(sqos, sqls || total),
    }
  }

  const currentPeriodMetrics = calcPeriodMetrics(currentPeriodLeads)
  const previousPeriodMetrics = calcPeriodMetrics(previousPeriodLeads)

  const delta = (curr:number, prev:number) => curr - prev
  const trendMeta = (curr:number, prev:number) => {
    const d = delta(curr, prev)
    return {
      delta: d,
      arrow: d > 0 ? '↑' : d < 0 ? '↓' : '→',
      color: d > 0 ? C.green : d < 0 ? C.red : C.text3,
    }
  }

  const sqlTrend = trendMeta(currentPeriodMetrics.sqlRate, previousPeriodMetrics.sqlRate)
  const sqoTrend = trendMeta(currentPeriodMetrics.sqoRate, previousPeriodMetrics.sqoRate)
  const pipelineTrend = trendMeta(currentPeriodMetrics.pipeline, previousPeriodMetrics.pipeline)



  const reportLabel =
    reportTimeframe === 'monthly'
      ? 'Monthly'
      : reportTimeframe === 'quarterly'
        ? 'Quarterly'
        : reportTimeframe === 'yearly'
          ? 'Yearly'
          : 'Custom Range'

  const reportCopyText = [
    `🧾 ${reportLabel} Reporting Summary`,
    ``,
    `- Total Leads: ${reportTotal}`,
    `- SQLs: ${reportSqlCount} (${pct(reportSqlCount, reportTotal)}%)`,
    `- SQOs: ${reportSqoCount} (${pct(reportSqoCount, reportSqlCount || reportTotal)}%)`,
    `- Pipeline: $${reportPipeline.toLocaleString()}`,
    ``,
    `Trend vs previous period:`,
    `- SQL Rate: ${sqlTrend.arrow} ${Math.abs(sqlTrend.delta)} pts (${currentPeriodMetrics.sqlRate}% vs ${previousPeriodMetrics.sqlRate}%)`,
    `- SQO Conversion: ${sqoTrend.arrow} ${Math.abs(sqoTrend.delta)} pts (${currentPeriodMetrics.sqoRate}% vs ${previousPeriodMetrics.sqoRate}%)`,
    `- Pipeline: ${pipelineTrend.arrow} $${Math.abs(pipelineTrend.delta).toLocaleString()} ($${currentPeriodMetrics.pipeline.toLocaleString()} vs $${previousPeriodMetrics.pipeline.toLocaleString()})`,
    ``,
    `Funnel insights:`,
    `- Biggest drop-off: ${biggestDropoff.label} (${biggestDropoff.value}% conversion)`,
    `- Strongest stage: ${strongestStage.label} (${strongestStage.value}% conversion)`,
    `- Most common terminal status: ${mostCommonTerminal.label} (${mostCommonTerminal.value})`,
    `- Most recoverable pool: ${mostRecoverablePool.label} (${mostRecoverablePool.value})`,
  ].join('\n')

  const copyReportSummary = async () => {
    try {
      await navigator.clipboard.writeText(reportCopyText)
      alert('Report summary copied.')
    } catch {
      alert('Could not copy summary.')
    }
  }



  const reportExportPayload = {
    generatedAt: new Date().toISOString(),
    timeframe: reportTimeframe,
    scope: reportScope,
    reportType: reportType,
    summary: {
      totalLeads: reportTotal,
      sqls: reportSqlCount,
      sqlRate: pct(reportSqlCount, reportTotal),
      sqos: reportSqoCount,
      sqoRate: pct(reportSqoCount, reportSqlCount || reportTotal),
      pipeline: reportPipeline,
    },
    trends: {
      sqlRate: {
        current: currentPeriodMetrics.sqlRate,
        previous: previousPeriodMetrics.sqlRate,
        delta: sqlTrend.delta,
        arrow: sqlTrend.arrow,
      },
      sqoRate: {
        current: currentPeriodMetrics.sqoRate,
        previous: previousPeriodMetrics.sqoRate,
        delta: sqoTrend.delta,
        arrow: sqoTrend.arrow,
      },
      pipeline: {
        current: currentPeriodMetrics.pipeline,
        previous: previousPeriodMetrics.pipeline,
        delta: pipelineTrend.delta,
        arrow: pipelineTrend.arrow,
      },
    },
    statusCounts: {
      ...reportStatusCounts,
      sql: reportSqlCount,
      sqo: reportSqoCount,
    },
    ratios: reportRatioCards,
    sourceBreakdown: reportSourceRows,
    bdrBreakdown: reportBdrRows,
    funnelInsights: {
      biggestDropoff,
      strongestStage,
      mostCommonTerminal,
      mostRecoverablePool,
    },
  }

  const downloadBlobFile = (content:string, filename:string, mime:string) => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadReportTxt = () => {
    const txt = [
      reportCopyText,
      '',
      'Status Counts:',
      `- New: ${reportStatusCounts.new}`,
      `- Contacted: ${reportStatusCounts.contacted}`,
      `- In Progress: ${reportStatusCounts.inprogress}`,
      `- Booked: ${reportStatusCounts.booked}`,
      `- Nurture: ${reportStatusCounts.nurture}`,
      `- Lost: ${reportStatusCounts.lost}`,
      `- DQ: ${reportStatusCounts.dq}`,
      `- NA: ${reportStatusCounts.na}`,
      `- SQL: ${reportSqlCount}`,
      `- SQO: ${reportSqoCount}`,
      '',
      'Key Ratios:',
      ...reportRatioCards.map(r => `- ${r.label}: ${r.value} (${r.sub})`),
    ].join('\n')

    downloadBlobFile(txt, `report-${reportTimeframe}.txt`, 'text/plain;charset=utf-8')
  }

  const downloadReportJson = () => {
    downloadBlobFile(
      JSON.stringify(reportExportPayload, null, 2),
      `report-${reportTimeframe}.json`,
      'application/json'
    )
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // ── Login screen ────────────────────────────────────────────────────────────
  if (!auth) return (
    <div style={{display:'flex',minHeight:'100vh',background:C.bg,color:C.text,fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:'40px 48px',width:360,textAlign:'center'}}>
        <div style={{width:48,height:48,borderRadius:12,background:C.green,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:800,color:C.bg,margin:'0 auto 20px'}}>QW</div>
        <div style={{fontSize:20,fontWeight:700,marginBottom:4}}>BDR Dashboard</div>
        <div style={{fontSize:13,color:C.text3,marginBottom:28}}>QA Wolf · Sign in with your credentials</div>
        <input
          type="email"
          placeholder="Email address"
          value={loginEmail}
          onChange={e=>{setLoginEmail(e.target.value);setPassErr(false)}}
          onKeyDown={e=>e.key==='Enter'&&handleLogin()}
          style={{width:'100%',padding:'10px 14px',borderRadius:8,border:`1px solid ${passErr?C.red:C.border2}`,background:C.surface2,color:C.text,fontSize:14,outline:'none',boxSizing:'border-box',marginBottom:10}}
        />
        <div style={{position:'relative',marginBottom:passErr?6:12}}>
          <input
            type={showPass?'text':'password'}
            placeholder="Password"
            value={loginPass}
            onChange={e=>{setLoginPass(e.target.value);setPassErr(false)}}
            onKeyDown={e=>e.key==='Enter'&&handleLogin()}
            style={{width:'100%',padding:'10px 14px',paddingRight:40,borderRadius:8,border:`1px solid ${passErr?C.red:C.border2}`,background:C.surface2,color:C.text,fontSize:14,outline:'none',boxSizing:'border-box'}}
          />
          <button type="button" onClick={()=>setShowPass(p=>!p)} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',fontSize:16,color:C.text3,padding:2,lineHeight:1}}
            onMouseEnter={e=>(e.currentTarget.style.color=C.text)} onMouseLeave={e=>(e.currentTarget.style.color=C.text3)}>
            {showPass?'🙈':'👁'}
          </button>
        </div>
        {passErr&&<div style={{fontSize:11,color:C.red,marginBottom:8}}>Invalid email or password</div>}
        <button onClick={handleLogin} style={{width:'100%',padding:'10px',borderRadius:8,border:'none',background:C.green,color:C.bg,fontSize:14,fontWeight:700,cursor:'pointer'}}>
          Sign In
        </button>
        <div style={{marginTop:20,fontSize:11,color:C.text3}}>
          Rep access? Use your direct link:<br/>
          <code style={{color:C.purpleL}}>/dashboard?rep=jonathan</code>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{display:'flex',minHeight:'100vh',background:C.bg,color:C.text,fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif'}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Sidebar ── */}
      <aside style={{width:252,flexShrink:0,background:C.surface,borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',paddingBottom:24}}>
        <div style={{display:'flex',alignItems:'center',gap:11,padding:'18px 20px',borderBottom:`1px solid ${C.border}`,marginBottom:14}}>
          <div style={{width:34,height:34,borderRadius:8,background:C.green,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:800,color:C.bg,flexShrink:0}}>QW</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:700}}>QA Wolf</div>
            <div style={{fontSize:10,fontWeight:600,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em'}}>BDR Portal</div>
          </div>
          {isManagerRole(auth)&&(
            <div title="Manager" style={{fontSize:10,fontWeight:700,color:C.amber,background:'rgba(245,166,35,0.15)',borderRadius:5,padding:'2px 6px',border:'1px solid rgba(245,166,35,0.3)',flexShrink:0}}>{auth?.role==='cmo'?'CMO':'MGR'}</div>
          )}
          {auth.role==='revops'&&(
            <div title="RevOps" style={{fontSize:10,fontWeight:700,color:'#60d4f4',background:'rgba(96,212,244,0.15)',borderRadius:5,padding:'2px 6px',border:'1px solid rgba(96,212,244,0.3)',flexShrink:0}}>REVOPS</div>
          )}
          {auth.role==='perf_marketing'&&(
            <div title="Performance Marketing" style={{fontSize:10,fontWeight:700,color:'#e879f9',background:'rgba(232,121,249,0.15)',borderRadius:5,padding:'2px 6px',border:'1px solid rgba(232,121,249,0.3)',flexShrink:0}}>PML</div>
          )}
          {auth.role==='pm'&&(
            <div title="Performance Marketing" style={{fontSize:10,fontWeight:700,color:'#60d4f4',background:'rgba(96,212,244,0.15)',borderRadius:5,padding:'2px 6px',border:'1px solid rgba(96,212,244,0.3)',flexShrink:0}}>PM</div>
          )}
          <button onClick={()=>{setAuth(null);sessionStorage.removeItem('mql-auth');window.location.href='/'}} title="Sign out" style={{background:'none',border:'none',color:C.text3,cursor:'pointer',fontSize:14,padding:2,flexShrink:0}}
            onMouseEnter={e=>(e.currentTarget.style.color=C.red)} onMouseLeave={e=>(e.currentTarget.style.color=C.text3)}>⎋</button>
        </div>

        {/* Limited-access sidebar (RevOps + Perf Marketing + PM) */}
        {(auth.role==='revops'||auth.role==='perf_marketing'||auth.role==='pm')&&(
          <>
          <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.1em',padding:'6px 20px 4px'}}>Views</div>
          {([
            ['pipeline','📋','Pipeline','Lead management · tracking'] as const,
            ['reporting','🧾','Reporting','Generated summaries'] as const,
            ['analytics','📈','Analytics','Charts · trends · conversion'] as const,
            ['commissions','💲','Commissions','Bonus tracking · payouts'] as const,
            ['revops_commissions','📋','RevOps','Commission verification · payouts'] as const,
            ['roundrobin','🔄','Round Robin','AE meeting distribution'] as const,
          ] as const).filter(([v])=>canView(v as DashView)).map(([v,icon,label,sub])=>(
            <div key={v} style={navBtn(view===v as View)} onClick={()=>setView(v as View)}>
              <div style={{width:26,height:26,borderRadius:6,background:view===v?C.purple:C.surface3,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:view===v?'#fff':C.text3,flexShrink:0}}>{icon}</div>
              <div>
                <div style={{fontSize:12,fontWeight:view===v?600:500,color:view===v?C.text:C.text2}}>{label}</div>
                <div style={{fontSize:11,color:C.text3}}>{sub}</div>
              </div>
            </div>
          ))}
          </>
        )}

        {/* Manager rep switcher + editor — hidden in revops mode */}
        {auth.role!=='revops'&&auth.role!=='perf_marketing'&&auth.role!=='pm'&&isManagerRole(auth)&&(
          <div style={{padding:'0 20px 12px'}}>
            <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:6,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              Reps
              <button onClick={()=>setShowRepEditor(e=>!e)} title="Edit reps" style={{background:'none',border:'none',cursor:'pointer',color:showRepEditor?C.amber:C.text3,fontSize:12,padding:0}}
                onMouseEnter={e=>(e.currentTarget.style.color=C.amber)} onMouseLeave={e=>(e.currentTarget.style.color=showRepEditor?C.amber:C.text3)}>✎</button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:3}}>
              {reps.map(r=>(
                <div key={r.id} style={{display:'flex',alignItems:'center',gap:4}}>
                  <button onClick={async()=>{
                    setActiveRepId(r.id)
                    if (r.slackId) {
                      await loadFromEdgeConfig(r.slackId)
                      setStatuses(getSt()); setDetails(getDetails())
                      setManualLeads(getManualLeads()); setNameOverrides(getNameOverrides())
                      setDeletedEmails(getDeletedEmails())
                    }
                  }} style={{
                    flex:1,textAlign:'left' as const,padding:'6px 10px',borderRadius:6,
                    border:`1px solid ${activeRepId===r.id?C.green:C.border}`,
                    background:activeRepId===r.id?'rgba(0,229,160,0.1)':'transparent',
                    color:activeRepId===r.id?C.green:r.slackId?C.text2:C.text3,
                    fontSize:11,fontWeight:activeRepId===r.id?700:500,cursor:'pointer',
                  }}>
                    {r.name}{!r.slackId&&<span style={{fontSize:9,color:C.text3,marginLeft:4}}>(not set)</span>}
                  </button>
                  {showRepEditor&&(
                    <button onClick={()=>setEditingRep({...r})} style={{background:'none',border:'none',cursor:'pointer',color:C.text3,fontSize:11,padding:'2px 4px'}}
                      onMouseEnter={e=>(e.currentTarget.style.color=C.amber)} onMouseLeave={e=>(e.currentTarget.style.color=C.text3)}>✎</button>
                  )}
                </div>
              ))}
            </div>
            {showRepEditor&&(
              <button onClick={()=>{
                const newRep:Rep={id:`rep${Date.now()}`,name:'New Rep',slackId:'',passcode:''}
                setEditingRep(newRep)
              }} style={{marginTop:6,fontSize:10,fontWeight:600,padding:'4px 8px',borderRadius:5,border:`1px solid ${C.border2}`,background:'transparent',color:C.purpleL,cursor:'pointer',width:'100%'}}>
                + Add Rep
              </button>
            )}
          </div>
        )}

        {/* Rep editor modal */}
        {editingRep&&(
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setEditingRep(null)}>
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:24,width:340}} onClick={e=>e.stopPropagation()}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:16}}>Edit Rep</div>
              {([
                ['Name', 'name', 'text', 'Jonathan Kim'],
                ['Rep Email', 'slackId', 'text', 'rep@qawolf.com'],
                ['Rep Passcode', 'passcode', 'password', 'Set a passcode for this rep'],
              ] as const).map(([label, field, type, placeholder])=>(
                <div key={field} style={{marginBottom:12}}>
                  <div style={{fontSize:11,color:C.text3,marginBottom:4}}>{label}</div>
                  <input
                    type={type}
                    value={(editingRep as any)[field]}
                    onChange={e=>setEditingRep(p=>p?{...p,[field]:e.target.value}:p)}
                    placeholder={placeholder}
                    style={{width:'100%',padding:'8px 10px',borderRadius:6,border:`1px solid ${C.border2}`,background:C.surface2,color:C.text,fontSize:12,outline:'none',boxSizing:'border-box' as const}}
                  />
                </div>
              ))}
              <div style={{fontSize:10,color:C.text3,marginBottom:12}}>Rep URL: <code style={{color:C.purpleL}}>?rep={editingRep.id}</code></div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={async()=>{
                  const updated = reps.find(r=>r.id===editingRep.id)
                    ? reps.map(r=>r.id===editingRep.id?editingRep:r)
                    : [...reps, editingRep]
                  await saveRepRegistry(updated)
                  setEditingRep(null)
                }} style={{flex:1,padding:'8px',borderRadius:6,border:'none',background:C.green,color:C.bg,fontSize:12,fontWeight:700,cursor:'pointer'}}>Save</button>
                <button onClick={async()=>{
                  if (!window.confirm(`Delete ${editingRep.name}?`)) return
                  const updated = reps.filter(r=>r.id!==editingRep.id)
                  await saveRepRegistry(updated)
                  setEditingRep(null)
                }} style={{padding:'8px 12px',borderRadius:6,border:`1px solid ${C.red}`,background:'transparent',color:C.red,fontSize:12,cursor:'pointer'}}>Delete</button>
                <button onClick={()=>setEditingRep(null)} style={{padding:'8px 12px',borderRadius:6,border:`1px solid ${C.border2}`,background:'transparent',color:C.text3,fontSize:12,cursor:'pointer'}}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {auth.role!=='revops'&&auth.role!=='perf_marketing'&&auth.role!=='pm'&&<><div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.1em',padding:'6px 20px 4px'}}>Views</div>
        {([
          ['pipeline','📊','Pipeline','Lead tracking · expandable'] as const,
          ['analytics','📈','Analytics','Charts · trends · breakdown'] as const,
          ...(isManagerRole(auth) ? [['reporting','🧾','Reporting','Generated summaries · leadership-ready'] as const] : []),
          ['commissions','💲','Commissions','Bonus tracking · payouts'] as const,
          ['leaderboard','🏆','Leaderboard','Rep rankings · spiffs'] as const,
          ['roundrobin','🔄','Round Robin','AE meeting distribution'] as const,
          ...(isManagerRole(auth) ? [['revops_commissions','📋','RevOps','Commission verification · payouts'] as const] : []),
        ] as const).filter(([v])=>canView(v as DashView)).map(([v,icon,label,sub])=>(
          <div key={v} style={navBtn(view===v as View)} onClick={()=>setView(v as View)}>
            <div style={{width:26,height:26,borderRadius:6,background:view===v?C.purple:C.surface3,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:view===v?'#fff':C.text3,flexShrink:0}}>{icon}</div>
            <div>
              <div style={{fontSize:12,fontWeight:view===v?600:500,color:view===v?C.text:C.text2}}>{label}</div>
              <div style={{fontSize:11,color:C.text3}}>{sub}</div>
            </div>
          </div>
        ))}
        <div style={{height:1,background:C.border,margin:'10px 0'}}/>
        <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.1em',padding:'6px 20px 4px'}}>{currentRep.name}</div>
        <div style={{height:1,background:C.border,margin:'10px 0'}}/>
        <div style={{padding:'8px 20px'}}>
          <button onClick={fetchLeads} disabled={loading} style={{display:'flex',alignItems:'center',gap:7,fontSize:12,fontWeight:700,color:C.bg,background:C.green,border:'none',borderRadius:7,padding:'8px 14px',cursor:loading?'default':'pointer',opacity:loading?0.6:1,width:'100%',justifyContent:'center'}}>
            <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={loading?{animation:'spin 0.7s linear infinite'}:{}}><path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.5 0 2.9.6 3.9 1.6"/><path d="M10.5 1.5L13.8 4 11 6.5"/></svg>
            {loading?'Refreshing…':'Refresh Leads'}
          </button>
          {fetchedAt&&<div style={{fontSize:10,color:C.text3,textAlign:'center',marginTop:6}}>{new Date(fetchedAt).toLocaleTimeString()}</div>}
        </div>
        <div style={{height:1,background:C.border,margin:'4px 0'}}/>
        {/* ── Export / Import / History ── */}
        <div style={{padding:'8px 20px',display:'flex',flexDirection:'column',gap:6}}>
          <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:2,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            Data Backup
            <button
              onClick={()=>setShowHistory(h=>!h)}
              title="View history & restore snapshots"
              style={{background:'none',border:'none',cursor:'pointer',color:showHistory?C.green:C.text3,padding:2,lineHeight:1,fontSize:14}}
              onMouseEnter={e=>(e.currentTarget.style.color=C.green)}
              onMouseLeave={e=>(e.currentTarget.style.color=showHistory?C.green:C.text3)}
            >🕐</button>
          </div>
          {showHistory&&(()=>{
            const snaps=getSnapshots()
            return (
              <div style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:'8px',marginBottom:4,maxHeight:260,overflowY:'auto'}}>
                <div style={{fontSize:10,fontWeight:700,color:C.text3,marginBottom:6,textTransform:'uppercase',letterSpacing:'.06em'}}>Activity History</div>
                {snaps.length===0
                  ? <div style={{fontSize:11,color:C.text3}}>No snapshots yet.</div>
                  : snaps.map((s:any,i:number)=>(
                    <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'5px 0',borderBottom:i<snaps.length-1?`1px solid ${C.border}`:'none'}}>
                      <div>
                        <div style={{fontSize:11,color:C.text2,fontWeight:500}}>
                          {s.trigger==='delete'?'🗑 Deleted account':s.trigger==='status'?'● Status change':s.trigger==='detail'?'✎ Detail saved':s.trigger==='before-restore'?'⟳ Pre-restore':'💾 Saved'}
                        </div>
                        <div style={{fontSize:10,color:C.text3}}>{new Date(s.savedAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</div>
                      </div>
                      <button
                        onClick={()=>restoreSnapshot(s)}
                        style={{fontSize:10,fontWeight:600,padding:'3px 8px',borderRadius:5,border:`1px solid ${C.border2}`,background:'transparent',color:C.purpleL,cursor:'pointer'}}
                        onMouseEnter={e=>(e.currentTarget.style.background=C.surface3)}
                        onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
                      >Restore</button>
                    </div>
                  ))
                }
              </div>
            )
          })()}
          <button onClick={()=>{
            const payload={
              'mql-st':   localStorage.getItem('mql-st'),
              'mql-dt':   localStorage.getItem('mql-dt'),
              'mql-names':localStorage.getItem('mql-names'),
              'mql-manual':localStorage.getItem('mql-manual'),
              'mql-ae-opts-v2':localStorage.getItem('mql-ae-opts-v2'),
              'mql-deleted':localStorage.getItem('mql-deleted'),
              'mql-history':localStorage.getItem('mql-history'),
              exportedAt: new Date().toISOString(),
            }
            const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})
            const a=document.createElement('a'); a.href=URL.createObjectURL(blob)
            a.download=`mql-backup-${new Date().toISOString().slice(0,10)}.json`; a.click()
          }} style={{fontSize:11,fontWeight:600,padding:'7px 10px',borderRadius:7,border:`1px solid ${C.border2}`,background:'transparent',color:C.text2,cursor:'pointer',textAlign:'left' as const,display:'flex',alignItems:'center',gap:6}}>
            ↓ Export backup
          </button>
          <label style={{fontSize:11,fontWeight:600,padding:'7px 10px',borderRadius:7,border:`1px solid ${C.border2}`,background:'transparent',color:C.text2,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
            ↑ Import backup
            <input type="file" accept=".json" style={{display:'none'}} onChange={e=>{
              const file=e.target.files?.[0]; if (!file) return
              const reader=new FileReader()
              reader.onload=ev=>{
                try {
                  const data=JSON.parse(ev.target?.result as string)
                  const keys=['mql-st','mql-dt','mql-names','mql-manual','mql-ae-opts-v2','mql-deleted'] as const
                  keys.forEach(k=>{ if(data[k]) localStorage.setItem(k,data[k]) })
                  setStatuses(getSt()); setDetails(getDetails())
                  setNameOverrides(getNameOverrides()); setManualLeads(getManualLeads())
                  setDeletedEmails(getDeletedEmails())
                  alert('Backup restored successfully.')
                } catch { alert('Invalid backup file.') }
              }
              reader.readAsText(file)
              e.target.value=''
            }}/>
          </label>
        </div>
        </>}
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
              <div style={{fontSize:12,color:C.text3,marginTop:4}}>{currentRep.name} · {pipelineDir==='all'?`${allLeads.length} total`:pipelineDir==='inbound'?'inbound':'outbound'} leads · click any row to expand{ecSaving&&<span style={{color:C.amber,marginLeft:8}}>↑ syncing…</span>}</div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8,alignItems:'flex-end'}}>
              <div style={{display:'flex',gap:5}}>
                {(['all','inbound','outbound'] as const).map(d=>(
                  <button key={d} onClick={()=>setPipelineDir(d)} style={filterPill(pipelineDir===d,d==='inbound'?'#60d4f4':d==='outbound'?'#e879f9':C.purple)}>
                    {{all:'All Leads',inbound:'⬇ Inbound',outbound:'⬆ Outbound'}[d]}
                  </button>
                ))}
              </div>
              <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                {([['all','All Time'],['week','This Week'],['month','This Month'],['quarter','This Qtr'],['q1','Q1'],['q2','Q2'],['q3','Q3'],['q4','Q4'],['year','YTD'],['custom','Custom']] as [PeriodFilter,string][]).map(([p,label])=>(
                  <button key={p} onClick={()=>{setPeriod(p);setStFilter('all')}} style={filterPill(period===p)}>{label}</button>
                ))}
                <button onClick={()=>setPipCompare(c=>!c)} style={{...filterPill(pipCompare,C.amber),marginLeft:4}}>Compare</button>
              </div>
              {period==='custom'&&(
                <div style={{display:'flex',gap:6,alignItems:'center',marginTop:6}}>
                  <span style={{fontSize:10,fontWeight:700,color:C.text3}}>FROM</span>
                  <input type="date" value={pipCustomFrom} onChange={e=>setPipCustomFrom(e.target.value)} style={{fontSize:11,padding:'3px 7px',border:`1px solid ${C.border2}`,borderRadius:5,background:C.surface3,color:C.text,colorScheme:'dark'}}/>
                  <span style={{fontSize:10,color:C.text3}}>→</span>
                  <input type="date" value={pipCustomTo} onChange={e=>setPipCustomTo(e.target.value)} style={{fontSize:11,padding:'3px 7px',border:`1px solid ${C.border2}`,borderRadius:5,background:C.surface3,color:C.text,colorScheme:'dark'}}/>
                  {(pipCustomFrom||pipCustomTo)&&<button onClick={()=>{setPipCustomFrom('');setPipCustomTo('')}} style={{fontSize:9,color:C.text3,background:'none',border:'none',cursor:'pointer'}}>✕ Clear</button>}
                </div>
              )}
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
              {label:'Booked',          value:bookedCount,                                   color:C.green,   sub:'meetings set',  filter:'booked'   as StatusFilter},
              {label:'Contacted',       value:pCounts.contacted,                             color:C.purpleL, sub:'in progress',   filter:'contacted' as StatusFilter},
              {label:'Untouched',       value:pCounts.new,                                   color:C.amber,   sub:'needs action',  filter:'new'      as StatusFilter},
              {label:'SQLs',            value:sqlCount,                                      color:'#60d4f4',  sub:'qualified',     filter:'all'      as StatusFilter, df:'sql' as const},
              {label:'SQOs',            value:sqoCount,                                      color:'#c084fc',  sub:'opp created',   filter:'all'      as StatusFilter, df:'sqo' as const},
            ].map(s=>(
              <div key={s.label} onClick={()=>{
                if ('df' in s) { setDetailFilter(f=>(f===s.df?'none':s.df) as 'none'|'sql'|'sqo'); setStFilter('all') }
                else if (s.filter!=='all'||s.label==='Total in period') setStFilter(f=>f===s.filter&&s.label!=='Total in period'?'all':s.filter)
              }} style={{...card,cursor:'pointer',border:`1px solid ${'df' in s?(detailFilter===s.df?s.color:C.border):(stFilter===s.filter&&s.label!=='Total in period'?s.color:C.border)}`,transition:'border 0.15s'}}>
                <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>{s.label}</div>
                <div style={{fontSize:24,fontWeight:800,letterSpacing:'-0.03em',lineHeight:1,color:s.color}}>{s.value}</div>
                <div style={{fontSize:11,color:C.text3,marginTop:5}}>{'df' in s&&detailFilter===s.df?'← click to clear':s.sub}</div>
              </div>
            ))}
          </div>



          {/* ── Period Comparison Panel ── */}
          {pipCompare&&(()=>{
            const PERIOD_LABELS:Record<PeriodFilter,string>={all:'All Time',week:'This Week',month:'This Month',quarter:'This Qtr',q1:'Q1',q2:'Q2',q3:'Q3',q4:'Q4',year:'YTD',custom:'Custom'}
            const compRange=getPeriodRange(pipComparePeriod,pipCompareFrom,pipCompareTo)
            const compTotal=allLeads.filter(l=>{if(!l.date&&!l.receivedAt)return false;if(!hasActivityInRange(l,compRange.start,compRange.end))return false;return dirFilter(l)}).length
            // Milestone-based comparison counts
            const compBooked=allLeads.filter(l=>{
              if(!dirFilter(l))return false;const det=details[l.email];const s=statuses[l.email]||'new'
              const isB=!!(det?.meetingDate)||BOOKED_STATUSES_SET.has(s);if(!isB)return false
              if(det?.meetingDate)return dateInRange(det.meetingDate,compRange.start,compRange.end)
              return hasActivityInRange(l,compRange.start,compRange.end)
            }).length
            const compSqls=allLeads.filter(l=>{
              if(!dirFilter(l))return false;const det=details[l.email];if((det?.sqlDq||'')!=='Yes')return false
              const rd=det?.sqlDate||det?.meetingDate;if(rd)return dateInRange(rd,compRange.start,compRange.end)
              return hasActivityInRange(l,compRange.start,compRange.end)
            }).length
            const compSqos=allLeads.filter(l=>{
              if(!dirFilter(l))return false;const det=details[l.email];if((det?.sqo||'')!=='Yes')return false
              const rd=det?.sqoDate||det?.sqlDate||det?.meetingDate;if(rd)return dateInRange(rd,compRange.start,compRange.end)
              return hasActivityInRange(l,compRange.start,compRange.end)
            }).length
            const compHeld=allLeads.filter(l=>{
              if(!dirFilter(l))return false;const det=details[l.email];const s=statuses[l.email]||'new'
              if(!det?.meetingDate)return false;const md=new Date(det.meetingDate);if(md>new Date())return false
              const isHeld=BOOKED_STATUSES_SET.has(s)||(det.sqlDq||'').toLowerCase()==='yes';if(!isHeld)return false
              return dateInRange(det.meetingDate,compRange.start,compRange.end)
            }).length
            const curTotal=Object.values(pCounts).reduce((s,v)=>s+v,0)
            // Held count for current period
            const curHeld=allLeads.filter(l=>{
              if(!dirFilter(l))return false;const det=details[l.email];const s=statuses[l.email]||'new'
              if(!det?.meetingDate)return false;const md=new Date(det.meetingDate);if(md>new Date())return false
              const isHeld=BOOKED_STATUSES_SET.has(s)||(det.sqlDq||'').toLowerCase()==='yes';if(!isHeld)return false
              if(period==='all')return true
              return dateInRange(det.meetingDate,periodRange.start,periodRange.end)
            }).length
            const delta=(a:number,b:number)=>{if(b===0)return a>0?'+∞':'—';const pct=Math.round((a-b)/b*100);return pct>0?`+${pct}%`:pct===0?'0%':`${pct}%`}
            const deltaColor=(a:number,b:number)=>a>b?C.green:a<b?C.red:C.text3
            const metrics=[
              {label:'Total',cur:curTotal,comp:compTotal},
              {label:'Meetings Booked',cur:bookedCount,comp:compBooked},
              {label:'Meetings Held',cur:curHeld,comp:compHeld},
              {label:'SQLs',cur:sqlCount,comp:compSqls},
              {label:'SQOs',cur:sqoCount,comp:compSqos},
            ]
            return (
              <div style={{...card,marginBottom:20,border:`1px solid rgba(245,166,35,0.3)`,background:'rgba(245,166,35,0.03)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.amber,textTransform:'uppercase',letterSpacing:'.08em'}}>Period Comparison</div>
                  <button onClick={()=>setPipCompare(false)} style={{fontSize:10,color:C.text3,background:'none',border:'none',cursor:'pointer'}}>✕ Close</button>
                </div>
                <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:14,flexWrap:'wrap'}}>
                  <span style={{fontSize:10,fontWeight:700,color:C.text3}}>COMPARE TO:</span>
                  {([['q1','Q1'],['q2','Q2'],['q3','Q3'],['q4','Q4'],['month','This Month'],['year','YTD'],['custom','Custom']] as [PeriodFilter,string][]).map(([p,label])=>(
                    <button key={p} onClick={()=>setPipComparePeriod(p)} style={filterPill(pipComparePeriod===p,C.amber)}>{label}</button>
                  ))}
                </div>
                {pipComparePeriod==='custom'&&(
                  <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:14}}>
                    <span style={{fontSize:10,fontWeight:700,color:C.text3}}>FROM</span>
                    <input type="date" value={pipCompareFrom} onChange={e=>setPipCompareFrom(e.target.value)} style={{fontSize:11,padding:'3px 7px',border:`1px solid ${C.border2}`,borderRadius:5,background:C.surface3,color:C.text,colorScheme:'dark'}}/>
                    <span style={{fontSize:10,color:C.text3}}>→</span>
                    <input type="date" value={pipCompareTo} onChange={e=>setPipCompareTo(e.target.value)} style={{fontSize:11,padding:'3px 7px',border:`1px solid ${C.border2}`,borderRadius:5,background:C.surface3,color:C.text,colorScheme:'dark'}}/>
                  </div>
                )}
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead>
                    <tr style={{borderBottom:`2px solid ${C.border2}`}}>
                      <th style={{padding:'8px 10px',textAlign:'left',fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em'}}>Metric</th>
                      <th style={{padding:'8px 10px',textAlign:'right',fontSize:10,fontWeight:700,color:C.purpleL,textTransform:'uppercase',letterSpacing:'.06em'}}>{PERIOD_LABELS[period]||'Current'}</th>
                      <th style={{padding:'8px 10px',textAlign:'right',fontSize:10,fontWeight:700,color:C.amber,textTransform:'uppercase',letterSpacing:'.06em'}}>{PERIOD_LABELS[pipComparePeriod]||'Compare'}</th>
                      <th style={{padding:'8px 10px',textAlign:'right',fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em'}}>Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.map(m=>(
                      <tr key={m.label} style={{borderBottom:`1px solid ${C.border}`}}>
                        <td style={{padding:'8px 10px',fontWeight:600,color:C.text}}>{m.label}</td>
                        <td style={{padding:'8px 10px',textAlign:'right',fontWeight:700,color:C.purpleL}}>{m.cur}</td>
                        <td style={{padding:'8px 10px',textAlign:'right',fontWeight:700,color:C.amber}}>{m.comp}</td>
                        <td style={{padding:'8px 10px',textAlign:'right',fontWeight:700,color:deltaColor(m.cur,m.comp)}}>{delta(m.cur,m.comp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })()}

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
                {label:'SQL',value:sqlCount,color:'#60d4f4',sub:'SQL / DQ = Yes', df:'sql' as const},
                {label:'SQO',value:sqoCount,color:'#c084fc',sub:'SQO = Yes', df:'sqo' as const},
              ].map(s=>(
                <div key={s.label} onClick={()=>{setDetailFilter(f=>f===s.df?'none':s.df);setStFilter('all')}}
                     style={{display:'flex',flexDirection:'column',gap:6,minWidth:72,padding:'8px 10px',borderRadius:8,cursor:'pointer',border:`1px solid ${detailFilter===s.df?s.color:'rgba(255,255,255,0.07)'}`,background:detailFilter===s.df?`rgba(${s.df==='sql'?'96,212,244':'192,132,252'},0.1)`:'transparent',transition:'all 0.15s'}}>
                  <div style={{display:'flex',alignItems:'center',gap:5}}>
                    <span style={{width:8,height:8,borderRadius:'50%',background:s.color,flexShrink:0}}/>
                    <span style={{fontSize:11,color:C.text2}}>{s.label}</span>
                  </div>
                  <div style={{fontSize:22,fontWeight:800,color:s.color,letterSpacing:'-0.02em'}}>{s.value}</div>
                  <div style={{fontSize:10,color:C.text3}}>{detailFilter===s.df?'← clear':s.sub}</div>
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
                  {['Account / Email','Domain / Source','SF','Date','Status','Quality'].map(h=>(
                    <th key={h} style={{textAlign:'left',padding:'10px 14px',fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading&&liveLeads.length===0
                  ? <tr><td/><td colSpan={6} style={{textAlign:'center',padding:'52px 20px',color:C.text3,fontSize:14}}>Loading live leads from Slack…</td></tr>
                  : pipelineLeads.length===0
                  ? <tr><td/><td colSpan={6} style={{textAlign:'center',padding:'52px 20px',color:C.text3,fontSize:14}}>No leads match this filter.</td></tr>
                  : pipelineLeads.map(lead=>renderRow(lead))
                }
              </tbody>
            </table>
          </div>
          <div style={{marginTop:14,display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:12,color:C.text3}}>{pipelineLeads.length} leads shown</span>
            {(stFilter!=='all'||detailFilter!=='none')&&<button onClick={()=>{setStFilter('all');setDetailFilter('none')}} style={{fontSize:11,fontWeight:600,color:C.text3,background:'none',border:`1px solid ${C.border2}`,borderRadius:999,padding:'2px 10px',cursor:'pointer'}}>✕ Clear filter</button>}
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
          <div style={{display:'grid',gridTemplateColumns:'repeat(8,1fr)',gap:12,marginBottom:28}}>
            {[
              {label:'Total leads',     value:allLeads.length,                                                                                           color:C.green,   sub:'all time'},
              {label:'Booked',          value:allLeads.filter(l=>(statuses[l.email]||'new')==='booked').length,                                          color:C.green,   sub:'meetings set'},
              {label:'SQLs',            value:sqlAllTime,                                                                                                color:'#60d4f4', sub:'SQL / DQ = Yes'},
              {label:'SQOs',            value:sqoAllTime,                                                                                                color:'#c084fc', sub:'opp created'},
              {label:'Closed-Won',      value:allLeads.filter(l=>(details[l.email]?.closedWon||'')==='Yes'||(statuses[l.email]||'new')==='closedwon').length,                                     color:'#f59e0b', sub:'won accounts'},
              {label:'SQL rate',        value:`${allLeads.length?Math.round(sqlAllTime/allLeads.length*100):0}%`,                                        color:C.purpleL, sub:'SQL / total'},
              {label:'SQO rate',        value:`${allLeads.length?Math.round(sqoAllTime/allLeads.length*100):0}%`,                                        color:'#c084fc', sub:'SQO / total'},
              {label:'Pipeline ACV',    value:`$${allLeads.reduce((s,l)=>{const d=details[l.email]; return s+((d?.sqo==='Yes'&&d?.acv)?parseAcv(d.acv):0)},0).toLocaleString()}`, color:C.amber, sub:'SQO accounts only'},
              {label:'Closed-Won ACV',  value:`$${allLeads.reduce((s,l)=>{const d=details[l.email]; return s+(((d?.closedWon==='Yes'||(statuses[l.email]||'new')==='closedwon')&&d?.acv)?parseAcv(d.acv):0)},0).toLocaleString()}`, color:'#f59e0b', sub:'won revenue'},
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
              <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:16}}>Status breakdown · all time · click a slice to filter</div>
              <PieChart data={pieData} onSliceClick={(label)=>{
                const s=(Object.keys(STATUS_CONFIG) as Status[]).find(k=>STATUS_CONFIG[k].label===label)
                if (s) { setView('pipeline'); setStFilter(s); setPeriod('all') }
              }}/>
            </div>

            {/* Bar */}
            <div style={card}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,flexWrap:'wrap',gap:8}}>
                <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em'}}>Leads over time</div>
                <div style={{display:'flex',gap:5,alignItems:'center',flexWrap:'wrap'}}>
                  {(['week','month','quarter'] as const).map(p=>(
                    <button key={p} onClick={()=>setChartPeriod(p)} style={filterPill(chartPeriod===p)}>{{week:'Week over week',month:'Month over month',quarter:'Quarterly'}[p]}</button>
                  ))}
                </div>
              </div>
              {/* Date range filter */}
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:14,flexWrap:'wrap'}}>
                <span style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em'}}>From</span>
                <input type="date" value={chartFrom} onChange={e=>setChartFrom(e.target.value)} style={{fontSize:11,padding:'4px 8px',border:`1px solid ${C.border2}`,borderRadius:6,background:C.surface3,color:C.text2,outline:'none'}}/>
                <span style={{fontSize:11,color:C.text3}}>→</span>
                <input type="date" value={chartTo} onChange={e=>setChartTo(e.target.value)} style={{fontSize:11,padding:'4px 8px',border:`1px solid ${C.border2}`,borderRadius:6,background:C.surface3,color:C.text2,outline:'none'}}/>
                {(chartFrom||chartTo)&&<button onClick={()=>{setChartFrom('');setChartTo('')}} style={{fontSize:10,fontWeight:600,color:C.text3,background:'none',border:'none',cursor:'pointer',padding:'2px 6px'}}>✕ Clear</button>}
              </div>
              <BarChart
                bars={buildBars(chartPeriod)}
                title={chartPeriod==='week'?'Weekly lead volume':chartPeriod==='month'?'Monthly lead volume':'Quarterly lead volume'}
                statuses={statuses}
                details={details}
                onViewLead={(email)=>{setView('pipeline');setExpanded(email);setPeriod('all')}}
              />
            </div>
          </div>

          {/* ── Channel Success Renderer (shared by Outreach + Source) ── */}
          {(()=>{
            const segKeyFn=(dateStr:string,seg:'day'|'week'|'month'|'quarter'|'year'):string=>{
              const d=new Date(dateStr); if(isNaN(d.getTime())) return ''
              if(seg==='day') return d.toISOString().split('T')[0]
              if(seg==='week'){const s=new Date(d);s.setDate(d.getDate()-d.getDay());return s.toISOString().split('T')[0]}
              if(seg==='month') return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
              if(seg==='quarter') return `Q${Math.floor(d.getMonth()/3)+1} ${d.getFullYear()}`
              return String(d.getFullYear())
            }
            const segLabelFn=(key:string,seg:'day'|'week'|'month'|'quarter'|'year'):string=>{
              if(seg==='day'){const d=new Date(key);return d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}
              if(seg==='week'){const d=new Date(key);return `Wk ${d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}`}
              if(seg==='month'){const [y,m]=key.split('-');return new Date(Number(y),Number(m)-1).toLocaleDateString('en-US',{month:'short',year:'2-digit'})}
              return key
            }
            const getLeadActivityDate=(l:AppLead):string|null=>{
              const det=details[l.email]
              return det?.connectedDate||det?.meetingDate||l.date||l.receivedAt||null
            }
            const SEG_LABELS:{[k:string]:string}={day:'Day',week:'Week',month:'Month',quarter:'Quarter',year:'Year'}

            // Compute stats for a set of leads grouped by channel
            const computeChannelStats=(leads:AppLead[],getChannel:(l:AppLead)=>string,channels:string[])=>
              channels.map(ch=>{
                const cl=leads.filter(l=>getChannel(l)===ch)
                return {
                  ch,total:cl.length,
                  meetings:cl.filter(l=>!!details[l.email]?.meetingDate).length,
                  sqls:cl.filter(l=>(details[l.email]?.sqlDq||'').toLowerCase()==='yes').length,
                  sqos:cl.filter(l=>(details[l.email]?.sqo||'').toLowerCase()==='yes').length,
                  won:cl.filter(l=>(details[l.email]?.closedWon||'')==='Yes'||(statuses[l.email]||'new')==='closedwon').length,
                }
              })

            // Compute current period start/end from the view segment
            const computeCurrentRange=(seg:'day'|'week'|'month'|'quarter'|'year')=>{
              const now=new Date()
              let segStart:Date,segEnd:Date
              if(seg==='day'){ segStart=new Date(now.getFullYear(),now.getMonth(),now.getDate()); segEnd=new Date(now.getFullYear(),now.getMonth(),now.getDate(),23,59,59) }
              else if(seg==='week'){ segStart=new Date(now);segStart.setDate(now.getDate()-now.getDay());segStart.setHours(0,0,0,0); segEnd=new Date(segStart);segEnd.setDate(segStart.getDate()+6);segEnd.setHours(23,59,59) }
              else if(seg==='month'){ segStart=new Date(now.getFullYear(),now.getMonth(),1); segEnd=new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59) }
              else if(seg==='quarter'){ const qm=Math.floor(now.getMonth()/3)*3; segStart=new Date(now.getFullYear(),qm,1); segEnd=new Date(now.getFullYear(),qm+3,0,23,59,59) }
              else { segStart=new Date(now.getFullYear(),0,1); segEnd=new Date(now.getFullYear(),11,31,23,59,59) }
              return {segStart,segEnd}
            }

            // Compute previous period range for a given comparison unit
            const computePrevRange=(cmp:'day'|'week'|'month'|'quarter'|'year')=>{
              const now=new Date()
              let prevStart:Date,prevEnd:Date
              if(cmp==='day'){ prevStart=new Date(now.getFullYear(),now.getMonth(),now.getDate()-1); prevEnd=new Date(now.getFullYear(),now.getMonth(),now.getDate()-1,23,59,59) }
              else if(cmp==='week'){ prevStart=new Date(now);prevStart.setDate(now.getDate()-now.getDay()-7);prevStart.setHours(0,0,0,0); prevEnd=new Date(prevStart);prevEnd.setDate(prevStart.getDate()+6);prevEnd.setHours(23,59,59) }
              else if(cmp==='month'){ prevStart=new Date(now.getFullYear(),now.getMonth()-1,1); prevEnd=new Date(now.getFullYear(),now.getMonth(),0,23,59,59) }
              else if(cmp==='quarter'){ const qm=Math.floor(now.getMonth()/3)*3; prevStart=new Date(now.getFullYear(),qm-3,1); prevEnd=new Date(now.getFullYear(),qm,0,23,59,59) }
              else { prevStart=new Date(now.getFullYear()-1,0,1); prevEnd=new Date(now.getFullYear()-1,11,31,23,59,59) }
              return {prevStart,prevEnd}
            }

            const PERIOD_LABELS:{[k:string]:string}={day:'today',week:'this week',month:'this month',quarter:'this quarter',year:'this year'}
            const COMPARE_LABELS:{[k:string]:string}={day:'yesterday',week:'last week',month:'last month',quarter:'last quarter',year:'last year'}

            const filterLeadsByRange=(start:Date,end:Date)=>allLeads.filter(l=>{
              const dateStr=getLeadActivityDate(l)
              if(!dateStr) return false
              const d=new Date(dateStr)
              return d>=start&&d<=end
            })

            const renderChannelSuccess=(
              title:string,
              getChannel:(l:AppLead)=>string,
              knownChannels:string[],
              seg:'day'|'week'|'month'|'quarter'|'year',
              setSeg:(v:'day'|'week'|'month'|'quarter'|'year')=>void,
              fromDate:string,setFromDate:(v:string)=>void,
              toDate:string,setToDate:(v:string)=>void,
              palette:Record<string,string>,
              compareVs:'week'|'month'|'quarter'|'year'|null,setCompareVs:(v:'week'|'month'|'quarter'|'year'|null)=>void,
            )=>{
              const {segStart,segEnd}=computeCurrentRange(seg)
              const useCustomRange=!!(fromDate||toDate)
              const rangeStart=useCustomRange&&fromDate?new Date(fromDate):segStart
              const rangeEnd=useCustomRange&&toDate?new Date(toDate+'T23:59:59'):useCustomRange?new Date('2099-01-01'):segEnd
              const showCompare=!!compareVs&&!useCustomRange

              const currentLeads=filterLeadsByRange(rangeStart,rangeEnd)
              const {prevStart,prevEnd}=compareVs?computePrevRange(compareVs):{prevStart:new Date(),prevEnd:new Date()}
              const prevLeads=showCompare?filterLeadsByRange(prevStart,prevEnd):[]

              const channels=knownChannels.filter(c=>c)
              const currentStats=computeChannelStats(currentLeads,getChannel,channels)
              const prevStats=showCompare?computeChannelStats(prevLeads,getChannel,channels):[]

              // Merge channels that appear in either period
              const allChans=channels.filter(ch=>{
                const cur=currentStats.find(s=>s.ch===ch)
                const prev=prevStats.find(s=>s.ch===ch)
                return (cur&&cur.total>0)||(prev&&prev.total>0)
              })

              const summaryLabel=useCustomRange?'custom range':PERIOD_LABELS[seg]
              const prevLabel=compareVs?COMPARE_LABELS[compareVs]:''

              // Delta indicator
              const delta=(cur:number,prev:number)=>{
                const d=cur-prev
                return {d,arrow:d>0?'↑':d<0?'↓':'→',color:d>0?C.green:d<0?C.red:C.text3}
              }

              return (
                <div style={{...card,marginBottom:24}} key={title}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em'}}>{title}</div>
                    <div style={{display:'flex',gap:5,alignItems:'center',flexWrap:'wrap'}}>
                      {(['day','week','month','quarter','year'] as const).map(s=>(
                        <button key={s} onClick={()=>setSeg(s)} style={filterPill(seg===s)}>{SEG_LABELS[s]}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,flexWrap:'wrap'}}>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <span style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em'}}>From</span>
                      <input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} style={{fontSize:11,padding:'4px 8px',border:`1px solid ${C.border2}`,borderRadius:6,background:C.surface3,color:C.text2,outline:'none',colorScheme:'dark'}}/>
                      <span style={{fontSize:11,color:C.text3}}>→</span>
                      <input type="date" value={toDate} onChange={e=>setToDate(e.target.value)} style={{fontSize:11,padding:'4px 8px',border:`1px solid ${C.border2}`,borderRadius:6,background:C.surface3,color:C.text2,outline:'none',colorScheme:'dark'}}/>
                      {(fromDate||toDate)&&<button onClick={()=>{setFromDate('');setToDate('')}} style={{fontSize:10,fontWeight:600,color:C.text3,background:'none',border:'none',cursor:'pointer',padding:'2px 6px'}}>✕ Clear</button>}
                    </div>
                    {!useCustomRange&&(
                      <div style={{display:'flex',gap:4,alignItems:'center'}}>
                        <span style={{fontSize:10,fontWeight:700,color:C.text3,marginRight:2}}>⇄</span>
                        {(['week','month','quarter','year'] as const).map(cmp=>(
                          <button key={cmp} onClick={()=>setCompareVs(compareVs===cmp?null:cmp)} style={{...filterPill(compareVs===cmp,C.amber),fontSize:10,padding:'4px 10px'}}>
                            vs {COMPARE_LABELS[cmp]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Summary cards */}
                  {allChans.length>0?(
                    <>
                    <div style={{fontSize:10,color:C.text3,marginBottom:8,fontWeight:600,textTransform:'uppercase',letterSpacing:'.06em'}}>{summaryLabel}{showCompare?` vs ${prevLabel}`:''}</div>
                    <div style={{display:'grid',gridTemplateColumns:`repeat(${Math.min(allChans.length,4)},1fr)`,gap:12,marginBottom:18}}>
                      {allChans.map(ch=>{
                        const cur=currentStats.find(s=>s.ch===ch)||{ch,total:0,meetings:0,sqls:0,sqos:0,won:0}
                        const prev=prevStats.find(s=>s.ch===ch)||{ch,total:0,meetings:0,sqls:0,sqos:0,won:0}
                        const clr=palette[ch]||C.text2
                        const meetRate=cur.total?Math.round(cur.meetings/cur.total*100):0
                        const sqlRate=cur.total?Math.round(cur.sqls/cur.total*100):0

                        const renderDelta=(curVal:number,prevVal:number)=>{
                          if(!showCompare||useCustomRange) return null
                          const {d,arrow,color}=delta(curVal,prevVal)
                          return <span style={{fontSize:9,fontWeight:700,color,marginLeft:4}}>{arrow}{Math.abs(d)}</span>
                        }

                        return (
                          <div key={ch} style={{background:C.surface3,border:`1px solid ${C.border}`,borderRadius:10,padding:14}}>
                            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                              <span style={{width:8,height:8,borderRadius:2,background:clr,flexShrink:0}}/>
                              <span style={{fontSize:12,fontWeight:700,color:clr}}>{ch}</span>
                            </div>
                            <div style={{display:'flex',alignItems:'baseline',gap:4}}>
                              <span style={{fontSize:22,fontWeight:800,color:C.text}}>{cur.total}</span>
                              {showCompare&&<span style={{fontSize:11,color:C.text3}}>vs {prev.total}</span>}
                              {renderDelta(cur.total,prev.total)}
                            </div>
                            <div style={{fontSize:10,color:C.text3,marginTop:2}}>leads</div>
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginTop:10}}>
                              <div><div style={{display:'flex',alignItems:'baseline',gap:2}}><span style={{fontSize:14,fontWeight:700,color:C.text2}}>{cur.meetings}</span>{renderDelta(cur.meetings,prev.meetings)}</div><div style={{fontSize:9,color:C.text3}}>meetings ({meetRate}%)</div></div>
                              <div><div style={{display:'flex',alignItems:'baseline',gap:2}}><span style={{fontSize:14,fontWeight:700,color:C.text2}}>{cur.sqls}</span>{renderDelta(cur.sqls,prev.sqls)}</div><div style={{fontSize:9,color:C.text3}}>SQLs ({sqlRate}%)</div></div>
                              <div><div style={{display:'flex',alignItems:'baseline',gap:2}}><span style={{fontSize:14,fontWeight:700,color:C.text2}}>{cur.sqos}</span>{renderDelta(cur.sqos,prev.sqos)}</div><div style={{fontSize:9,color:C.text3}}>SQOs</div></div>
                              <div><div style={{display:'flex',alignItems:'baseline',gap:2}}><span style={{fontSize:14,fontWeight:700,color:C.text2}}>{cur.won}</span>{renderDelta(cur.won,prev.won)}</div><div style={{fontSize:9,color:C.text3}}>won</div></div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Comparison table — shown when compare is active */}
                    {showCompare&&(
                      <div style={{overflowX:'auto',marginBottom:8}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                          <thead>
                            <tr style={{borderBottom:`2px solid ${C.border2}`}}>
                              <th style={{padding:'8px 10px',textAlign:'left',fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em'}}>Channel</th>
                              {['Leads','Meetings','SQLs','SQOs','Won'].map(h=>(
                                <th key={h} colSpan={2} style={{padding:'8px 6px',textAlign:'center',fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',borderLeft:`1px solid ${C.border}`}}>{h}</th>
                              ))}
                            </tr>
                            <tr style={{borderBottom:`1px solid ${C.border}`}}>
                              <th/>
                              {Array(5).fill(0).map((_,i)=>(
                                <React.Fragment key={i}>
                                  <th style={{padding:'4px 6px',textAlign:'right',fontSize:9,fontWeight:600,color:C.green,borderLeft:`1px solid ${C.border}`}}>Cur</th>
                                  <th style={{padding:'4px 6px',textAlign:'right',fontSize:9,fontWeight:600,color:C.text3}}>Prev</th>
                                </React.Fragment>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {allChans.map(ch=>{
                              const cur=currentStats.find(s=>s.ch===ch)||{ch,total:0,meetings:0,sqls:0,sqos:0,won:0}
                              const prev=prevStats.find(s=>s.ch===ch)||{ch,total:0,meetings:0,sqls:0,sqos:0,won:0}
                              const pairs:[number,number][]=[
                                [cur.total,prev.total],[cur.meetings,prev.meetings],[cur.sqls,prev.sqls],[cur.sqos,prev.sqos],[cur.won,prev.won]
                              ]
                              return (
                                <tr key={ch} style={{borderBottom:`1px solid ${C.border}`}}>
                                  <td style={{padding:'8px 10px',fontWeight:600,color:palette[ch]||C.text,whiteSpace:'nowrap'}}>{ch}</td>
                                  {pairs.map(([c,p],i)=>{
                                    const {arrow,color}=delta(c,p)
                                    return (
                                      <React.Fragment key={i}>
                                        <td style={{padding:'8px 6px',textAlign:'right',fontWeight:700,color:C.text,borderLeft:`1px solid ${C.border}`}}>{c} <span style={{fontSize:9,fontWeight:700,color}}>{arrow}</span></td>
                                        <td style={{padding:'8px 6px',textAlign:'right',color:C.text3}}>{p}</td>
                                      </React.Fragment>
                                    )
                                  })}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    </>
                  ):(
                    <div style={{fontSize:12,color:C.text3,padding:'12px 0'}}>No {title.toLowerCase()} data available for this period.</div>
                  )}
                </div>
              )
            }

            const outreachPalette:Record<string,string>={Email:'#60d4f4',LinkedIn:'#a89cf8',Call:C.green,Other:C.amber}
            const sourcePalette:Record<string,string>={'#growth-wins':'#00e5a0','#leads-bot':'#60d4f4','leads-platform waitlist':'#c084fc','gated-content':'#f5a623','QA Wolf inbox':'#e879f9',webinar:'#fb923c','AE assist':'#34d399','gen OB':'#a78bfa',Other:C.text2}

            return (<>
              {renderChannelSuccess(
                'Outreach Channel Success',
                l=>details[l.email]?.outreachChannel||'',
                OUTREACH_CH,
                ocSegment,setOcSegment,
                ocFrom,setOcFrom,ocTo,setOcTo,
                outreachPalette,
                ocCompare,setOcCompare,
              )}
              {renderChannelSuccess(
                'Source Channel Success',
                l=>details[l.email]?.sourceChannel||'',
                SOURCE_CHANNELS,
                scSegment,setScSegment,
                scFrom,setScFrom,scTo,setScTo,
                sourcePalette,
                scCompare,setScCompare,
              )}
            </>)
          })()}

          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:16,marginBottom:24}}>
            <div style={card}>
              <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:12}}>
                Quarterly opportunity breakdown
              </div>
              <BarChart
                bars={Object.entries(
                  allLeads
                    .filter(l => (details[l.email]?.sqo||'') === 'Yes')
                    .reduce((acc, l) => {
                      const d = details[l.email]
                      const key = getQuarterLabel(d?.closedWonDate || d?.sqoDate)
                      if (!acc[key]) acc[key] = []
                      acc[key].push(l)
                      return acc
                    }, {} as Record<string, AppLead[]>)
                ).map(([label, leads]) => ({
                  label,
                  leads,
                  total: leads.length,
                  values: [
                    { status:'closedwon' as const, count: leads.filter(l => { const d = details[l.email]; const s = statuses[l.email]||'new'; return d?.closedWon!=='Yes' && s!=='lost' && s!=='dq' }).length },
                    { status:'lost' as const, count: leads.filter(l => { const d = details[l.email]; const s = statuses[l.email]||'new'; return d?.closedWon!=='Yes' && (s==='lost' || s==='dq') }).length },
                    { status:'booked' as const, count: leads.filter(l => (details[l.email]?.closedWon||'')==='Yes').length },
                  ]
                }))}
                title="Quarterly opportunity counts"
                statuses={statuses}
                details={details}
                onViewLead={(email)=>{setView('pipeline');setExpanded(email);setPeriod('all')}}
              />
            </div>

            <div style={card}>
              <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:12}}>
                Opportunity segmentation
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr',gap:10}}>
                <div style={{background:C.surface3,border:`1px solid ${C.border}`,borderRadius:8,padding:'12px 14px'}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase'}}>Total opportunities</div>
                  <div style={{fontSize:24,fontWeight:800,color:'#c084fc',marginTop:6}}>{allLeads.filter(l=>(details[l.email]?.sqo||'')==='Yes').length}</div>
                </div>
                <div style={{background:C.surface3,border:`1px solid ${C.border}`,borderRadius:8,padding:'12px 14px'}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase'}}>Active opportunities</div>
                  <div style={{fontSize:24,fontWeight:800,color:'#00e5a0',marginTop:6}}>{allLeads.filter(l=>{const d=details[l.email]; const s=statuses[l.email]||'new'; return d?.sqo==='Yes' && d?.closedWon!=='Yes' && s!=='lost' && s!=='dq'}).length}</div>
                </div>
                <div style={{background:C.surface3,border:`1px solid ${C.border}`,borderRadius:8,padding:'12px 14px'}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase'}}>Lost opportunities</div>
                  <div style={{fontSize:24,fontWeight:800,color:C.red,marginTop:6}}>{allLeads.filter(l=>{const d=details[l.email]; const s=statuses[l.email]||'new'; return d?.sqo==='Yes' && d?.closedWon!=='Yes' && (s==='lost' || s==='dq')}).length}</div>
                </div>
                <div style={{background:C.surface3,border:`1px solid ${C.border}`,borderRadius:8,padding:'12px 14px'}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase'}}>Pipeline ACV</div>
                  <div style={{fontSize:24,fontWeight:800,color:C.amber,marginTop:6}}>${allLeads.reduce((s,l)=>{const d=details[l.email]; return s+((d?.sqo==='Yes'&&d?.acv)?parseAcv(d.acv):0)},0).toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>

          {/* ── MQL → SQL → SQO Conversion Funnel ── */}
          {(()=>{
            // Segment helpers
            const segKey=(dateStr:string):string=>{
              if(!dateStr)return '';const d=new Date(dateStr);if(isNaN(d.getTime()))return ''
              if(convSeg==='year')return String(d.getFullYear())
              if(convSeg==='quarter')return `${d.getFullYear()}-Q${Math.floor(d.getMonth()/3)+1}`
              if(convSeg==='month')return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
              const ws=new Date(d);ws.setDate(d.getDate()-d.getDay());return ws.toISOString().split('T')[0]
            }
            const segLabel=(k:string):string=>{
              if(convSeg==='year')return k
              if(convSeg==='quarter'){const m=k.match(/^(\d+)-Q(\d)$/);return m?`Q${m[2]} ${m[1]}`:k}
              if(convSeg==='month'){const [y,m]=k.split('-').map(Number);return new Date(y,m-1).toLocaleString('en-US',{month:'short',year:'2-digit'})}
              return `Wk ${new Date(k).toLocaleDateString('en-US',{month:'short',day:'numeric'})}`
            }

            // Gather all leads with their stage dates
            // MQL date = receivedAt or date (when the lead entered the system)
            // SQL date = details.sqlDate (when sqlDq = Yes)
            // SQO date = details.sqoDate (when sqo = Yes)
            const entries=allLeads.map(l=>{
              const det=details[l.email]||EMPTY_DETAIL
              const mqlDate=l.date||l.receivedAt||''
              const sqlDate=((det.sqlDq||'').toLowerCase()==='yes')?det.sqlDate:'';
              const sqoDate=((det.sqo||'').toLowerCase()==='yes')?det.sqoDate:''
              const isSql=!!sqlDate
              const isSqo=!!sqoDate
              // Avg days calculations
              const mqlToSql=mqlDate&&sqlDate?Math.max(0,Math.round((new Date(sqlDate).getTime()-new Date(mqlDate).getTime())/864e5)):null
              const sqlToSqo=sqlDate&&sqoDate?Math.max(0,Math.round((new Date(sqoDate).getTime()-new Date(sqlDate).getTime())/864e5)):null
              return {email:l.email,mqlDate,sqlDate,sqoDate,isSql,isSqo,mqlToSql,sqlToSqo,
                account:nameOverrides[l.email]||l.account||formatDomain(l.domain)||l.email}
            })

            // Build period rows
            type ConvRow={key:string;label:string;mqls:number;sqls:number;sqos:number;mqlToSqlDays:number[];sqlToSqoDays:number[];leads:typeof entries}
            const rowMap=new Map<string,ConvRow>()
            entries.forEach(e=>{
              const k=segKey(e.mqlDate);if(!k)return
              if(!rowMap.has(k))rowMap.set(k,{key:k,label:segLabel(k),mqls:0,sqls:0,sqos:0,mqlToSqlDays:[],sqlToSqoDays:[],leads:[]})
              const r=rowMap.get(k)!;r.mqls++;r.leads.push(e)
              if(e.isSql){r.sqls++;if(e.mqlToSql!==null)r.mqlToSqlDays.push(e.mqlToSql)}
              if(e.isSqo){r.sqos++;if(e.sqlToSqo!==null)r.sqlToSqoDays.push(e.sqlToSqo)}
            })
            const rows=Array.from(rowMap.values()).sort((a,b)=>b.key.localeCompare(a.key))

            // Totals
            const totalMqls=entries.length
            const totalSqls=entries.filter(e=>e.isSql).length
            const totalSqos=entries.filter(e=>e.isSqo).length
            const mqlToSqlRate=totalMqls>0?Math.round(totalSqls/totalMqls*100):0
            const sqlToSqoRate=totalSqls>0?Math.round(totalSqos/totalSqls*100):0
            const mqlToSqoRate=totalMqls>0?Math.round(totalSqos/totalMqls*100):0
            const avgDays=(arr:number[])=>arr.length>0?Math.round(arr.reduce((s,n)=>s+n,0)/arr.length):null

            // Previous period comparison (shift each row back by one segment)
            const getPrevKey=(k:string):string=>{
              if(convSeg==='year')return String(Number(k)-1)
              if(convSeg==='quarter'){const m=k.match(/^(\d+)-Q(\d)$/);if(!m)return '';const y=Number(m[1]),q=Number(m[2]);return q===1?`${y-1}-Q4`:`${y}-Q${q-1}`}
              if(convSeg==='month'){const [y,mo]=k.split('-').map(Number);const d=new Date(y,mo-2,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
              const d=new Date(k);d.setDate(d.getDate()-7);return d.toISOString().split('T')[0]
            }

            // For the conversion-over-time chart, use up to 8 most recent periods
            const chartRows=rows.slice(0,8).reverse()
            const maxRate=Math.max(1,...chartRows.flatMap(r=>[r.mqls>0?r.sqls/r.mqls*100:0,r.sqls>0?r.sqos/r.sqls*100:0]))

            // Comparison label
            const compLabel=convSeg==='year'?'previous year':convSeg==='quarter'?'previous quarter':convSeg==='month'?'previous month':'previous week'

            return (
              <div style={{...card,marginBottom:24}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em'}}>MQL → SQL → SQO Conversion</div>
                  <div style={{display:'flex',gap:5,alignItems:'center'}}>
                    {(['year','quarter','month','week'] as const).map(s=>(
                      <button key={s} onClick={()=>setConvSeg(s)} style={filterPill(convSeg===s)}>{s.charAt(0).toUpperCase()+s.slice(1)}</button>
                    ))}
                    <button onClick={()=>setConvCompare(!convCompare)} style={{...filterPill(convCompare,C.amber),fontSize:10,marginLeft:4}}>
                      {convCompare?`✕ vs ${compLabel}`:`⇄ vs ${compLabel}`}
                    </button>
                  </div>
                </div>

                {/* Summary cards */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:10,marginBottom:18}}>
                  {[
                    {label:'MQLs',value:totalMqls,color:C.text,sub:'all leads'},
                    {label:'SQLs',value:totalSqls,color:'#60d4f4',sub:'qualified'},
                    {label:'SQOs',value:totalSqos,color:'#c084fc',sub:'opportunities'},
                    {label:'MQL→SQL',value:`${mqlToSqlRate}%`,color:C.green,sub:`${totalSqls} of ${totalMqls}`},
                    {label:'SQL→SQO',value:`${sqlToSqoRate}%`,color:C.amber,sub:`${totalSqos} of ${totalSqls}`},
                    {label:'MQL→SQO',value:`${mqlToSqoRate}%`,color:'#e879f9',sub:'full funnel'},
                  ].map(s=>(
                    <div key={s.label} style={{background:C.surface3,border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 12px'}}>
                      <div style={{fontSize:9,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>{s.label}</div>
                      <div style={{fontSize:20,fontWeight:800,color:s.color}}>{s.value}</div>
                      <div style={{fontSize:9,color:C.text3,marginTop:3}}>{s.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Conversion rate over time — line chart (CSS-positioned, no SVG scaling issues) */}
                {chartRows.length>1&&(()=>{
                  // Compute data points
                  const points=chartRows.map(r=>({
                    mqlSql:r.mqls>0?Math.round(r.sqls/r.mqls*100):0,
                    sqlSqo:r.sqls>0?Math.round(r.sqos/r.sqls*100):0,
                    label:r.label,
                  }))
                  // Auto-scale Y axis: round up to nearest 10 above max value, minimum 20
                  const allVals=points.flatMap(p=>[p.mqlSql,p.sqlSqo])
                  const yMax=Math.max(20,Math.ceil(Math.max(...allVals)/10)*10+10)
                  const chartH=140
                  const yPos=(v:number)=>chartH-(v/yMax*chartH)
                  const n=points.length
                  return (
                    <div style={{marginBottom:18}}>
                      <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Conversion Rate Over Time</div>
                      <div style={{position:'relative',height:chartH+30,marginLeft:30,marginRight:10}}>
                        {/* Y gridlines */}
                        {Array.from({length:5},(_,i)=>{const v=Math.round(yMax/4*i);return (
                          <div key={i} style={{position:'absolute',left:-30,right:0,top:yPos(v)}}>
                            <div style={{display:'flex',alignItems:'center'}}>
                              <span style={{fontSize:8,color:C.text3,width:26,textAlign:'right',flexShrink:0}}>{v}%</span>
                              <div style={{flex:1,height:1,background:C.border,marginLeft:4,opacity:0.4}}/>
                            </div>
                          </div>
                        )})}
                        {/* Smooth curve lines — only connect active months (at least 1 SQL or SQO) */}
                        {(()=>{
                          // Build active-only point arrays for each line
                          const xPct=(i:number)=>n>1?i/(n-1)*100:50
                          const activeGreen=points.map((p,i)=>({x:xPct(i),y:yPos(p.mqlSql),val:p.mqlSql,active:p.mqlSql>0||p.sqlSqo>0})).filter(p=>p.active)
                          const activeAmber=points.map((p,i)=>({x:xPct(i),y:yPos(p.sqlSqo),val:p.sqlSqo,active:p.mqlSql>0||p.sqlSqo>0})).filter(p=>p.active)

                          // Build smooth cubic bezier path from points
                          const smoothPath=(pts:{x:number;y:number}[]):string=>{
                            if(pts.length<2) return ''
                            // Use monotone cubic interpolation for smooth curves
                            let d=`M${pts[0].x},${pts[0].y}`
                            for(let i=1;i<pts.length;i++){
                              const prev=pts[i-1],cur=pts[i]
                              const cpx=(prev.x+cur.x)/2
                              d+=` C${cpx},${prev.y} ${cpx},${cur.y} ${cur.x},${cur.y}`
                            }
                            return d
                          }

                          // SVG uses viewBox coordinates matching the container
                          const svgW=1000
                          const toSvgX=(pct:number)=>pct/100*svgW
                          const greenSvg=activeGreen.map(p=>({x:toSvgX(p.x),y:p.y}))
                          const amberSvg=activeAmber.map(p=>({x:toSvgX(p.x),y:p.y}))

                          return (
                            <svg viewBox={`0 0 ${svgW} ${chartH}`} style={{position:'absolute',top:0,left:0,width:'100%',height:chartH,overflow:'visible'}} preserveAspectRatio="xMidYMid meet">
                              {greenSvg.length>=2&&<path d={smoothPath(greenSvg)} fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round"/>}
                              {amberSvg.length>=2&&<path d={smoothPath(amberSvg)} fill="none" stroke={C.amber} strokeWidth="3" strokeLinecap="round"/>}
                            </svg>
                          )
                        })()}
                        {/* Data points + labels — show all months, dim inactive ones */}
                        {points.map((p,i)=>{
                          const xPct=n>1?i/(n-1)*100:50
                          const isActive=p.mqlSql>0||p.sqlSqo>0
                          return (
                            <React.Fragment key={i}>
                              {/* MQL→SQL dot + label */}
                              <div style={{position:'absolute',left:`${xPct}%`,top:yPos(p.mqlSql),transform:'translate(-50%,-50%)',width:7,height:7,borderRadius:'50%',background:isActive?C.green:C.text3,opacity:isActive?1:0.3,zIndex:2}}/>
                              {isActive&&<div style={{position:'absolute',left:`${xPct}%`,top:yPos(p.mqlSql)-14,transform:'translateX(-50%)',fontSize:9,fontWeight:700,color:C.green,whiteSpace:'nowrap',zIndex:2}}>{p.mqlSql}%</div>}
                              {/* SQL→SQO dot + label */}
                              <div style={{position:'absolute',left:`${xPct}%`,top:yPos(p.sqlSqo),transform:'translate(-50%,-50%)',width:7,height:7,borderRadius:'50%',background:isActive?C.amber:C.text3,opacity:isActive?1:0.3,zIndex:2}}/>
                              {isActive&&<div style={{position:'absolute',left:`${xPct}%`,top:Math.abs(yPos(p.sqlSqo)-yPos(p.mqlSql))<18?yPos(p.sqlSqo)+10:yPos(p.sqlSqo)-14,transform:'translateX(-50%)',fontSize:9,fontWeight:700,color:C.amber,whiteSpace:'nowrap',zIndex:2}}>{p.sqlSqo}%</div>}
                              {/* X label */}
                              <div style={{position:'absolute',left:`${xPct}%`,top:chartH+6,transform:'translateX(-50%)',fontSize:8,color:isActive?C.text3:'rgba(255,255,255,0.2)',whiteSpace:'nowrap'}}>{p.label}</div>
                            </React.Fragment>
                          )
                        })}
                      </div>
                      <div style={{display:'flex',gap:12,marginTop:4,justifyContent:'center'}}>
                        <div style={{display:'flex',alignItems:'center',gap:3}}><span style={{width:12,height:2.5,borderRadius:1,background:C.green}}/><span style={{fontSize:9,color:C.text3}}>MQL→SQL %</span></div>
                        <div style={{display:'flex',alignItems:'center',gap:3}}><span style={{width:12,height:2.5,borderRadius:1,background:C.amber}}/><span style={{fontSize:9,color:C.text3}}>SQL→SQO %</span></div>
                      </div>
                    </div>
                  )
                })()}

                {/* Conversion detail table */}
                {convCompare&&<div style={{fontSize:10,color:C.text3,marginBottom:6}}>Comparing each period against {compLabel}. <span style={{color:C.green}}>Green ↑ = improving</span> · <span style={{color:C.red}}>Red ↓ = declining</span>. For avg days, lower is better.</div>}
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                    <thead>
                      <tr style={{borderBottom:`2px solid ${C.border2}`}}>
                        {['Period','MQLs','SQLs','MQL→SQL','SQOs','SQL→SQO','MQL→SQO','Avg MQL→SQL','Avg SQL→SQO'].map(h=>(
                          <th key={h} style={{padding:'7px 8px',textAlign:h==='Period'?'left':'right',fontSize:9,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',whiteSpace:'nowrap'}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r=>{
                        const ms=r.mqls>0?Math.round(r.sqls/r.mqls*100):0
                        const ss=r.sqls>0?Math.round(r.sqos/r.sqls*100):0
                        const full=r.mqls>0?Math.round(r.sqos/r.mqls*100):0
                        const avgMs=avgDays(r.mqlToSqlDays)
                        const avgSs=avgDays(r.sqlToSqoDays)
                        const prevRow=convCompare?rowMap.get(getPrevKey(r.key)):null
                        const prevMs=prevRow&&prevRow.mqls>0?Math.round(prevRow.sqls/prevRow.mqls*100):null
                        const prevSs=prevRow&&prevRow.sqls>0?Math.round(prevRow.sqos/prevRow.sqls*100):null
                        const prevAvgMs=prevRow?avgDays(prevRow.mqlToSqlDays):null
                        const prevAvgSs=prevRow?avgDays(prevRow.sqlToSqoDays):null
                        const rateDelta=(cur:number,prev:number|null)=>{if(prev===null)return null;const d=cur-prev;return {d,color:d>0?C.green:d<0?C.red:C.text3,arrow:d>0?'↑':d<0?'↓':'→'}}
                        const daysDelta=(cur:number|null,prev:number|null)=>{if(cur===null||prev===null)return null;const d=cur-prev;return {d,color:d<0?C.green:d>0?C.red:C.text3,arrow:d<0?'↑':d>0?'↓':'→'}}
                        const msD=rateDelta(ms,prevMs)
                        const ssD=rateDelta(ss,prevSs)
                        const avgMsD=daysDelta(avgMs,prevAvgMs)
                        const avgSsD=daysDelta(avgSs,prevAvgSs)
                        const isExp=convExpandedRow===r.key
                        // Filter leads by selected metric tab
                        const filteredLeads=isExp?r.leads.filter(e=>{
                          if(convExpandedMetric==='all')return true
                          if(convExpandedMetric==='mqls')return true
                          if(convExpandedMetric==='sqls')return e.isSql
                          if(convExpandedMetric==='sqos')return e.isSqo
                          if(convExpandedMetric==='mql_sql')return e.isSql
                          if(convExpandedMetric==='sql_sqo')return e.isSqo
                          if(convExpandedMetric==='mql_sqo')return e.isSqo
                          if(convExpandedMetric==='avg_mql_sql')return e.isSql&&e.mqlToSql!==null
                          if(convExpandedMetric==='avg_sql_sqo')return e.isSqo&&e.sqlToSqo!==null
                          return true
                        }):[]
                        return (
                          <React.Fragment key={r.key}>
                          <tr style={{borderBottom:isExp?'none':`1px solid ${C.border}`,cursor:'pointer',background:isExp?C.surface2:'transparent'}} onClick={()=>{setConvExpandedRow(isExp?null:r.key);setConvExpandedMetric('all')}}>
                            <td style={{padding:'7px 8px',fontWeight:600,color:isExp?C.amber:C.text}}>{isExp?'▼ ':''}{r.label}</td>
                            <td style={{padding:'7px 8px',textAlign:'right',color:C.text}}>{r.mqls}</td>
                            <td style={{padding:'7px 8px',textAlign:'right',color:'#60d4f4'}}>{r.sqls}</td>
                            <td style={{padding:'7px 8px',textAlign:'right',fontWeight:700,color:C.green}}>{ms}%{msD&&<span style={{fontSize:8,color:msD.color,marginLeft:3}}>{msD.arrow}{Math.abs(msD.d)}</span>}</td>
                            <td style={{padding:'7px 8px',textAlign:'right',color:'#c084fc'}}>{r.sqos}</td>
                            <td style={{padding:'7px 8px',textAlign:'right',fontWeight:700,color:C.amber}}>{ss}%{ssD&&<span style={{fontSize:8,color:ssD.color,marginLeft:3}}>{ssD.arrow}{Math.abs(ssD.d)}</span>}</td>
                            <td style={{padding:'7px 8px',textAlign:'right',color:'#e879f9'}}>{full}%</td>
                            <td style={{padding:'7px 8px',textAlign:'right',color:avgMs!==null?C.text2:C.text3}}>{avgMs!==null?`${avgMs}d`:'—'}{avgMsD&&<span style={{fontSize:8,color:avgMsD.color,marginLeft:3}}>{avgMsD.arrow}{Math.abs(avgMsD.d)}d</span>}</td>
                            <td style={{padding:'7px 8px',textAlign:'right',color:avgSs!==null?C.text2:C.text3}}>{avgSs!==null?`${avgSs}d`:'—'}{avgSsD&&<span style={{fontSize:8,color:avgSsD.color,marginLeft:3}}>{avgSsD.arrow}{Math.abs(avgSsD.d)}d</span>}</td>
                          </tr>
                          {isExp&&(
                            <tr style={{borderBottom:`1px solid ${C.border}`,background:C.surface2}}>
                              <td colSpan={9} style={{padding:'12px 10px'}}>
                                <div style={{display:'flex',gap:4,marginBottom:10,flexWrap:'wrap'}}>
                                  {([['all','All Opps'],['mqls','MQLs'],['sqls','SQLs'],['mql_sql','MQL→SQL'],['sqos','SQOs'],['sql_sqo','SQL→SQO'],['mql_sqo','MQL→SQO'],['avg_mql_sql','Avg MQL→SQL'],['avg_sql_sqo','Avg SQL→SQO']] as [string,string][]).map(([k,label])=>(
                                    <button key={k} onClick={e=>{e.stopPropagation();setConvExpandedMetric(k)}} style={{fontSize:9,fontWeight:600,padding:'3px 8px',borderRadius:4,cursor:'pointer',border:`1px solid ${convExpandedMetric===k?C.amber:C.border2}`,background:convExpandedMetric===k?'rgba(245,166,35,0.15)':'transparent',color:convExpandedMetric===k?C.amber:C.text3}}>{label} ({k==='all'?r.leads.length:filteredLeads.length})</button>
                                  ))}
                                </div>
                                <div style={{maxHeight:280,overflowY:'auto'}}>
                                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:10}}>
                                    <thead>
                                      <tr style={{borderBottom:`1px solid ${C.border}`}}>
                                        {['Account','MQL Date','SQL Date','SQO Date','MQL→SQL','SQL→SQO','Stage'].map(h=>(
                                          <th key={h} style={{padding:'5px 7px',textAlign:'left',fontSize:8,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',whiteSpace:'nowrap',position:'sticky',top:0,background:C.surface2}}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {filteredLeads.map((e,i)=>{
                                        const stage=e.isSqo?'SQO':e.isSql?'SQL':'MQL'
                                        const stageColor=stage==='SQO'?'#c084fc':stage==='SQL'?'#60d4f4':C.text3
                                        return (
                                          <tr key={`${e.email}-${i}`} style={{borderBottom:`1px solid ${C.border}`}}>
                                            <td style={{padding:'5px 7px',fontWeight:600,color:C.text,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.account}</td>
                                            <td style={{padding:'5px 7px',color:C.text3,whiteSpace:'nowrap'}}>{e.mqlDate?new Date(e.mqlDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}):'—'}</td>
                                            <td style={{padding:'5px 7px',color:e.sqlDate?'#60d4f4':C.text3,whiteSpace:'nowrap'}}>{e.sqlDate?new Date(e.sqlDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}):'—'}</td>
                                            <td style={{padding:'5px 7px',color:e.sqoDate?'#c084fc':C.text3,whiteSpace:'nowrap'}}>{e.sqoDate?new Date(e.sqoDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}):'—'}</td>
                                            <td style={{padding:'5px 7px',color:e.mqlToSql!==null?C.text2:C.text3}}>{e.mqlToSql!==null?`${e.mqlToSql}d`:'—'}</td>
                                            <td style={{padding:'5px 7px',color:e.sqlToSqo!==null?C.text2:C.text3}}>{e.sqlToSqo!==null?`${e.sqlToSqo}d`:'—'}</td>
                                            <td style={{padding:'5px 7px'}}><span style={{fontSize:8,fontWeight:700,color:stageColor,background:`${stageColor}18`,padding:'1px 5px',borderRadius:3}}>{stage}</span></td>
                                          </tr>
                                        )
                                      })}
                                      {filteredLeads.length===0&&<tr><td colSpan={7} style={{padding:'10px 7px',textAlign:'center',color:C.text3}}>No leads for this filter</td></tr>}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Velocity & Success Metrics */}
                {(()=>{
                  // Collect velocity data from leads with actual dates
                  const mqlToSqlDays:number[]=[]
                  const sqlToSqoDays:number[]=[]
                  const mqlToSqoDays:number[]=[]
                  // Same for current month and previous month
                  const now2=new Date()
                  const curMk=`${now2.getFullYear()}-${String(now2.getMonth()+1).padStart(2,'0')}`
                  const prevMk=(()=>{const d=new Date(now2.getFullYear(),now2.getMonth()-1,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`})()
                  const curMqlSql:number[]=[];const prevMqlSql:number[]=[]
                  const curSqlSqo:number[]=[];const prevSqlSqo:number[]=[]

                  entries.forEach(e=>{
                    if(e.mqlToSql!==null){
                      mqlToSqlDays.push(e.mqlToSql)
                      const mk=e.sqlDate?`${new Date(e.sqlDate).getFullYear()}-${String(new Date(e.sqlDate).getMonth()+1).padStart(2,'0')}`:''
                      if(mk===curMk) curMqlSql.push(e.mqlToSql)
                      if(mk===prevMk) prevMqlSql.push(e.mqlToSql)
                    }
                    if(e.sqlToSqo!==null){
                      sqlToSqoDays.push(e.sqlToSqo)
                      const mk=e.sqoDate?`${new Date(e.sqoDate).getFullYear()}-${String(new Date(e.sqoDate).getMonth()+1).padStart(2,'0')}`:''
                      if(mk===curMk) curSqlSqo.push(e.sqlToSqo)
                      if(mk===prevMk) prevSqlSqo.push(e.sqlToSqo)
                    }
                    if(e.mqlToSql!==null&&e.sqlToSqo!==null) mqlToSqoDays.push(e.mqlToSql+e.sqlToSqo)
                  })

                  const avg=(arr:number[])=>arr.length?Math.round(arr.reduce((s,n)=>s+n,0)/arr.length):null
                  const median=(arr:number[])=>{if(!arr.length)return null;const s=[...arr].sort((a,b)=>a-b);const m=Math.floor(s.length/2);return s.length%2?s[m]:Math.round((s[m-1]+s[m])/2)}
                  // Velocity delta: lower is better → green for decrease
                  const velDelta=(cur:number[]|null,prev:number[]|null)=>{
                    const c=cur&&cur.length?avg(cur):null;const p=prev&&prev.length?avg(prev):null
                    if(c===null||p===null)return null
                    const d=c-p;return {d,color:d<0?C.green:d>0?C.red:C.text3,arrow:d<0?'↑ faster':d>0?'↓ slower':'→ same'}
                  }
                  const mqlSqlVel=velDelta(curMqlSql,prevMqlSql)
                  const sqlSqoVel=velDelta(curSqlSqo,prevSqlSqo)

                  // Win rate: SQOs that became Closed-Won / total SQOs
                  const sqoLeadsAll=entries.filter(e=>e.isSqo)
                  const wonCount=sqoLeadsAll.filter(e=>{const st=statuses[e.email]||'new';return (details[e.email]?.closedWon||'')==='Yes'||st==='closedwon'}).length
                  const winRate=sqoLeadsAll.length>0?Math.round(wonCount/sqoLeadsAll.length*100):0

                  // Drop-off rate: Lost + DQ / total leads
                  const dropCount=entries.filter(e=>{const st=statuses[e.email]||'new';return st==='lost'||st==='dq'}).length
                  const dropRate=entries.length>0?Math.round(dropCount/entries.length*100):0

                  return (
                    <div style={{marginTop:16}}>
                      <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Velocity & Success Metrics</div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
                        {/* MQL→SQL velocity */}
                        <div style={{background:C.surface3,borderRadius:8,padding:'10px 12px',border:`1px solid ${C.border}`}}>
                          <div style={{fontSize:9,fontWeight:700,color:C.text3,textTransform:'uppercase',marginBottom:6}}>MQL → SQL</div>
                          <div style={{display:'flex',alignItems:'baseline',gap:6}}>
                            <span style={{fontSize:18,fontWeight:800,color:C.green}}>{avg(mqlToSqlDays)!==null?`${avg(mqlToSqlDays)}d`:'—'}</span>
                            <span style={{fontSize:10,color:C.text3}}>avg</span>
                          </div>
                          <div style={{fontSize:10,color:C.text2,marginTop:2}}>Median: {median(mqlToSqlDays)!==null?`${median(mqlToSqlDays)}d`:'—'}</div>
                          {mqlSqlVel&&<div style={{fontSize:9,color:mqlSqlVel.color,fontWeight:600,marginTop:4}}>{mqlSqlVel.arrow} vs prev month ({Math.abs(mqlSqlVel.d)}d)</div>}
                          <div style={{fontSize:9,color:C.text3,marginTop:2}}>{mqlToSqlDays.length} leads measured</div>
                        </div>
                        {/* SQL→SQO velocity */}
                        <div style={{background:C.surface3,borderRadius:8,padding:'10px 12px',border:`1px solid ${C.border}`}}>
                          <div style={{fontSize:9,fontWeight:700,color:C.text3,textTransform:'uppercase',marginBottom:6}}>SQL → SQO</div>
                          <div style={{display:'flex',alignItems:'baseline',gap:6}}>
                            <span style={{fontSize:18,fontWeight:800,color:C.amber}}>{avg(sqlToSqoDays)!==null?`${avg(sqlToSqoDays)}d`:'—'}</span>
                            <span style={{fontSize:10,color:C.text3}}>avg</span>
                          </div>
                          <div style={{fontSize:10,color:C.text2,marginTop:2}}>Median: {median(sqlToSqoDays)!==null?`${median(sqlToSqoDays)}d`:'—'}</div>
                          {sqlSqoVel&&<div style={{fontSize:9,color:sqlSqoVel.color,fontWeight:600,marginTop:4}}>{sqlSqoVel.arrow} vs prev month ({Math.abs(sqlSqoVel.d)}d)</div>}
                          <div style={{fontSize:9,color:C.text3,marginTop:2}}>{sqlToSqoDays.length} leads measured</div>
                        </div>
                        {/* Full funnel velocity */}
                        <div style={{background:C.surface3,borderRadius:8,padding:'10px 12px',border:`1px solid ${C.border}`}}>
                          <div style={{fontSize:9,fontWeight:700,color:C.text3,textTransform:'uppercase',marginBottom:6}}>MQL → SQO (full)</div>
                          <div style={{display:'flex',alignItems:'baseline',gap:6}}>
                            <span style={{fontSize:18,fontWeight:800,color:'#e879f9'}}>{avg(mqlToSqoDays)!==null?`${avg(mqlToSqoDays)}d`:'—'}</span>
                            <span style={{fontSize:10,color:C.text3}}>avg</span>
                          </div>
                          <div style={{fontSize:10,color:C.text2,marginTop:2}}>Median: {median(mqlToSqoDays)!==null?`${median(mqlToSqoDays)}d`:'—'}</div>
                          <div style={{fontSize:9,color:C.text3,marginTop:4}}>{mqlToSqoDays.length} leads measured</div>
                        </div>
                        {/* Win rate + Drop-off */}
                        <div style={{background:C.surface3,borderRadius:8,padding:'10px 12px',border:`1px solid ${C.border}`}}>
                          <div style={{fontSize:9,fontWeight:700,color:C.text3,textTransform:'uppercase',marginBottom:6}}>Outcomes</div>
                          <div style={{display:'flex',alignItems:'baseline',gap:6}}>
                            <span style={{fontSize:18,fontWeight:800,color:C.green}}>{winRate}%</span>
                            <span style={{fontSize:10,color:C.text3}}>win rate</span>
                          </div>
                          <div style={{fontSize:10,color:C.text2,marginTop:2}}>{wonCount} won / {sqoLeadsAll.length} SQOs</div>
                          <div style={{borderTop:`1px solid ${C.border}`,marginTop:6,paddingTop:6}}>
                            <div style={{display:'flex',alignItems:'baseline',gap:6}}>
                              <span style={{fontSize:14,fontWeight:800,color:C.red}}>{dropRate}%</span>
                              <span style={{fontSize:10,color:C.text3}}>drop-off</span>
                            </div>
                            <div style={{fontSize:9,color:C.text3,marginTop:1}}>{dropCount} lost/DQ of {entries.length} leads</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          })()}

          {/* SQO & Closed-Won ACV — donuts + time filter + drill-down */}
          {(()=>{
            const sqoPalette=['#c084fc','#60d4f4','#00e5a0','#f59e0b','#e879f9','#fb7185','#34d399','#a78bfa']
            const wonPalette=['#f59e0b','#00e5a0','#60d4f4','#c084fc','#e879f9','#fb7185','#34d399','#a78bfa']

            // Build SQO and Won lead lists with enriched data
            const buildEntries=(leads:AppLead[])=>leads.map(l=>{
              const det=details[l.email]||EMPTY_DETAIL
              const acv=parseAcv(det.acv)
              const displayName=nameOverrides[l.email]||l.account||formatDomain(l.domain)||l.email
              const sqoDate=det.sqoDate||det.sqlDate||det.meetingDate||l.date||''
              const st=statuses[l.email]||'new'
              return {
                email:l.email,account:displayName,acv,sqoDate,
                stage:det.closedWon==='Yes'||st==='closedwon'?'Closed Won':st==='lost'?'Closed Lost':'Active',
                tier:det.accountTier||'',ae:det.ae||'',source:det.sourceChannel||'',
                prospectName:det.prospectName||'',title:det.title||'',
                meetingDate:det.meetingDate||'',sqlDate:det.sqlDate||'',
                connectedDate:det.connectedDate||'',closedWonDate:det.closedWonDate||'',
                outreachChannel:det.outreachChannel||'',multithreading:det.multithreading||'',
                sfLink:det.sfLink||l.sfUrl||'',notes:det.notes||'',nextStep:det.nextStep||'',nextStepStatus:det.nextStepStatus||'',
              }
            }).sort((a,b)=>b.acv-a.acv)

            const sqoLeads=allLeads.filter(l=>(details[l.email]?.sqo||'')==='Yes'&&parseAcv(details[l.email]?.acv)>0)
            const wonLeads=allLeads.filter(l=>((details[l.email]?.closedWon||'')==='Yes'||(statuses[l.email]||'new')==='closedwon')&&parseAcv(details[l.email]?.acv)>0)
            const sqoEntries=buildEntries(sqoLeads)
            const wonEntries=buildEntries(wonLeads)
            const totalSqoAcv=sqoEntries.reduce((s,e)=>s+e.acv,0)
            const totalWonAcv=wonEntries.reduce((s,e)=>s+e.acv,0)

            // Time segmentation for ACV breakdown
            const getSegKey=(dateStr:string):string=>{
              if(!dateStr) return ''; const d=new Date(dateStr); if(isNaN(d.getTime())) return ''
              if(sqoTimeSeg==='year') return String(d.getFullYear())
              if(sqoTimeSeg==='quarter') return `Q${Math.floor(d.getMonth()/3)+1} ${d.getFullYear()}`
              if(sqoTimeSeg==='month') return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
              const ws=new Date(d);ws.setDate(d.getDate()-d.getDay());return ws.toISOString().split('T')[0]
            }
            const getSegLabel=(key:string):string=>{
              if(sqoTimeSeg==='year') return key
              if(sqoTimeSeg==='quarter') return key
              if(sqoTimeSeg==='month'){const [y,m]=key.split('-').map(Number);return new Date(y,m-1).toLocaleString('en-US',{month:'short',year:'2-digit'})}
              return `Wk ${new Date(key).toLocaleDateString('en-US',{month:'short',day:'numeric'})}`
            }
            const segMap=new Map<string,{key:string;label:string;entries:typeof sqoEntries;acv:number}>()
            sqoEntries.forEach(e=>{const k=getSegKey(e.sqoDate);if(!k)return;if(!segMap.has(k))segMap.set(k,{key:k,label:getSegLabel(k),entries:[],acv:0});const g=segMap.get(k)!;g.entries.push(e);g.acv+=e.acv})
            const segGroups=Array.from(segMap.values()).sort((a,b)=>b.key.localeCompare(a.key))
            const maxSegAcv=Math.max(1,...segGroups.map(g=>g.acv))

            // Render expanded account detail card
            const renderDetail=(e:typeof sqoEntries[0])=>{
              const tierColor=e.tier==='A'?C.green:e.tier==='B'?'#60d4f4':e.tier==='E'?C.purpleL:e.tier==='C'?C.red:C.text3
              const stageColor=e.stage==='Closed Won'?C.green:e.stage==='Closed Lost'?C.red:C.purpleL
              return (
                <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${C.border}`}}>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:8}}>
                    <div><div style={{fontSize:9,color:C.text3,textTransform:'uppercase',marginBottom:2}}>Stage</div><div style={{fontSize:11,color:stageColor,fontWeight:600}}>{e.stage}</div></div>
                    <div><div style={{fontSize:9,color:C.text3,textTransform:'uppercase',marginBottom:2}}>Account Tier</div><div style={{fontSize:11,color:tierColor,fontWeight:600}}>{e.tier?`Tier ${e.tier}`:'—'}</div></div>
                    <div><div style={{fontSize:9,color:C.text3,textTransform:'uppercase',marginBottom:2}}>AE / Opp Owner</div><div style={{fontSize:11,color:C.text2}}>{e.ae||'—'}</div></div>
                    <div><div style={{fontSize:9,color:C.text3,textTransform:'uppercase',marginBottom:2}}>Lead Source</div><div style={{fontSize:11,color:C.text2}}>{e.source||'—'}</div></div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:8}}>
                    <div><div style={{fontSize:9,color:C.text3,textTransform:'uppercase',marginBottom:2}}>SQO Date</div><div style={{fontSize:11,color:C.text2}}>{e.sqoDate?new Date(e.sqoDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—'}</div></div>
                    <div><div style={{fontSize:9,color:C.text3,textTransform:'uppercase',marginBottom:2}}>Meeting Date</div><div style={{fontSize:11,color:C.text2}}>{e.meetingDate?new Date(e.meetingDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—'}</div></div>
                    <div><div style={{fontSize:9,color:C.text3,textTransform:'uppercase',marginBottom:2}}>SQL Date</div><div style={{fontSize:11,color:C.text2}}>{e.sqlDate?new Date(e.sqlDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—'}</div></div>
                    <div><div style={{fontSize:9,color:C.text3,textTransform:'uppercase',marginBottom:2}}>Connected Date</div><div style={{fontSize:11,color:C.text2}}>{e.connectedDate?new Date(e.connectedDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—'}</div></div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:8}}>
                    <div><div style={{fontSize:9,color:C.text3,textTransform:'uppercase',marginBottom:2}}>Closed-Won Date</div><div style={{fontSize:11,color:C.text2}}>{e.closedWonDate?new Date(e.closedWonDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—'}</div></div>
                    <div><div style={{fontSize:9,color:C.text3,textTransform:'uppercase',marginBottom:2}}>Prospect</div><div style={{fontSize:11,color:C.text2}}>{e.prospectName||'—'}{e.title&&<span style={{color:C.text3}}> · {e.title}</span>}</div></div>
                    <div><div style={{fontSize:9,color:C.text3,textTransform:'uppercase',marginBottom:2}}>Outreach</div><div style={{fontSize:11,color:C.text2}}>{e.outreachChannel||'—'}</div></div>
                    <div><div style={{fontSize:9,color:C.text3,textTransform:'uppercase',marginBottom:2}}>Next Step</div><div style={{fontSize:11,color:C.text2}}>{e.nextStep||'—'}{e.nextStepStatus&&<span style={{color:C.text3}}> · {e.nextStepStatus}</span>}</div></div>
                  </div>
                  {e.sfLink&&<div style={{marginBottom:6}}><a href={e.sfLink} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:C.green,textDecoration:'none'}}>↗ Open in Salesforce</a></div>}
                  <div><div style={{fontSize:9,color:C.text3,textTransform:'uppercase',marginBottom:3}}>Account Notes</div><div style={{fontSize:11,color:e.notes?C.text2:C.text3,lineHeight:1.5,whiteSpace:'pre-wrap'}}>{e.notes||'No notes'}</div></div>
                </div>
              )
            }

            return (<>
            {/* Time filter */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em'}}>SQO & Closed-Won ACV</div>
              <div style={{display:'flex',gap:5}}>
                {(['year','quarter','month','week'] as const).map(s=>(
                  <button key={s} onClick={()=>setSqoTimeSeg(s)} style={filterPill(sqoTimeSeg===s,'#c084fc')}>{{year:'Year',quarter:'Quarter',month:'Month',week:'Week'}[s]}</button>
                ))}
              </div>
            </div>

            {/* Donut charts side by side */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
              <div style={card}>
                <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:12}}>SQO account ACV mix</div>
                <PieChart
                  data={sqoEntries.slice(0,8).map((e,idx)=>({label:e.account,value:e.acv,color:sqoPalette[idx%sqoPalette.length]}))}
                  onSliceClick={(label)=>setSqoExpandedAcct(p=>p===label?null:label)}
                />
                <div style={{fontSize:11,color:C.text3,marginTop:12}}>Total pipeline ACV: ${totalSqoAcv.toLocaleString()} · click segment to drill down</div>
              </div>
              <div style={card}>
                <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:12}}>Closed-Won revenue mix</div>
                <PieChart
                  data={wonEntries.slice(0,8).map((e,idx)=>({label:e.account,value:e.acv,color:wonPalette[idx%wonPalette.length]}))}
                  onSliceClick={(label)=>setSqoExpandedAcct(p=>p===label?null:label)}
                />
                <div style={{fontSize:11,color:C.text3,marginTop:12}}>Total closed-won ACV: ${totalWonAcv.toLocaleString()}</div>
              </div>
            </div>

            {/* ACV by time period */}
            <div style={{...card,marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:12}}>SQO ACV by {sqoTimeSeg==='year'?'Year':sqoTimeSeg==='quarter'?'Quarter':sqoTimeSeg==='month'?'Month':'Week'}</div>
              <div style={{display:'grid',gap:6,maxHeight:260,overflowY:'auto'}}>
                {segGroups.map(g=>(
                  <div key={g.key}>
                    <div style={{display:'grid',gridTemplateColumns:'90px 1fr 80px 30px',gap:8,alignItems:'center',padding:'5px 0'}}>
                      <div style={{fontSize:11,fontWeight:600,color:C.text2}}>{g.label}</div>
                      <div style={{height:8,borderRadius:4,background:C.surface3,overflow:'hidden'}}><div style={{height:8,borderRadius:4,background:'#c084fc',width:`${g.acv/maxSegAcv*100}%`}}/></div>
                      <div style={{fontSize:11,fontWeight:700,color:C.text,textAlign:'right'}}>${(g.acv/1000).toFixed(0)}K</div>
                      <div style={{fontSize:9,color:C.text3,textAlign:'right'}}>{g.entries.length}</div>
                    </div>
                    <div style={{paddingLeft:16}}>{g.entries.map((e,i)=>(<div key={i} style={{display:'flex',justifyContent:'space-between',padding:'2px 0',borderBottom:i<g.entries.length-1?`1px solid ${C.border}`:'none'}}><span style={{fontSize:10,color:C.text2}}>{e.account}</span><span style={{fontSize:10,fontWeight:600,color:C.text3}}>${e.acv.toLocaleString()}</span></div>))}</div>
                  </div>
                ))}
                {segGroups.length===0&&<div style={{fontSize:11,color:C.text3}}>No SQO data with dates available.</div>}
              </div>
            </div>

            {/* Account detail list — click to expand full detail */}
            <div style={{...card,marginBottom:24}}>
              <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:12}}>
                Account Detail · {sqoEntries.length+wonEntries.filter(w=>!sqoEntries.some(s=>s.email===w.email)).length} accounts
                {sqoExpandedAcct&&<span style={{color:'#c084fc',textTransform:'none',letterSpacing:'normal',fontWeight:400}}> · {sqoExpandedAcct}</span>}
              </div>
              <div style={{display:'grid',gap:4}}>
                {/* Merge SQO + Won (deduped) */}
                {[...sqoEntries,...wonEntries.filter(w=>!sqoEntries.some(s=>s.email===w.email))]
                  .filter(e=>!sqoExpandedAcct||e.account===sqoExpandedAcct)
                  .map((e,i)=>{
                    const isExp=sqoExpandedAcct===e.account
                    const tierColor=e.tier==='A'?C.green:e.tier==='B'?'#60d4f4':e.tier==='E'?C.purpleL:e.tier==='C'?C.red:C.text3
                    const stageColor=e.stage==='Closed Won'?C.green:e.stage==='Closed Lost'?C.red:C.purpleL
                    return (
                      <div key={i} onClick={()=>setSqoExpandedAcct(p=>p===e.account?null:e.account)}
                        style={{padding:'10px 12px',background:isExp?'rgba(192,132,252,0.08)':C.surface3,border:`1px solid ${isExp?'rgba(192,132,252,0.3)':C.border}`,borderRadius:8,cursor:'pointer',transition:'all 0.15s'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <span style={{fontSize:12,fontWeight:700,color:C.text}}>{e.account}</span>
                            <span style={{fontSize:9,fontWeight:700,color:stageColor,background:`${stageColor}18`,padding:'1px 5px',borderRadius:3}}>{e.stage}</span>
                            {e.tier&&<span style={{fontSize:9,fontWeight:700,color:tierColor,background:`${tierColor}18`,padding:'1px 5px',borderRadius:3}}>Tier {e.tier}</span>}
                          </div>
                          <div style={{display:'flex',alignItems:'center',gap:10}}>
                            <span style={{fontSize:14,fontWeight:800,color:'#c084fc'}}>${e.acv.toLocaleString()}</span>
                            <span style={{fontSize:10,color:C.text3}}>{isExp?'▲':'▼'}</span>
                          </div>
                        </div>
                        <div style={{fontSize:10,color:C.text3,marginTop:3}}>
                          SQO: {e.sqoDate?new Date(e.sqoDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—'}
                          {e.ae&&` · AE: ${e.ae}`}{e.source&&` · ${e.source}`}
                        </div>
                        {isExp&&renderDetail(e)}
                      </div>
                    )
                  })}
                {sqoExpandedAcct&&<button onClick={()=>setSqoExpandedAcct(null)} style={{fontSize:10,fontWeight:600,color:C.text3,background:'none',border:`1px solid ${C.border2}`,borderRadius:6,padding:'6px 12px',cursor:'pointer',marginTop:4}}>Clear filter · show all</button>}
              </div>
            </div>
            </>)
          })()}

          {/* MQL Quality chart — from Notion manual tracker (Mar 21 – Apr 1) */}
          <div style={{...card,marginBottom:24}}>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:6,flexWrap:'wrap',gap:8}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em'}}>MQL Quality · daily breakdown</div>
                <div style={{fontSize:11,color:C.text3,marginTop:3}}>From your manual Notion tracker · Mar 21 – Apr 1 · <span style={{color:C.amber}}>HQ = squarely ICP</span> · <span style={{color:'#60a5fa'}}>LQ = partial ICP</span> · <span style={{color:C.red}}>DQ = disqualified</span></div>
              </div>
              <div style={{display:'flex',gap:12,alignItems:'center'}}>
                {[{label:'HQ MQL',color:C.amber},{label:'LQ MQL',color:'#fb923c'},{label:'DQ / untagged',color:C.red}].map(l=>(
                  <div key={l.label} style={{display:'flex',alignItems:'center',gap:5}}>
                    <span style={{width:8,height:8,borderRadius:2,background:l.color,flexShrink:0}}/>
                    <span style={{fontSize:10,color:C.text3}}>{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <MQLQualityChart allLeads={allLeads} statuses={statuses} details={details}/>
          </div>

          {/* DQ / Nurture / Lost breakdown — clickable */}
          <div style={card}>
            <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:16}}>
              Leads needing attention · <span style={{fontWeight:400,textTransform:'none',letterSpacing:'normal'}}>click to open</span>
            </div>
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
                    {leads.slice(0,6).map(l=>{
                      const det=details[l.email]
                      const sfLink=l.sfUrl||det?.sfLink
                      const displayName=l.account||det?.prospectName||formatDomain(l.domain)
                      return (
                        <div key={l.email} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'5px 0',borderBottom:`1px solid ${C.border}`,gap:6}}>
                          <div style={{display:'flex',flexDirection:'column',minWidth:0}}>
                            <span style={{fontSize:11,color:C.text2,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{displayName}</span>
                            {det?.ae&&<span style={{fontSize:10,color:C.text3}}>{det.ae}</span>}
                          </div>
                          <div style={{display:'flex',gap:5,flexShrink:0}}>
                            {sfLink&&(
                              <a href={sfLink} target="_blank" rel="noopener noreferrer"
                                 style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:999,border:`1px solid ${C.green}`,background:'rgba(0,229,160,0.1)',color:C.green,textDecoration:'none',whiteSpace:'nowrap'}}>
                                ↗ SF
                              </a>
                            )}
                            <button onClick={()=>{setView('pipeline');setExpanded(l.email);setStFilter(s)}}
                                    style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:999,border:`1px solid ${cfg.border}`,background:cfg.dim,color:cfg.color,cursor:'pointer',whiteSpace:'nowrap'}}>
                              View
                            </button>
                          </div>
                        </div>
                      )
                    })}
                    {leads.length>6&&<div style={{fontSize:10,color:C.text3,marginTop:6}}>+{leads.length-6} more · <button onClick={()=>{setView('pipeline');setStFilter(s)}} style={{fontSize:10,color:cfg.color,background:'none',border:'none',cursor:'pointer',padding:0}}>view all</button></div>}
                  </div>
                )
              })}
            </div>
          </div>

        </>)}


        {/* ══════════════════════════════════════════════════════
            REPORTING VIEW
        ══════════════════════════════════════════════════════ */}
        {view==='reporting'&&(<>
          <div style={{marginBottom:28}}>
            <div style={{fontSize:26,fontWeight:800,letterSpacing:'-0.02em',lineHeight:1.15}}>Reporting<br/><span style={{color:C.green}}>Generator.</span></div>
            <div style={{fontSize:12,color:C.text3,marginTop:4}}>Structured report generation · leadership-ready summaries</div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
            <div style={card}>
              <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>SQO Count</div>
              <div style={{fontSize:24,fontWeight:800,color:'#c084fc'}}>{sqoAllTime}</div>
              <div style={{fontSize:11,color:C.text3,marginTop:5}}>all reps in scope</div>
            </div>
            <div style={card}>
              <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>Pipeline ACV</div>
              <div style={{fontSize:24,fontWeight:800,color:C.amber}}>${allLeads.reduce((s,l)=>{const d=details[l.email]; return s+((d?.sqo==='Yes'&&d?.acv)?parseAcv(d.acv):0)},0).toLocaleString()}</div>
              <div style={{fontSize:11,color:C.text3,marginTop:5}}>SQO accounts only</div>
            </div>
            <div style={card}>
              <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>Closed-Won Count</div>
              <div style={{fontSize:24,fontWeight:800,color:'#f59e0b'}}>{allLeads.filter(l=>(details[l.email]?.closedWon||'')==='Yes'||(statuses[l.email]||'new')==='closedwon').length}</div>
              <div style={{fontSize:11,color:C.text3,marginTop:5}}>won accounts</div>
            </div>
            <div style={card}>
              <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>Closed-Won ACV</div>
              <div style={{fontSize:24,fontWeight:800,color:'#f59e0b'}}>${allLeads.reduce((s,l)=>{const d=details[l.email]; return s+(((d?.closedWon==='Yes'||(statuses[l.email]||'new')==='closedwon')&&d?.acv)?parseAcv(d.acv):0)},0).toLocaleString()}</div>
              <div style={{fontSize:11,color:C.text3,marginTop:5}}>won revenue</div>
            </div>
          </div>

          <div style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:16,padding:16,marginBottom:20}}>
            <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:14}}>
              Report Generator
            </div>

            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:C.text2,marginBottom:6}}>Timeframe</div>
                <select
                  value={reportTimeframe}
                  onChange={e=>setReportTimeframe(e.target.value as ReportTimeframe)}
                  style={{width:'100%',fontSize:12,padding:'10px 12px',border:`1px solid ${C.border2}`,borderRadius:8,background:C.surface3,color:C.text}}
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                  <option value="custom">Custom range</option>
                </select>
              </div>

              <div>
                <div style={{fontSize:12,fontWeight:600,color:C.text2,marginBottom:6}}>Scope</div>
                <select
                  value={reportScope}
                  onChange={e=>setReportScope(e.target.value as ReportScope)}
                  style={{width:'100%',fontSize:12,padding:'10px 12px',border:`1px solid ${C.border2}`,borderRadius:8,background:C.surface3,color:C.text}}
                >
                  <option value="all_bdrs">All BDRs</option>
                  <option value="individual_bdr">Individual BDR</option>
                </select>

                {reportScope==='individual_bdr' && (
                  <select
                    value={reportBdrId}
                    onChange={e=>setReportBdrId(e.target.value)}
                    style={{width:'100%',marginTop:8,fontSize:12,padding:'10px 12px',border:`1px solid ${C.border2}`,borderRadius:8,background:C.surface3,color:C.text}}
                  >
                    <option value="">Select BDR</option>
                    {reps.map(r=>(
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <div style={{fontSize:12,fontWeight:600,color:C.text2,marginBottom:6}}>Report Type</div>
                <select
                  value={reportType}
                  onChange={e=>setReportType(e.target.value as ReportType)}
                  style={{width:'100%',fontSize:12,padding:'10px 12px',border:`1px solid ${C.border2}`,borderRadius:8,background:C.surface3,color:C.text}}
                >
                  <option value="full_funnel">Full Funnel Summary</option>
                  <option value="pipeline_performance">Pipeline Performance</option>
                  <option value="mql_quality">MQL Quality</option>
                  <option value="conversion_analysis">Conversion Analysis</option>
                </select>
              </div>
            </div>

            {reportTimeframe==='custom'&&(
              <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:12,marginTop:12}}>
                <div>
                  <div style={{fontSize:12,fontWeight:600,color:C.text2,marginBottom:6}}>Start date</div>
                  <input
                    type="date"
                    value={reportRangeStart}
                    onChange={e=>setReportRangeStart(e.target.value)}
                    style={{width:'100%',fontSize:12,padding:'10px 12px',border:`1px solid ${C.border2}`,borderRadius:8,background:C.surface3,color:C.text}}
                  />
                </div>
                <div>
                  <div style={{fontSize:12,fontWeight:600,color:C.text2,marginBottom:6}}>End date</div>
                  <input
                    type="date"
                    value={reportRangeEnd}
                    onChange={e=>setReportRangeEnd(e.target.value)}
                    style={{width:'100%',fontSize:12,padding:'10px 12px',border:`1px solid ${C.border2}`,borderRadius:8,background:C.surface3,color:C.text}}
                  />
                </div>
              </div>
            )}

            <div style={{marginTop:14,display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
              <button
                onClick={()=>{
                  setReportGenerated(true)
                  const w=window.open('','_blank')
                  if(!w)return
                  const rc=reportStatusCounts
                  const ratioRows=reportRatioCards.map(c=>`<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${c.label}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:700;text-align:right">${c.value}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:12px">${c.sub}</td></tr>`).join('')
                  const statusRows=[['New',rc.new],['Contacted',rc.contacted],['In Progress',rc.inprogress],['Booked',rc.booked],['Nurture',rc.nurture],['Lost',rc.lost],['DQ',rc.dq],['N/A',rc.na],['Closed-Won',rc.closedwon]].map(([s,n])=>`<tr><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">${s}</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-weight:700;text-align:right">${n}</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;text-align:right">${reportTotal?Math.round(Number(n)/reportTotal*100):0}%</td></tr>`).join('')
                  // Status volume lead lists
                  const statusLeadRows=(status:string,leads:AppLead[])=>leads.length===0?'':`<table style="margin:8px 0 16px;font-size:11px"><thead><tr><th>Account</th><th>Date</th></tr></thead><tbody>${leads.map(l=>`<tr><td style="padding:4px 12px;border-bottom:1px solid #f1f5f9">${nameOverrides[l.email]||l.account||formatDomain(l.domain)||l.email}</td><td style="padding:4px 12px;border-bottom:1px solid #f1f5f9;color:#64748b">${(l.date||l.receivedAt||'').slice(0,10)}</td></tr>`).join('')}</tbody></table>`
                  const statusDetail=[['New','new'],['Contacted','contacted'],['In Progress','inprogress'],['Booked','booked'],['Nurture','nurture'],['Lost','lost'],['DQ','dq'],['N/A','na'],['Closed-Won','closedwon']].map(([label,key])=>{
                    const leads=reportBaseLeads.filter(l=>(statuses[l.email]||'new')===key)
                    return leads.length>0?`<details><summary style="cursor:pointer;padding:4px 0;font-weight:600">${label} (${leads.length})</summary>${statusLeadRows(key,leads)}</details>`:''
                  }).join('')
                  // Source quality rows
                  const sourceRows=reportSourceRows.map(r=>`<tr><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">${r.source}</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700">${r.mqls}</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right">${r.sqlRate}%</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right">${r.sqoRate}%</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right">$${r.pipeline.toLocaleString()}</td></tr>`).join('')
                  // Source detail with leads
                  const sourceDetail=reportSourceRows.map(r=>{
                    const leads=reportBaseLeads.filter(l=>(details[l.email]?.sourceChannel||l.source||'unknown')===r.source)
                    return `<details><summary style="cursor:pointer;padding:4px 0;font-weight:600">${r.source} (${r.mqls} MQLs · ${r.sqlRate}% SQL · ${r.sqoRate}% SQO)</summary><table style="margin:8px 0 8px;font-size:11px"><thead><tr><th>Account</th><th>Stage</th><th>Date</th></tr></thead><tbody>${leads.map(l=>{const det=details[l.email];const stage=(det?.sqo||'')==='Yes'?'SQO':(det?.sqlDq||'')==='Yes'?'SQL':'MQL';return `<tr><td style="padding:4px 12px;border-bottom:1px solid #f1f5f9">${nameOverrides[l.email]||l.account||formatDomain(l.domain)||l.email}</td><td style="padding:4px 12px;border-bottom:1px solid #f1f5f9;font-weight:600;color:${stage==='SQO'?'#7c3aed':stage==='SQL'?'#0284c7':'#64748b'}">${stage}</td><td style="padding:4px 12px;border-bottom:1px solid #f1f5f9;color:#64748b">${(l.date||l.receivedAt||'').slice(0,10)}</td></tr>`}).join('')}</tbody></table></details>`
                  }).join('')
                  // BDR performance rows
                  const bdrRows=reportBdrRows.filter(r=>r.mqls>0).map(r=>`<tr><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">${r.name}</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700">${r.mqls}</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right">${r.sqls}</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right">${r.sqos}</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right">$${r.pipeline.toLocaleString()}</td></tr>`).join('')
                  // Velocity lead lists
                  const vel=velocityData
                  const velLeadHtml=(label:string,leads:{name:string;days:number}[])=>leads.length===0?'':`<details style="margin-bottom:12px"><summary style="cursor:pointer;padding:4px 0;font-weight:600">${label} — ${leads.length} leads (avg ${Math.round(leads.reduce((s,l)=>s+l.days,0)/leads.length)}d)</summary><table style="margin:8px 0;font-size:11px"><thead><tr><th>Account</th><th style="text-align:right">Days</th></tr></thead><tbody>${leads.sort((a,b)=>a.days-b.days).map(l=>`<tr><td style="padding:4px 12px;border-bottom:1px solid #f1f5f9">${l.name}</td><td style="padding:4px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700">${l.days}d</td></tr>`).join('')}</tbody></table></details>`
                  const velLeadsData:{mqlSql:{name:string;days:number}[];sqlSqo:{name:string;days:number}[];sqoWon:{name:string;days:number}[];mqlWon:{name:string;days:number}[]}={mqlSql:[],sqlSqo:[],sqoWon:[],mqlWon:[]}
                  reportBaseLeads.forEach(l=>{
                    const d=details[l.email];const r2=new Date(l.receivedAt||l.date||Date.now())
                    const nm=nameOverrides[l.email]||l.account||formatDomain(l.domain)||l.email
                    const isWon=(d?.closedWon==='Yes'||(statuses[l.email]||'new')==='closedwon')
                    if((d?.sqlDq||'').toLowerCase()==='yes'&&d?.sqlDate){const dy=Math.round((new Date(d.sqlDate).getTime()-r2.getTime())/864e5);if(dy>=0&&dy<730)velLeadsData.mqlSql.push({name:nm,days:dy})}
                    if((d?.sqo||'').toLowerCase()==='yes'&&d?.sqlDate&&d?.sqoDate){const dy=Math.round((new Date(d.sqoDate).getTime()-new Date(d.sqlDate).getTime())/864e5);if(dy>=0&&dy<730)velLeadsData.sqlSqo.push({name:nm,days:dy})}
                    if(isWon&&d?.sqoDate&&d?.closedWonDate){const dy=Math.round((new Date(d.closedWonDate).getTime()-new Date(d.sqoDate).getTime())/864e5);if(dy>=0&&dy<730)velLeadsData.sqoWon.push({name:nm,days:dy})}
                    if(isWon&&d?.closedWonDate){const dy=Math.round((new Date(d.closedWonDate).getTime()-r2.getTime())/864e5);if(dy>=0&&dy<730)velLeadsData.mqlWon.push({name:nm,days:dy})}
                  })
                  const now=new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})
                  const dateRange=`${reportStart.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})} — ${reportEnd.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`
                  w.document.write(`<!DOCTYPE html><html><head><title>QA Wolf BDR Report</title><style>
                    *{margin:0;padding:0;box-sizing:border-box}
                    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b;padding:40px 48px;max-width:900px;margin:0 auto;line-height:1.5}
                    h1{font-size:28px;font-weight:800;margin-bottom:4px}
                    h2{font-size:16px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#475569;margin:28px 0 12px;padding-bottom:6px;border-bottom:2px solid #e2e8f0}
                    .subtitle{font-size:13px;color:#64748b;margin-bottom:4px}
                    .daterange{font-size:12px;color:#94a3b8;margin-bottom:24px}
                    .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
                    .grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:24px}
                    .card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px}
                    .card .label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:6px}
                    .card .val{font-size:22px;font-weight:800}
                    .card .sub{font-size:11px;color:#94a3b8;margin-top:3px}
                    table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px}
                    th{padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;border-bottom:2px solid #cbd5e1}
                    .summary{font-size:14px;line-height:1.7;color:#334155;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:24px}
                    details{margin-bottom:4px} summary{font-size:13px;color:#334155}
                    @media print{body{padding:20px 24px}h1{font-size:22px}.card .val{font-size:18px}details[open]{break-inside:avoid}}
                  </style></head><body>
                    <h1>QA Wolf — BDR Report</h1>
                    <div class="subtitle">${reportLabel} · ${reportScope==='all_bdrs'?'All BDRs':currentRep?.name||'Jonathan Kim'} · Generated ${now}</div>
                    <div class="daterange">${dateRange} · ${reportTotal} leads in range</div>
                    <div class="summary">${reportSummaryText}</div>
                    <h2>Executive Summary</h2>
                    <div class="grid4">
                      <div class="card"><div class="label">Total Leads</div><div class="val">${reportTotal}</div></div>
                      <div class="card"><div class="label">SQLs</div><div class="val">${reportSqlCount}</div><div class="sub">${pct(reportSqlCount,reportTotal)}% conversion</div></div>
                      <div class="card"><div class="label">SQOs</div><div class="val">${reportSqoCount}</div><div class="sub">${pct(reportSqoCount,reportTotal)}% conversion</div></div>
                      <div class="card"><div class="label">Pipeline</div><div class="val">$${reportPipeline.toLocaleString()}</div></div>
                    </div>
                    <h2>Status Volume Summary</h2>
                    <table><thead><tr><th>Status</th><th style="text-align:right">Count</th><th style="text-align:right">%</th></tr></thead><tbody>${statusRows}</tbody></table>
                    ${statusDetail}
                    <h2>Key Ratios</h2>
                    <table><thead><tr><th>Metric</th><th style="text-align:right">Value</th><th>Detail</th></tr></thead><tbody>${ratioRows}</tbody></table>
                    <h2>Source Quality Breakdown</h2>
                    <table><thead><tr><th>Source</th><th style="text-align:right">MQLs</th><th style="text-align:right">SQL %</th><th style="text-align:right">SQO %</th><th style="text-align:right">Pipeline</th></tr></thead><tbody>${sourceRows}</tbody></table>
                    ${sourceDetail}
                    <h2>BDR Performance</h2>
                    <table><thead><tr><th>BDR</th><th style="text-align:right">MQLs</th><th style="text-align:right">SQLs</th><th style="text-align:right">SQOs</th><th style="text-align:right">Pipeline</th></tr></thead><tbody>${bdrRows}</tbody></table>
                    <h2>Velocity Summary</h2>
                    <div class="grid4">
                      <div class="card"><div class="label">Avg MQL → SQL</div><div class="val">${vel.mqlSql.avg!==null?vel.mqlSql.avg+'d':'N/A'}</div><div class="sub">${vel.mqlSql.n} leads</div></div>
                      <div class="card"><div class="label">Avg SQL → SQO</div><div class="val">${vel.sqlSqo.avg!==null?vel.sqlSqo.avg+'d':'N/A'}</div><div class="sub">${vel.sqlSqo.n} leads</div></div>
                      <div class="card"><div class="label">Avg SQO → Won</div><div class="val">${vel.sqoWon.avg!==null?vel.sqoWon.avg+'d':'N/A'}</div><div class="sub">${vel.sqoWon.n} leads</div></div>
                      <div class="card"><div class="label">Avg MQL → Won</div><div class="val">${vel.mqlWon.avg!==null?vel.mqlWon.avg+'d':'N/A'}</div><div class="sub">${vel.mqlWon.n} leads</div></div>
                    </div>
                    ${velLeadHtml('MQL → SQL',velLeadsData.mqlSql)}
                    ${velLeadHtml('SQL → SQO',velLeadsData.sqlSqo)}
                    ${velLeadHtml('SQO → Won',velLeadsData.sqoWon)}
                    ${velLeadHtml('MQL → Won',velLeadsData.mqlWon)}
                    <h2>Funnel Insights</h2>
                    <div class="grid2">
                      <div class="card"><div class="label">Biggest Drop-off</div><div class="val" style="font-size:16px">${biggestDropoff.label}</div><div class="sub">${biggestDropoff.value}% conversion</div></div>
                      <div class="card"><div class="label">Strongest Stage</div><div class="val" style="font-size:16px">${strongestStage.label}</div><div class="sub">${strongestStage.value}% conversion</div></div>
                      <div class="card"><div class="label">Most Common Terminal</div><div class="val" style="font-size:16px">${mostCommonTerminal.label}</div><div class="sub">${mostCommonTerminal.value} leads</div></div>
                      <div class="card"><div class="label">Most Recoverable Pool</div><div class="val" style="font-size:16px">${mostRecoverablePool.label}</div><div class="sub">${mostRecoverablePool.value} leads</div></div>
                    </div>
                  </body></html>`)
                  w.document.close()
                  setTimeout(()=>w.print(),500)
                }}
                style={{fontSize:12,fontWeight:700,padding:'10px 14px',border:'none',borderRadius:10,background:C.green,color:'#06281d',cursor:'pointer'}}
              >
                Generate Report
              </button>

              <button
                onClick={copyReportSummary}
                style={{fontSize:12,fontWeight:700,padding:'10px 14px',border:`1px solid ${C.border2}`,borderRadius:10,background:C.surface3,color:C.text,cursor:'pointer'}}
              >
                Copy Summary
              </button>

              <button
                onClick={downloadReportTxt}
                style={{fontSize:12,fontWeight:700,padding:'10px 14px',border:`1px solid ${C.border2}`,borderRadius:10,background:C.surface3,color:C.text,cursor:'pointer'}}
              >
                Download TXT
              </button>

              <button
                onClick={downloadReportJson}
                style={{fontSize:12,fontWeight:700,padding:'10px 14px',border:`1px solid ${C.border2}`,borderRadius:10,background:C.surface3,color:C.text,cursor:'pointer'}}
              >
                Download JSON
              </button>
            </div>
          </div>

          <div style={{display:'grid',gap:16}}>
            <div style={card}>
              <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:12}}>
                Executive Summary
              </div>

              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:14}}>
                {[
                  {label:'Total Leads', value:reportTotal, sub:'report scope'},
                  {label:'SQLs', value:reportSqlCount, sub:`${pct(reportSqlCount, reportTotal)}% conversion`},
                  {label:'SQOs', value:reportSqoCount, sub:`${pct(reportSqoCount, reportSqlCount || reportTotal)}% conversion`},
                  {label:'Pipeline', value:`$${reportPipeline.toLocaleString()}`, sub:'from ACV fields'},
                ].map(s=>(
                  <div key={s.label} style={{background:C.surface3,border:`1px solid ${C.border}`,borderRadius:10,padding:12}}>
                    <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>{s.label}</div>
                    <div style={{fontSize:22,fontWeight:800,color:C.text,letterSpacing:'-0.03em'}}>{s.value}</div>
                    <div style={{fontSize:11,color:C.text3,marginTop:4}}>{s.sub}</div>
                  </div>
                ))}
              </div>

              <div style={{fontSize:11,color:C.text3,marginBottom:8,padding:'6px 10px',background:C.surface3,borderRadius:6,display:'inline-block'}}>
                {reportStart.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})} → {reportEnd.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})} · {reportBaseLeads.length} leads in range
              </div>
              <div style={{fontSize:14,color:C.text2,lineHeight:1.65}}>
                {reportGenerated
                  ? reportSummaryText
                  : 'Choose a timeframe, scope, and report type, then click Generate Report to create a structured leadership-style report.'}
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1.1fr .9fr',gap:16}}>
              <div style={card}>
                <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:12}}>
                  Status Volume Summary
                </div>
                <div style={{display:'grid',gap:8}}>
                  {([
                    ['New', reportStatusCounts.new, 'new'] as const,
                    ['Contacted', reportStatusCounts.contacted, 'contacted'] as const,
                    ['In Progress', reportStatusCounts.inprogress, 'inprogress'] as const,
                    ['Booked', reportStatusCounts.booked, 'booked'] as const,
                    ['Nurture', reportStatusCounts.nurture, 'nurture'] as const,
                    ['Lost', reportStatusCounts.lost, 'lost'] as const,
                    ['DQ', reportStatusCounts.dq, 'dq'] as const,
                    ['NA', reportStatusCounts.na, 'na'] as const,
                    ['SQL', reportSqlCount, '_sql'] as const,
                    ['SQO', reportSqoCount, '_sqo'] as const,
                  ]).map(([label,count,key])=>{
                    const isExp=reportExpandedStatus===key
                    const leads=key==='_sql'?reportBaseLeads.filter(l=>(details[l.email]?.sqlDq||'')==='Yes')
                      :key==='_sqo'?reportBaseLeads.filter(l=>(details[l.email]?.sqo||'')==='Yes')
                      :reportBaseLeads.filter(l=>(statuses[l.email]||'new')===key)
                    return (
                    <div key={String(label)}>
                      <div onClick={()=>setReportExpandedStatus(isExp?null:key)} style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:10,alignItems:'center',padding:'9px 10px',background:isExp?C.surface2:C.surface3,border:`1px solid ${isExp?C.amber+'60':C.border}`,borderRadius:isExp?'10px 10px 0 0':10,cursor:'pointer'}}>
                        <div style={{fontSize:13,color:isExp?C.amber:C.text2}}>{isExp?'▼ ':''}{label}</div>
                        <div style={{fontSize:13,fontWeight:700,color:C.text}}>{count}</div>
                        <div style={{fontSize:11,color:C.text3,width:54,textAlign:'right'}}>{pct(count, reportTotal)}%</div>
                      </div>
                      {isExp&&leads.length>0&&(
                        <div style={{background:C.surface2,border:`1px solid ${C.amber}60`,borderTop:'none',borderRadius:'0 0 10px 10px',padding:'6px 10px',maxHeight:180,overflowY:'auto'}}>
                          {leads.map(l=><div key={l.email} style={{fontSize:10,padding:'3px 0',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',color:C.text2}}>
                            <span>{nameOverrides[l.email]||l.account||formatDomain(l.domain)||l.email}</span>
                            <span style={{color:C.text3}}>{(l.date||l.receivedAt||'').slice(0,10)}</span>
                          </div>)}
                        </div>
                      )}
                    </div>)
                  })}
                </div>
              </div>

              <div style={card}>
                <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:12}}>
                  Key Ratios
                </div>
                <div style={{display:'grid',gap:8}}>
                  {reportRatioCards.map(card=>(
                    <div key={card.label} style={{padding:'10px 12px',background:C.surface3,border:`1px solid ${C.border}`,borderRadius:10}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}>
                        <div style={{fontSize:13,color:C.text2}}>{card.label}</div>
                        <div style={{fontSize:16,fontWeight:800,color:C.text}}>{card.value}</div>
                      </div>
                      <div style={{fontSize:11,color:C.text3,marginTop:4}}>{card.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
              <div style={card}>
                <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:12}}>
                  Source Quality Breakdown
                </div>
                <div style={{display:'grid',gap:8}}>
                  <div style={{display:'grid',gridTemplateColumns:'1.5fr .7fr .7fr .7fr .9fr',gap:10,fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',padding:'0 4px'}}>
                    <div>Source</div><div>MQLs</div><div>SQL %</div><div>SQO %</div><div>Pipeline</div>
                  </div>
                  {reportSourceRows.length===0&&<div style={{padding:'12px',fontSize:11,color:C.text3,textAlign:'center'}}>No source data for this timeframe</div>}
                  {reportSourceRows.map(row=>{
                    const isExp=reportExpandedSource===row.source
                    const leads=reportBaseLeads.filter(l=>(details[l.email]?.sourceChannel||l.source||'unknown')===row.source)
                    return (
                    <div key={row.source}>
                      <div onClick={()=>setReportExpandedSource(isExp?null:row.source)} style={{display:'grid',gridTemplateColumns:'1.5fr .7fr .7fr .7fr .9fr',gap:10,alignItems:'center',padding:'9px 10px',background:isExp?C.surface2:C.surface3,border:`1px solid ${isExp?C.amber+'60':C.border}`,borderRadius:isExp?'10px 10px 0 0':10,cursor:'pointer'}}>
                        <div style={{fontSize:12,color:isExp?C.amber:C.text2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{isExp?'▼ ':''}{row.source}</div>
                        <div style={{fontSize:12,fontWeight:700,color:C.text}}>{row.mqls}</div>
                        <div style={{fontSize:12,color:C.text2}}>{row.sqlRate}%</div>
                        <div style={{fontSize:12,color:C.text2}}>{row.sqoRate}%</div>
                        <div style={{fontSize:12,color:C.text2}}>${row.pipeline.toLocaleString()}</div>
                      </div>
                      {isExp&&leads.length>0&&(
                        <div style={{background:C.surface2,border:`1px solid ${C.amber}60`,borderTop:'none',borderRadius:'0 0 10px 10px',padding:'6px 10px',maxHeight:180,overflowY:'auto'}}>
                          {leads.map(l=>{const det=details[l.email];return <div key={l.email} style={{fontSize:10,padding:'3px 0',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',color:C.text2}}>
                            <span>{nameOverrides[l.email]||l.account||formatDomain(l.domain)||l.email}</span>
                            <span style={{display:'flex',gap:8}}>
                              {(det?.sqlDq||'')==='Yes'&&<span style={{color:'#60d4f4',fontSize:8,fontWeight:700}}>SQL</span>}
                              {(det?.sqo||'')==='Yes'&&<span style={{color:'#c084fc',fontSize:8,fontWeight:700}}>SQO</span>}
                              <span style={{color:C.text3}}>{(l.date||l.receivedAt||'').slice(0,10)}</span>
                            </span>
                          </div>})}
                        </div>
                      )}
                    </div>)
                  })}
                </div>
              </div>

              <div style={card}>
                <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:12}}>
                  BDR Performance Breakdown
                </div>
                <div style={{display:'grid',gap:8}}>
                  <div style={{display:'grid',gridTemplateColumns:'1.2fr .7fr .7fr .7fr .9fr',gap:10,fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',padding:'0 4px'}}>
                    <div>BDR</div><div>MQLs</div><div>SQLs</div><div>SQOs</div><div>Pipeline</div>
                  </div>
                  {reportBdrRows.map(row=>(
                    <div key={row.name} style={{display:'grid',gridTemplateColumns:'1.2fr .7fr .7fr .7fr .9fr',gap:10,alignItems:'center',padding:'9px 10px',background:C.surface3,border:`1px solid ${C.border}`,borderRadius:10}}>
                      <div style={{fontSize:12,color:C.text2}}>{row.name}</div>
                      <div style={{fontSize:12,fontWeight:700,color:C.text}}>{row.mqls}</div>
                      <div style={{fontSize:12,color:C.text2}}>{row.sqls}</div>
                      <div style={{fontSize:12,color:C.text2}}>{row.sqos}</div>
                      <div style={{fontSize:12,color:C.text2}}>${row.pipeline.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
              <div style={card}>
                <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:12}}>
                  Velocity Summary
                </div>
                {(()=>{
                  // Build velocity lead lists for drill-down
                  const velLeads={mqlSql:[] as {name:string;days:number}[],sqlSqo:[] as {name:string;days:number}[],sqoWon:[] as {name:string;days:number}[],mqlWon:[] as {name:string;days:number}[]}
                  reportBaseLeads.forEach(l=>{
                    const d=details[l.email];const r=new Date(l.receivedAt||l.date||Date.now())
                    const nm=nameOverrides[l.email]||l.account||formatDomain(l.domain)||l.email
                    const isWon=(d?.closedWon==='Yes'||(statuses[l.email]||'new')==='closedwon')
                    if((d?.sqlDq||'').toLowerCase()==='yes'&&d?.sqlDate){const dy=Math.round((new Date(d.sqlDate).getTime()-r.getTime())/864e5);if(dy>=0&&dy<730)velLeads.mqlSql.push({name:nm,days:dy})}
                    if((d?.sqo||'').toLowerCase()==='yes'&&d?.sqlDate&&d?.sqoDate){const dy=Math.round((new Date(d.sqoDate).getTime()-new Date(d.sqlDate).getTime())/864e5);if(dy>=0&&dy<730)velLeads.sqlSqo.push({name:nm,days:dy})}
                    if(isWon&&d?.sqoDate&&d?.closedWonDate){const dy=Math.round((new Date(d.closedWonDate).getTime()-new Date(d.sqoDate).getTime())/864e5);if(dy>=0&&dy<730)velLeads.sqoWon.push({name:nm,days:dy})}
                    if(isWon&&d?.closedWonDate){const dy=Math.round((new Date(d.closedWonDate).getTime()-r.getTime())/864e5);if(dy>=0&&dy<730)velLeads.mqlWon.push({name:nm,days:dy})}
                  })
                  return (
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
                    {([
                      {label:'Avg Days MQL → SQL',value:velocityData.mqlSql.avg,n:velocityData.mqlSql.n,key:'mqlSql',leads:velLeads.mqlSql},
                      {label:'Avg Days SQL → SQO',value:velocityData.sqlSqo.avg,n:velocityData.sqlSqo.n,key:'sqlSqo',leads:velLeads.sqlSqo},
                      {label:'Avg Days SQO → Won',value:velocityData.sqoWon.avg,n:velocityData.sqoWon.n,key:'sqoWon',leads:velLeads.sqoWon},
                      {label:'Avg Days MQL → Won',value:velocityData.mqlWon.avg,n:velocityData.mqlWon.n,key:'mqlWon',leads:velLeads.mqlWon},
                    ]).map(c=>{
                      const isExp=reportExpandedVelocity===c.key
                      return (
                      <div key={c.label} onClick={()=>setReportExpandedVelocity(isExp?null:c.key)} style={{background:isExp?C.surface2:C.surface3,border:`1px solid ${isExp?C.amber+'60':C.border}`,borderRadius:10,padding:12,cursor:'pointer'}}>
                        <div style={{fontSize:10,fontWeight:700,color:isExp?C.amber:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>{isExp?'▼ ':''}{c.label}</div>
                        <div style={{fontSize:18,fontWeight:800,color:c.value!==null?C.green:C.text3}}>{c.value!==null?`${c.value}d`:'N/A'}</div>
                        <div style={{fontSize:11,color:C.text3,marginTop:4}}>{c.n} lead{c.n!==1?'s':''} measured</div>
                        {isExp&&c.leads.length>0&&(
                          <div style={{marginTop:8,maxHeight:140,overflowY:'auto',borderTop:`1px solid ${C.border}`,paddingTop:6}}>
                            {c.leads.sort((a,b)=>a.days-b.days).map((v,i)=>(
                              <div key={i} style={{fontSize:9,padding:'2px 0',display:'flex',justifyContent:'space-between',color:C.text2,borderBottom:`1px solid ${C.border}`}}>
                                <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'70%'}}>{v.name}</span>
                                <span style={{fontWeight:700,color:C.green,flexShrink:0}}>{v.days}d</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>)
                    })}
                  </div>)
                })()}
              </div>

              <div style={card}>
                <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:12}}>
                  Funnel Insights
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:12}}>
                  {[
                    {label:'Biggest drop-off', value:biggestDropoff.label, sub:`${biggestDropoff.value}% conversion`},
                    {label:'Strongest stage', value:strongestStage.label, sub:`${strongestStage.value}% conversion`},
                    {label:'Most common terminal', value:mostCommonTerminal.label, sub:`${mostCommonTerminal.value} leads`},
                    {label:'Most recoverable pool', value:mostRecoverablePool.label, sub:`${mostRecoverablePool.value} leads`},
                  ].map(card=>(
                    <div key={card.label} style={{background:C.surface3,border:`1px solid ${C.border}`,borderRadius:10,padding:12}}>
                      <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>{card.label}</div>
                      <div style={{fontSize:16,fontWeight:800,color:C.text}}>{card.value}</div>
                      <div style={{fontSize:11,color:C.text3,marginTop:4}}>{card.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>)}


        {/* ══════════════════════════════════════════════════════
            COMMISSIONS VIEW
        ══════════════════════════════════════════════════════ */}
        {view==='commissions'&&(()=>{
          // ── Commission constants ────────────────────────────
          const MEETING_BONUS = 150
          const SQL_BONUS = 620
          const SQL_ACCELERATOR = 930
          const SQL_ACCELERATOR_THRESHOLD = 3
          const ANNUAL_SQL_CAP = 22320
          const ANNUAL_MEETING_CAP = 18000

          // ── Helper: is lead ICP — tier A/B/E qualifies, C does not ──
          // Falls back to mqlQuality === 'hq' for leads without a tier set
          const isIcp = (email: string): boolean => {
            const det = details[email]
            const tier = det?.accountTier || ''
            if (tier) return tier === 'A' || tier === 'B' || tier === 'E'
            return (det?.mqlQuality || '') === 'hq'
          }

          // ── Build per-rep commission data ────────────────────
          type CommissionMonth = {
            key: string       // 'YYYY-MM'
            label: string     // 'Jan 2026'
            meetings: { email: string; account: string; date: string; amount: number }[]
            sqls: { email: string; account: string; date: string; amount: number; accelerated: boolean }[]
            meetingTotal: number
            sqlTotal: number
            acceleratorTotal: number
            total: number
            payoutMonth: string  // 'Feb 2026' etc
          }

          // ── Frozen commission overrides from Spiff statements ──────────────
          // These months had different commission models or data corrections.
          // Override data takes priority over dynamically computed commissions.
          const mkPayoutLabel=(mk:string)=>{const [y,m]=mk.split('-').map(Number);return `${new Date(y,m,1).toLocaleString('en-US',{month:'short',year:'numeric'})} (2nd half)`}
          const mkLabel=(mk:string)=>{const [y,m]=mk.split('-').map(Number);return new Date(y,m-1,1).toLocaleString('en-US',{month:'short',year:'numeric'})}

          const COMMISSION_OVERRIDES: Record<string,CommissionMonth> = {
            // ── Sep 2025 — FY25-Q3: $500/SQL flat, no meetings, no accelerator ──
            '2025-09': {
              key:'2025-09', label:mkLabel('2025-09'), payoutMonth:mkPayoutLabel('2025-09'),
              meetings:[], meetingTotal:0, acceleratorTotal:0,
              sqls:[
                {email:'josh.barrett@pep.com',      account:'Josh Barrett — pep, LLC',             date:'2025-09-10',amount:500,accelerated:false},
                {email:'joseph.sintum@quantummetric.com', account:'Joseph Sintum — Quantum Metric', date:'2025-09-05',amount:500,accelerated:false},
                {email:'mani.suri@follett.com',      account:'Mani Suri — Follett Higher Education', date:'2025-09-05',amount:500,accelerated:false},
                {email:'sean.grice@ny.gov',          account:'Sean Grice — New York State',         date:'2025-09-19',amount:500,accelerated:false},
                {email:'wei.si@wyze.com',            account:'Wei Si — Wyze',                       date:'2025-09-22',amount:500,accelerated:false},
              ],
              sqlTotal:2500, total:2500,
            },
            // ── Oct 2025 — FY25-Q3: $500/SQL flat, no meetings ──
            '2025-10': {
              key:'2025-10', label:mkLabel('2025-10'), payoutMonth:mkPayoutLabel('2025-10'),
              meetings:[], meetingTotal:0, acceleratorTotal:0,
              sqls:[
                {email:'alejandro.mallea@dakotasoft.com', account:'Alejandro Mallea — Dakota Software', date:'2025-10-17',amount:500,accelerated:false},
                {email:'srinivasan.dayalan@trimble.com',  account:'Srinivasan Dayalan — Trimble',      date:'2025-10-21',amount:500,accelerated:false},
                {email:'arthur.miller@sixfold.com',       account:'Arthur Miller — Sixfold',            date:'2025-10-02',amount:500,accelerated:false},
                {email:'devario.johnson@imentor.org',     account:'Devario Johnson — iMentor',          date:'2025-10-09',amount:500,accelerated:false},
              ],
              sqlTotal:2000, total:2000,
            },
            // ── Nov 2025 — FY26-Q1: $100/meeting, no SQLs ──
            '2025-11': {
              key:'2025-11', label:mkLabel('2025-11'), payoutMonth:mkPayoutLabel('2025-11'),
              meetings:[
                {email:'michael.wahl@tweddlegroup.com',  account:'Michael Wahl — Tweddle Group',  date:'2025-11-06',amount:100},
                {email:'geraldine.bai@deloitte.com',     account:'Geraldine Bai — Deloitte',      date:'2025-11-22',amount:100},
                {email:'suzanne.robinson@gentrack.com',  account:'Suzanne Robinson — Gentrack',   date:'2025-11-09',amount:100},
                {email:'ilir.kosumi@enmacc.com',         account:'Ilir Kosumi — enmacc',          date:'2025-11-17',amount:100},
              ],
              meetingTotal:400, sqls:[], sqlTotal:0, acceleratorTotal:0, total:400,
            },
            // ── Dec 2025 — FY26-Q1: $100/meeting, 1 SQL at $400 ──
            '2025-12': {
              key:'2025-12', label:mkLabel('2025-12'), payoutMonth:mkPayoutLabel('2025-12'),
              meetings:[
                {email:'richard.tep@textnow.com',       account:'Richard Tep — TextNow',              date:'2025-12-08',amount:100},
                {email:'jf.cantin@lgi.com',              account:'Jean-Francois Cantin — LGI Healthcare', date:'2025-12-08',amount:100},
                {email:'kenanadvantage@historical',      account:'Dave Derecskey — Kenan Advantage Group', date:'2025-12-12',amount:100},
              ],
              meetingTotal:300,
              sqls:[
                {email:'michael.wahl@tweddlegroup.com',  account:'Michael Wahl — Tweddle Group',  date:'2025-12-04',amount:400,accelerated:false},
              ],
              sqlTotal:400, acceleratorTotal:0, total:700,
            },
            // ── Jan 2026 — New model. 6 meetings correct. 11 SQLs (8 contact + 3 lead) ──
            // Dynamic computation handles the 8 contact SQLs; we override to add 3 lead SQLs and fix totals
            '2026-01': (() => {
              // 8 contact SQLs from the dashboard (computed dynamically but we freeze them here)
              const contactSqls: CommissionMonth['sqls'] = [
                {email:'everydayhealth@historical',   account:'Kholilur Rahman — Everyday Health', date:'2026-01-13',amount:620,accelerated:false},
                {email:'harrys@historical',           account:'Simon Anguish — Harry\'s',          date:'2026-01-15',amount:620,accelerated:false},
                {email:'trackunit@historical',        account:'Philip Quinn — Trackunit',          date:'2026-01-19',amount:620,accelerated:false},
                {email:'bloomcoaching@historical',    account:'Thomas Stevens — Bloom Coaching',   date:'2026-01-23',amount:930,accelerated:true},
                {email:'vidmob@historical',           account:'Ben Holm — Vidmob',                 date:'2026-01-27',amount:930,accelerated:true},
                {email:'sharkninja@historical',       account:'Jake Rutter — SharkNinja',          date:'2026-01-28',amount:930,accelerated:true},
                {email:'pods@historical',             account:'Randy Withrow — PODS',              date:'2026-01-29',amount:930,accelerated:true},
                {email:'gavin.williams@f1arcade.com', account:'Gavin Williams — F1 Arcade',        date:'2026-01-30',amount:930,accelerated:true},
              ]
              // 3 lead SQLs missing from dashboard
              const leadSqls: CommissionMonth['sqls'] = [
                {email:'logicmonitor@historical',         account:'Jitender Prasad — LogicMonitor',  date:'2026-01-13',amount:930,accelerated:true},
                {email:'harry.selvaratnam@iterate.ai',    account:'Harry Selvaratnam — Iterate.ai',  date:'2026-01-13',amount:930,accelerated:true},
                {email:'suzanne.robinson@gentrack.com',   account:'Suzanne Robinson — Gentrack',     date:'2026-01-13',amount:930,accelerated:true},
              ]
              const allSqls = [...contactSqls, ...leadSqls]
              // Meetings (6, correct in dashboard, frozen here)
              const meetings: CommissionMonth['meetings'] = [
                {email:'logicmonitor@historical',     account:'Jitender Prasad — LogicMonitor',       date:'2025-12-11',amount:150},
                {email:'everydayhealth@historical',   account:'Kholilur Rahman — Everyday Health',    date:'2026-01-13',amount:150},
                {email:'vidmob@historical',           account:'Ben Holm — Vidmob',                    date:'2026-01-15',amount:150},
                {email:'circlemedical@historical',    account:'Florian Denu — Circle Medical',        date:'2026-01-22',amount:150},
                {email:'tradera@historical',          account:'Emma Carlsson — Tradera',              date:'2026-01-22',amount:150},
                {email:'bloomcoaching@historical',    account:'Thomas Stevens — Bloom Coaching',      date:'2026-01-23',amount:150},
              ]
              // Spiff statement totals: Contact SQL = $6,510, Lead SQL = $2,790, Meeting = $900
              return {
                key:'2026-01', label:mkLabel('2026-01'), payoutMonth:mkPayoutLabel('2026-01'),
                meetings, meetingTotal:900,
                sqls: allSqls, sqlTotal:9300, acceleratorTotal:allSqls.filter(s=>s.accelerated).reduce((s,x)=>s+x.amount,0),
                total:10200,
              }
            })(),
            // ── Feb 2026 — 6 meetings ($150 each), 2 SQLs ──
            '2026-02': {
              key:'2026-02', label:mkLabel('2026-02'), payoutMonth:mkPayoutLabel('2026-02'),
              meetings:[
                {email:'sharkninja@historical',   account:'Jake Rutter — SharkNinja',    date:'2026-02-01',amount:150},
                {email:'bloomcoaching@historical',account:'Thomas Stevens — Bloom Coaching', date:'2026-02-01',amount:150},
                {email:'quince@historical',       account:'Prabhanjan Jha — Quince',     date:'2026-02-12',amount:150},
                {email:'prophetx@historical',     account:'Nathan Busscher — ProphetX',  date:'2026-02-17',amount:150},
                {email:'westjet@historical',      account:'Santhosha C. — WestJet',      date:'2026-02-20',amount:150},
                {email:'robbinsresearch@historical',account:'Nick Jensen — Robbins Research', date:'2026-02-23',amount:150},
              ],
              meetingTotal:900,
              sqls:[
                {email:'quartr@historical',       account:'Fabricio Vergara — Quartr',   date:'2026-02-11',amount:620,accelerated:false},
                {email:'prophetx@historical',     account:'Nathan Busscher — ProphetX',  date:'2026-02-18',amount:620,accelerated:false},
              ],
              sqlTotal:1240, acceleratorTotal:0, total:2140,
            },
            // ── Mar 2026 — 8 meetings, 6 SQLs (5 contact + 1 lead) ──
            '2026-03': (() => {
              const meetings: CommissionMonth['meetings'] = [
                {email:'onephase@historical',        account:'Louis Velez — onPhase',           date:'2026-03-06',amount:150},
                {email:'enablecomp@historical',      account:'Keith Clayton — EnableComp',      date:'2026-03-12',amount:150},
                {email:'nuqleous@historical',        account:'Steven Williams — Nuqleous',      date:'2026-03-13',amount:150},
                {email:'playtech@historical',        account:'Borislav Zhezhev — Playtech',     date:'2026-03-13',amount:150},
                {email:'north@historical',           account:'Forum Vyas — North',              date:'2026-03-17',amount:150},
                {email:'cradle@historical',          account:'Melanie Burger — Cradle',         date:'2026-03-17',amount:150},
                {email:'novemberfive@historical',    account:'Antonio Marquez — November Five', date:'2026-03-18',amount:150},
                {email:'azets@historical',           account:'Kristijonas Bulzgis — Azets',     date:'2026-03-25',amount:150},
              ]
              const sqls: CommissionMonth['sqls'] = [
                {email:'brandon.hall@everyonesocial.com', account:'Brandon Hall — EveryoneSocial',    date:'2026-03-03',amount:620,accelerated:false},
                {email:'bhargav.mehta@octaura.com',       account:'Bhargav Mehta — Octaura',          date:'2026-03-04',amount:620,accelerated:false},
                {email:'onephase@historical',             account:'Louis Velez — onPhase',            date:'2026-03-06',amount:620,accelerated:false},
                {email:'nuqleous@historical',             account:'Steven Williams — Nuqleous',       date:'2026-03-13',amount:930,accelerated:true},
                {email:'north@historical',                account:'Forum Vyas — North American Bancard', date:'2026-03-17',amount:930,accelerated:true},
                {email:'enablecomp@historical',           account:'Keith Clayton — EnableComp',       date:'2026-03-13',amount:930,accelerated:true},
              ]
              return {
                key:'2026-03', label:mkLabel('2026-03'), payoutMonth:mkPayoutLabel('2026-03'),
                meetings, meetingTotal:1200,
                sqls, sqlTotal:4650, acceleratorTotal:2790, total:5850,
              }
            })(),
          }

          const buildRepCommissions = (repLeads: AppLead[], useOverrides = true) => {
            // Gather all meeting events and SQL events with their months
            const meetingEvents: { email: string; account: string; month: string; date: string }[] = []
            const sqlEvents: { email: string; account: string; month: string; date: string }[] = []

            repLeads.forEach(l => {
              const det = details[l.email]
              if (!det) return
              const displayName = nameOverrides[l.email] || l.account || formatDomain(l.domain) || l.email

              // Meeting: needs meetingDate and must be ICP
              if (det.meetingDate && isIcp(l.email)) {
                const d = new Date(det.meetingDate)
                if (!isNaN(d.getTime())) {
                  meetingEvents.push({ email: l.email, account: displayName, month: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, date: det.meetingDate })
                }
              }

              // SQL: needs sqlDq === 'Yes' and sqlDate, and must be ICP
              if ((det.sqlDq || '').toLowerCase() === 'yes' && det.sqlDate && isIcp(l.email)) {
                const d = new Date(det.sqlDate)
                if (!isNaN(d.getTime())) {
                  sqlEvents.push({ email: l.email, account: displayName, month: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, date: det.sqlDate })
                }
              }
            })

            // Collect all months — include override months
            const allMonthKeys = new Set<string>()
            meetingEvents.forEach(e => allMonthKeys.add(e.month))
            sqlEvents.forEach(e => allMonthKeys.add(e.month))
            if (useOverrides) Object.keys(COMMISSION_OVERRIDES).forEach(k => allMonthKeys.add(k))
            const sortedMonths = Array.from(allMonthKeys).sort()

            // Build monthly breakdown — use overrides for frozen months (only when useOverrides is true)
            const months: CommissionMonth[] = sortedMonths.map(mk => {
              if (useOverrides && COMMISSION_OVERRIDES[mk]) return COMMISSION_OVERRIDES[mk]

              const mMeetings = meetingEvents.filter(e => e.month === mk)
              const mSqls = sqlEvents.filter(e => e.month === mk)

              // Calculate SQL bonuses with accelerator
              const sqlItems = mSqls.map((s, i) => {
                const accelerated = i >= SQL_ACCELERATOR_THRESHOLD
                return { ...s, amount: accelerated ? SQL_ACCELERATOR : SQL_BONUS, accelerated }
              })

              const meetingItems = mMeetings.map(m => ({ ...m, amount: MEETING_BONUS }))
              const meetingTotal = meetingItems.reduce((s, m) => s + m.amount, 0)
              const sqlBase = sqlItems.filter(s => !s.accelerated).reduce((s, x) => s + x.amount, 0)
              const acceleratorTotal = sqlItems.filter(s => s.accelerated).reduce((s, x) => s + x.amount, 0)
              const sqlTotal = sqlBase + acceleratorTotal

              // Payout month: following month, 2nd half
              const [y, m] = mk.split('-').map(Number)
              const payoutDate = new Date(y, m, 1) // month is already 0-indexed + 1 = next month
              const payoutMonth = payoutDate.toLocaleString('en-US', { month: 'short', year: 'numeric' })

              return {
                key: mk,
                label: new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' }),
                meetings: meetingItems,
                sqls: sqlItems,
                meetingTotal,
                sqlTotal,
                acceleratorTotal,
                total: meetingTotal + sqlTotal,
                payoutMonth: `${payoutMonth} (2nd half)`,
              }
            })

            // YTD: group by year
            const currentYear = new Date().getFullYear()
            const ytdMonths = months.filter(m => m.key.startsWith(String(currentYear)))
            const ytdMeetingTotal = ytdMonths.reduce((s, m) => s + m.meetingTotal, 0)
            const ytdSqlTotal = ytdMonths.reduce((s, m) => s + (m.sqlTotal - m.acceleratorTotal), 0)
            const ytdAcceleratorTotal = ytdMonths.reduce((s, m) => s + m.acceleratorTotal, 0)
            const ytdGrandTotal = ytdMonths.reduce((s, m) => s + m.total, 0)

            return { months, ytdMeetingTotal, ytdSqlTotal, ytdAcceleratorTotal, ytdGrandTotal }
          }

          // Adjustment helpers — with undo support
          const saveAdj=(updated:typeof commAdjustments,actionLabel:string)=>{
            // Snapshot current state before applying change
            setAdjUndoStack(prev=>[{snapshot:[...commAdjustments],label:actionLabel},...prev].slice(0,20))
            setCommAdjustments(updated)
            localStorage.setItem('mql-comm-adj',JSON.stringify(updated))
            syncToEdgeConfig()
            setAdjUndoMsg(actionLabel)
            setTimeout(()=>setAdjUndoMsg(null),8000)
          }
          const undoAdj=()=>{
            if (adjUndoStack.length===0) return
            const [top,...rest]=adjUndoStack
            setAdjUndoStack(rest)
            setCommAdjustments(top.snapshot)
            localStorage.setItem('mql-comm-adj',JSON.stringify(top.snapshot))
            syncToEdgeConfig()
            setAdjUndoMsg(null)
          }
          const getMonthAdj=(monthKey:string,repId?:string):number=>{
            return commAdjustments
              .filter(a=>a.month===monthKey&&(!repId||a.repId===repId||a.repId==='all'))
              .reduce((s,a)=>s+a.amount,0)
          }
          const getYtdAdj=(repId?:string):number=>{
            const yr=String(new Date().getFullYear())
            return commAdjustments
              .filter(a=>a.month.startsWith(yr)&&(!repId||a.repId===repId||a.repId==='all'))
              .reduce((s,a)=>s+a.amount,0)
          }

          // Current month key
          const now = new Date()
          const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`

          // All leads unfiltered by rep (for manager "All Reps" view)
          const allLeadsUnfilteredComm: AppLead[] = [
            ...HISTORICAL_LEADS,
            ...manualLeads.filter(l => !HISTORICAL_LEADS.some(h => h.email === l.email)),
            ...liveLeads.filter(l => !HISTORICAL_LEADS.some(h => h.email === l.email) && !manualLeads.some(m => m.email === l.email) && !new Set(HISTORICAL_LEADS.map(h=>h.domain)).has(l.domain)),
          ].filter(l => !deletedEmails.has(l.email))

          // Build per-rep commission data
          const perRepCommData = reps.filter(r=>r.slackId).map(rep => {
            const repLeads = rep.id === 'jonathan'
              ? allLeadsUnfilteredComm.filter(l => !l.repSlackId || l.repSlackId === rep.slackId)
              : allLeadsUnfilteredComm.filter(l => l.repSlackId === rep.slackId)
            const data = buildRepCommissions(repLeads, rep.id === 'jonathan')
            return { rep, ...data }
          })

          // Determine which data to show based on rep filter
          // For non-manager roles, always show their own data
          const effectiveRepFilter = isBdm ? commRepFilter : (currentRep?.id || 'all')
          const commData = effectiveRepFilter === 'all'
            ? buildRepCommissions(allLeadsUnfilteredComm, true) // "All" uses overrides since Jonathan's data dominates
            : (() => {
                const found = perRepCommData.find(r => r.rep.id === effectiveRepFilter)
                return found || buildRepCommissions([], false)
              })()
          const currentMonth = commData.months.find(m => m.key === currentMonthKey)
          const adjRepId = effectiveRepFilter === 'all' ? undefined : effectiveRepFilter
          const currentMonthAdj = getMonthAdj(currentMonthKey, adjRepId)

          // For manager view: use perRepCommData
          const managerRepData = isBdm ? perRepCommData : []

          return (<>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:16,marginBottom:isBdm?12:28}}>
            <div>
              <div style={{fontSize:26,fontWeight:800,letterSpacing:'-0.02em',lineHeight:1.15}}>Commissions<br/><span style={{color:C.green}}>Tracker.</span></div>
              <div style={{fontSize:12,color:C.text3,marginTop:4}}>ICP meeting bonuses · SQL payouts · accelerators</div>
            </div>
            {isBdm&&(
              <button onClick={()=>{setEditingAdj({id:`adj-${Date.now()}`,repId:effectiveRepFilter==='all'?'all':effectiveRepFilter,month:currentMonthKey,amount:0,reason:'',createdAt:new Date().toISOString()});setShowAdjModal(true)}} style={{fontSize:11,fontWeight:700,padding:'8px 14px',borderRadius:8,border:`1px solid ${C.border2}`,background:C.surface,color:C.text2,cursor:'pointer'}}>
                ± Adjust Commission
              </button>
            )}
          </div>

          {/* ── Rep filter (BDM only) ── */}
          {isBdm&&(
            <div style={{display:'flex',gap:5,marginBottom:16,flexWrap:'wrap'}}>
              <button onClick={()=>setCommRepFilter('all')} style={filterPill(commRepFilter==='all','#60d4f4')}>All Reps</button>
              {reps.filter(r=>r.slackId).map(r=>(
                <button key={r.id} onClick={()=>setCommRepFilter(r.id)} style={filterPill(commRepFilter===r.id,'#60d4f4')}>{r.name}</button>
              ))}
            </div>
          )}

          {/* ── Undo banner ── */}
          {adjUndoMsg&&adjUndoStack.length>0&&(
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:'rgba(245,166,35,0.12)',border:`1px solid rgba(245,166,35,0.3)`,borderRadius:8,marginBottom:16}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:12,color:C.amber,fontWeight:600}}>{adjUndoMsg}</span>
              </div>
              <button onClick={undoAdj} style={{fontSize:11,fontWeight:700,padding:'5px 14px',borderRadius:6,border:`1px solid ${C.amber}`,background:'rgba(245,166,35,0.18)',color:C.amber,cursor:'pointer'}}>
                Undo
              </button>
            </div>
          )}

          {/* ── Undo history (persistent) ── */}
          {isBdm&&adjUndoStack.length>0&&!adjUndoMsg&&(
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
              <button onClick={undoAdj} style={{fontSize:10,fontWeight:600,padding:'4px 10px',borderRadius:5,border:`1px solid ${C.border2}`,background:'transparent',color:C.text3,cursor:'pointer'}}>
                ↩ Undo last change ({adjUndoStack.length} in history)
              </button>
            </div>
          )}

          {/* ── Compensation Tracker — Jonathan Kim only ── */}
          {currentRep?.id==='jonathan'&&auth&&'email' in auth&&auth.email==='jonathankim@qawolf.com'&&(()=>{
            // Always use Jonathan's own commission data regardless of rep filter
            const jkCommData = perRepCommData.find(r=>r.rep.id==='jonathan') || commData
            // ── Comp plan constants ──────────────────────────────────────────────
            // Jonathan was promoted from SDR to BDM on Feb 18, 2026.
            // Pre-promotion (Jan 2026): $80K base, $40K variable, $120K OTE
            // Post-promotion (Feb 18, 2026+): $120K base, $30K variable, $150K OTE
            const COMP_CHANGE_DATE=new Date(2026,1,18) // Feb 18, 2026
            const BDM_BASE_ANNUAL=120000
            const BDM_VARIABLE_ANNUAL=30000
            const BDM_OTE_ANNUAL=150000
            const BDM_BASE_MONTHLY=10000
            const SDR_BASE_MONTHLY=6667
            const SDR_OTE_ANNUAL=120000
            const SDR_VARIABLE_ANNUAL=40000

            const yr=now.getFullYear()
            const monthsElapsed=now.getMonth()+1

            // ── Period filter logic ──────────────────────────────────────────────
            let filterStart:Date, filterEnd:Date, filterLabel:string
            if(compPeriod==='comp_change'){
              filterStart=COMP_CHANGE_DATE; filterEnd=now; filterLabel='Since Comp Change (Feb 18)'
            } else if(compPeriod==='ytd'){
              filterStart=new Date(yr,0,1); filterEnd=now; filterLabel=`Calendar YTD · ${yr}`
            } else if(compPeriod==='quarter'){
              filterStart=new Date(yr,Math.floor(now.getMonth()/3)*3,1); filterEnd=now; filterLabel='This Quarter'
            } else if(compPeriod==='month'){
              filterStart=new Date(yr,now.getMonth(),1); filterEnd=now; filterLabel='This Month'
            } else {
              filterStart=compFrom?new Date(compFrom):new Date(yr,0,1)
              filterEnd=compTo?new Date(compTo+'T23:59:59'):now
              filterLabel='Custom Range'
            }

            // ── Filter commission months to the selected period ──────────────────
            const filteredMonths=jkCommData.months.filter(m=>{
              const [y,mo]=m.key.split('-').map(Number)
              const monthEnd=new Date(y,mo,0,23,59,59) // last day of that month
              const monthStart=new Date(y,mo-1,1)
              return monthEnd>=filterStart&&monthStart<=filterEnd
            })
            const filteredMeetingTotal=filteredMonths.reduce((s,m)=>s+m.meetingTotal,0)
            const filteredSqlBase=filteredMonths.reduce((s,m)=>s+(m.sqlTotal-m.acceleratorTotal),0)
            const filteredAccelTotal=filteredMonths.reduce((s,m)=>s+m.acceleratorTotal,0)
            const filteredCommTotal=filteredMonths.reduce((s,m)=>s+m.total,0)
            // Adjustments within the filter period
            const filteredAdj=commAdjustments.filter(a=>{
              const [y,mo]=a.month.split('-').map(Number)
              const aDate=new Date(y,mo-1,15) // mid-month proxy
              return aDate>=filterStart&&aDate<=filterEnd&&(a.repId==='jonathan'||a.repId==='all')
            }).reduce((s,a)=>s+a.amount,0)
            const variableEarned=filteredCommTotal+filteredAdj

            // ── Pace & projection logic (based on current comp plan) ─────────────
            // Elapsed days under BDM plan since Feb 18, 2026
            const compPlanStart=COMP_CHANGE_DATE
            const msElapsed=Math.max(0,now.getTime()-compPlanStart.getTime())
            const daysElapsed=msElapsed/(1000*60*60*24)
            const daysInYear=365
            // Pro-rated variable target for elapsed time under BDM plan
            const proratedTarget=BDM_VARIABLE_ANNUAL*(daysElapsed/daysInYear)
            // Commission earned since comp change (for pace calc)
            const compChangeMonths=jkCommData.months.filter(m=>{
              const [y,mo]=m.key.split('-').map(Number)
              return new Date(y,mo,0)>=compPlanStart
            })
            const commSinceChange=compChangeMonths.reduce((s,m)=>s+m.total,0)+commAdjustments.filter(a=>{
              const [y,mo]=a.month.split('-').map(Number)
              return new Date(y,mo-1,15)>=compPlanStart&&(a.repId==='jonathan'||a.repId==='all')
            }).reduce((s,a)=>s+a.amount,0)
            const variableAttainmentPct=proratedTarget>0?Math.round(commSinceChange/proratedTarget*100):0
            // Projected annual variable at current pace
            const dailyRate=daysElapsed>0?commSinceChange/daysElapsed:0
            const remainingDays=daysInYear-daysElapsed
            const projectedVariable=Math.round(commSinceChange+(dailyRate*remainingDays))
            const projectedTotalComp=BDM_BASE_ANNUAL+projectedVariable
            const overVariable=Math.max(0,commSinceChange-proratedTarget)
            const overOte=Math.max(0,projectedTotalComp-BDM_OTE_ANNUAL)

            // Pace indicator
            const pacePct=variableAttainmentPct
            const paceLabel=pacePct>=110?'Above pace':pacePct>=90?'On pace':'Below pace'
            const paceColor=pacePct>=110?C.green:pacePct>=90?C.amber:C.red
            const remaining=Math.max(0,BDM_VARIABLE_ANNUAL-commSinceChange)

            // ── Monthly breakdown for the detail table ──────────────────────────
            const breakdownMonths=filteredMonths.map(m=>{
              const adj=getMonthAdj(m.key,'jonathan')
              return {
                ...m,
                adj,
                totalWithAdj:m.total+adj,
                sqlCount:m.sqls.length,
                accelHit:m.sqls.length>SQL_ACCELERATOR_THRESHOLD,
              }
            })

            // ── Earnings composition ─────────────────────────────────────────────
            const compParts=[
              {label:'Meeting Bonuses',value:filteredMeetingTotal,color:C.green},
              {label:'SQL Bonuses (base)',value:filteredSqlBase,color:'#c084fc'},
              {label:'Accelerator Bonuses',value:filteredAccelTotal,color:C.amber},
              ...(filteredAdj!==0?[{label:'Adjustments',value:filteredAdj,color:filteredAdj<0?C.red:'#60d4f4'}]:[]),
            ]
            const compTotal=compParts.reduce((s,p)=>s+p.value,0)

            // ── Monthly earnings for chart (always calendar YTD) ─────────────────
            const monthlyEarnings=Array.from({length:monthsElapsed},(_,i)=>{
              const mk=`${yr}-${String(i+1).padStart(2,'0')}`
              const base=i===0&&yr===2026?SDR_BASE_MONTHLY:BDM_BASE_MONTHLY
              const monthComm=jkCommData.months.find(m=>m.key===mk)
              const comm=(monthComm?.total??0)+getMonthAdj(mk,'jonathan')
              const oteMonthly=i===0&&yr===2026?SDR_OTE_ANNUAL/12:BDM_OTE_ANNUAL/12
              return {label:new Date(yr,i).toLocaleString('en-US',{month:'short'}),mk,base,comm,total:base+comm,oteMonthly}
            })
            const maxMonthly=Math.max(1,...monthlyEarnings.map(m=>Math.max(m.total,m.oteMonthly)))

            return (<>
              <div style={{...card,marginBottom:20,background:'linear-gradient(135deg, rgba(0,229,160,0.06) 0%, rgba(123,110,246,0.06) 100%)',border:`1px solid rgba(0,229,160,0.2)`}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:800,color:C.text}}>Compensation Tracker</div>
                    <div style={{fontSize:10,color:C.text3,marginTop:2}}>BDM comp plan · $120K base + $30K variable · OTE $150K</div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <span style={{width:8,height:8,borderRadius:'50%',background:paceColor}}/>
                    <span style={{fontSize:11,fontWeight:700,color:paceColor}}>{paceLabel} ({pacePct}%)</span>
                  </div>
                </div>

                {/* Period filter */}
                <div style={{display:'flex',gap:5,marginBottom:16,flexWrap:'wrap'}}>
                  {(['comp_change','ytd','quarter','month'] as const).map(p=>(
                    <button key={p} onClick={()=>{setCompPeriod(p);setCompFrom('');setCompTo('')}} style={filterPill(compPeriod===p,'#60d4f4')}>
                      {{comp_change:'Since Comp Change',ytd:'Calendar YTD',quarter:'This Quarter',month:'This Month'}[p]}
                    </button>
                  ))}
                  <button onClick={()=>setCompPeriod('custom')} style={filterPill(compPeriod==='custom',C.amber)}>Custom</button>
                  {compPeriod==='custom'&&(
                    <div style={{display:'flex',alignItems:'center',gap:4}}>
                      <input type="date" value={compFrom} onChange={e=>setCompFrom(e.target.value)} style={{fontSize:10,padding:'3px 6px',border:`1px solid ${C.border2}`,borderRadius:5,background:C.surface3,color:C.text2,outline:'none',colorScheme:'dark'}}/>
                      <span style={{fontSize:10,color:C.text3}}>→</span>
                      <input type="date" value={compTo} onChange={e=>setCompTo(e.target.value)} style={{fontSize:10,padding:'3px 6px',border:`1px solid ${C.border2}`,borderRadius:5,background:C.surface3,color:C.text2,outline:'none',colorScheme:'dark'}}/>
                    </div>
                  )}
                </div>

                {/* ── Progress to Goal ── */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:16}}>
                  {/* Variable Earned */}
                  <div style={{background:C.surface3,borderRadius:10,padding:14,border:`1px solid ${C.border}`}}>
                    <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>Variable Earned</div>
                    <div style={{fontSize:20,fontWeight:800,color:C.green}}>${Math.round(variableEarned).toLocaleString()}</div>
                    <div style={{fontSize:10,color:C.text3,marginTop:2}}>{filterLabel}</div>
                    <div style={{height:6,borderRadius:3,background:C.surface,marginTop:8}}>
                      <div style={{height:6,borderRadius:3,background:C.green,width:`${Math.min(100,commSinceChange/BDM_VARIABLE_ANNUAL*100)}%`,transition:'width 0.4s'}}/>
                    </div>
                    <div style={{fontSize:9,color:C.text3,marginTop:4}}>${Math.round(commSinceChange).toLocaleString()} / ${BDM_VARIABLE_ANNUAL.toLocaleString()} annual target · {Math.round(commSinceChange/BDM_VARIABLE_ANNUAL*100)}%</div>
                  </div>

                  {/* Remaining + Projected */}
                  <div style={{background:C.surface3,borderRadius:10,padding:14,border:`1px solid ${C.border}`}}>
                    <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>Remaining to Goal</div>
                    <div style={{fontSize:20,fontWeight:800,color:remaining>0?C.text:C.green}}>{remaining>0?`$${Math.round(remaining).toLocaleString()}`:'Goal reached'}</div>
                    <div style={{fontSize:10,color:C.text3,marginTop:2}}>of $30K annual variable</div>
                    <div style={{borderTop:`1px solid ${C.border}`,marginTop:10,paddingTop:8}}>
                      <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:4}}>Projected Variable</div>
                      <div style={{fontSize:16,fontWeight:800,color:projectedVariable>BDM_VARIABLE_ANNUAL?C.green:C.text}}>${projectedVariable.toLocaleString()}</div>
                      <div style={{fontSize:9,color:C.text3}}>at current daily pace of ${Math.round(dailyRate).toLocaleString()}/day</div>
                    </div>
                  </div>

                  {/* OTE Status + Projected Total */}
                  <div style={{background:C.surface3,borderRadius:10,padding:14,border:`1px solid ${C.border}`}}>
                    <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>Projected Total Comp</div>
                    <div style={{fontSize:20,fontWeight:800,color:projectedTotalComp>BDM_OTE_ANNUAL?C.green:C.text}}>${projectedTotalComp.toLocaleString()}</div>
                    <div style={{fontSize:10,color:C.text3,marginTop:2}}>base $120K + projected variable</div>
                    {overOte>0&&(
                      <div style={{marginTop:8,padding:'6px 8px',background:'rgba(0,229,160,0.1)',borderRadius:6,border:'1px solid rgba(0,229,160,0.25)'}}>
                        <div style={{fontSize:11,fontWeight:700,color:C.green}}>+${overOte.toLocaleString()} above OTE</div>
                      </div>
                    )}
                    {overVariable>0&&(
                      <div style={{marginTop:4,fontSize:10,color:C.green,fontWeight:600}}>+${Math.round(overVariable).toLocaleString()} above prorated variable target</div>
                    )}
                  </div>
                </div>

                {/* ── Earnings Composition ── */}
                <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>Earnings Composition · {filterLabel}</div>
                <div style={{display:'flex',gap:10,marginBottom:16}}>
                  {compParts.filter(p=>p.value!==0).map(p=>{
                    const pctOfTotal=compTotal!==0?Math.round(Math.abs(p.value)/Math.abs(compTotal)*100):0
                    return (
                      <div key={p.label} style={{flex:Math.max(1,pctOfTotal),background:C.surface3,borderRadius:8,padding:'10px 12px',borderLeft:`3px solid ${p.color}`,minWidth:0}}>
                        <div style={{fontSize:14,fontWeight:800,color:p.color}}>${Math.abs(p.value).toLocaleString()}{p.value<0&&<span style={{fontSize:10}}> (redacted)</span>}</div>
                        <div style={{fontSize:9,color:C.text3,marginTop:2}}>{p.label} · {pctOfTotal}%</div>
                      </div>
                    )
                  })}
                </div>

                {/* ── Monthly Earnings Chart (always calendar YTD) ── */}
                <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Monthly Earnings vs OTE Pace · Calendar YTD</div>
                <div style={{display:'flex',gap:4,alignItems:'flex-end',height:120}}>
                  {monthlyEarnings.map((m,i)=>{
                    const barH=maxMonthly>0?(m.total/maxMonthly*100):0
                    const baseH=maxMonthly>0?(m.base/maxMonthly*100):0
                    const commH=barH-baseH
                    const oteLine=maxMonthly>0?(m.oteMonthly/maxMonthly*100):0
                    const inFilter=new Date(yr,i,15)>=filterStart&&new Date(yr,i,15)<=filterEnd
                    return (
                      <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',position:'relative',height:'100%',opacity:inFilter?1:0.35}}>
                        <div style={{position:'absolute',bottom:`${oteLine}%`,left:0,right:0,height:2,background:C.amber,borderRadius:1,opacity:0.6,zIndex:1}}/>
                        <div style={{flex:1}}/>
                        {commH>0&&<div style={{width:'70%',height:`${commH}%`,background:C.green,borderRadius:'3px 3px 0 0',minHeight:commH>0?2:0}}/>}
                        <div style={{width:'70%',height:`${baseH}%`,background:C.purple,borderRadius:commH>0?0:'3px 3px 0 0',minHeight:2}}/>
                        <div style={{fontSize:8,color:C.text3,marginTop:3}}>{m.label}</div>
                      </div>
                    )
                  })}
                </div>
                <div style={{display:'flex',gap:14,marginTop:8,justifyContent:'center'}}>
                  <div style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:8,height:8,borderRadius:2,background:C.purple}}/><span style={{fontSize:9,color:C.text3}}>Base</span></div>
                  <div style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:8,height:8,borderRadius:2,background:C.green}}/><span style={{fontSize:9,color:C.text3}}>Commission</span></div>
                  <div style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:14,height:2,borderRadius:1,background:C.amber}}/><span style={{fontSize:9,color:C.text3}}>OTE Pace</span></div>
                  <div style={{display:'flex',alignItems:'center',gap:4}}><span style={{width:8,height:4,borderRadius:1,background:C.text3,opacity:0.35}}/><span style={{fontSize:9,color:C.text3}}>Outside filter</span></div>
                </div>
              </div>

              {/* ── Monthly Commission Breakdown (auditable) ── */}
              {breakdownMonths.length>0&&(
                <div style={{...card,marginBottom:20}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:14}}>Monthly Commission Detail · {filterLabel}</div>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                    <thead>
                      <tr style={{borderBottom:`2px solid ${C.border2}`}}>
                        {['Month','Meetings','Meeting $','SQLs','SQL $ (base)','Accel $','Adjustments','Total Earned','Accel Hit'].map(h=>(
                          <th key={h} style={{padding:'7px 8px',textAlign:h==='Month'?'left':'right',fontSize:9,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em'}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {breakdownMonths.map(m=>(
                        <tr key={m.key} style={{borderBottom:`1px solid ${C.border}`,background:m.key===currentMonthKey?'rgba(0,229,160,0.06)':'transparent'}}>
                          <td style={{padding:'8px',fontWeight:m.key===currentMonthKey?700:500,color:m.key===currentMonthKey?C.green:C.text}}>{m.label}</td>
                          <td style={{padding:'8px',textAlign:'right',color:C.text}}>{m.meetings.length}</td>
                          <td style={{padding:'8px',textAlign:'right',color:C.green,fontWeight:600}}>${m.meetingTotal.toLocaleString()}</td>
                          <td style={{padding:'8px',textAlign:'right',color:C.text}}>{m.sqlCount}</td>
                          <td style={{padding:'8px',textAlign:'right',color:'#c084fc',fontWeight:600}}>${(m.sqlTotal-m.acceleratorTotal).toLocaleString()}</td>
                          <td style={{padding:'8px',textAlign:'right',color:m.acceleratorTotal>0?C.amber:C.text3}}>{m.acceleratorTotal>0?`$${m.acceleratorTotal.toLocaleString()}`:'—'}</td>
                          <td style={{padding:'8px',textAlign:'right',color:m.adj!==0?(m.adj<0?C.red:C.green):C.text3}}>{m.adj!==0?`${m.adj<0?'−':'+'} $${Math.abs(m.adj).toLocaleString()}`:'—'}</td>
                          <td style={{padding:'8px',textAlign:'right',fontWeight:700,color:C.text}}>${m.totalWithAdj.toLocaleString()}</td>
                          <td style={{padding:'8px',textAlign:'right'}}>{m.accelHit?<span style={{fontSize:9,fontWeight:700,color:C.amber,background:'rgba(245,166,35,0.15)',padding:'1px 5px',borderRadius:3}}>YES ({m.sqlCount} SQLs)</span>:<span style={{fontSize:9,color:C.text3}}>No</span>}</td>
                        </tr>
                      ))}
                      {breakdownMonths.length>1&&(
                        <tr style={{borderTop:`2px solid ${C.border2}`,background:C.surface2}}>
                          <td style={{padding:'8px',fontWeight:800,color:C.text}}>Total</td>
                          <td style={{padding:'8px',textAlign:'right',fontWeight:700,color:C.text}}>{breakdownMonths.reduce((s,m)=>s+m.meetings.length,0)}</td>
                          <td style={{padding:'8px',textAlign:'right',fontWeight:700,color:C.green}}>${filteredMeetingTotal.toLocaleString()}</td>
                          <td style={{padding:'8px',textAlign:'right',fontWeight:700,color:C.text}}>{breakdownMonths.reduce((s,m)=>s+m.sqlCount,0)}</td>
                          <td style={{padding:'8px',textAlign:'right',fontWeight:700,color:'#c084fc'}}>${filteredSqlBase.toLocaleString()}</td>
                          <td style={{padding:'8px',textAlign:'right',fontWeight:700,color:C.amber}}>${filteredAccelTotal.toLocaleString()}</td>
                          <td style={{padding:'8px',textAlign:'right',fontWeight:700,color:filteredAdj<0?C.red:filteredAdj>0?C.green:C.text3}}>{filteredAdj!==0?`${filteredAdj<0?'−':'+'} $${Math.abs(filteredAdj).toLocaleString()}`:'—'}</td>
                          <td style={{padding:'8px',textAlign:'right',fontWeight:800,color:C.text}}>${Math.round(variableEarned).toLocaleString()}</td>
                          <td/>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>)
          })()}

          {/* ── Monthly Summary Cards ── */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:20}}>
            <div style={card}>
              <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>Meetings Booked</div>
              <div style={{fontSize:24,fontWeight:800,color:C.green}}>{currentMonth?.meetings.length ?? 0}</div>
              <div style={{fontSize:13,fontWeight:700,color:C.text2,marginTop:4}}>${(currentMonth?.meetingTotal ?? 0).toLocaleString()}</div>
              <div style={{fontSize:10,color:C.text3,marginTop:2}}>@ $150/meeting</div>
            </div>
            <div style={card}>
              <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>SQLs</div>
              <div style={{fontSize:24,fontWeight:800,color:'#c084fc'}}>{currentMonth?.sqls.length ?? 0}</div>
              <div style={{fontSize:13,fontWeight:700,color:C.text2,marginTop:4}}>${((currentMonth?.sqlTotal ?? 0) - (currentMonth?.acceleratorTotal ?? 0)).toLocaleString()}</div>
              <div style={{fontSize:10,color:C.text3,marginTop:2}}>@ $620/SQL</div>
            </div>
            <div style={card}>
              <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>Accelerator</div>
              <div style={{fontSize:24,fontWeight:800,color:C.amber}}>{currentMonth ? Math.max(0, currentMonth.sqls.length - SQL_ACCELERATOR_THRESHOLD) : 0}</div>
              <div style={{fontSize:13,fontWeight:700,color:C.text2,marginTop:4}}>${(currentMonth?.acceleratorTotal ?? 0).toLocaleString()}</div>
              <div style={{fontSize:10,color:C.text3,marginTop:2}}>{currentMonth && currentMonth.sqls.length > SQL_ACCELERATOR_THRESHOLD ? `${currentMonth.sqls.length - SQL_ACCELERATOR_THRESHOLD} SQL(s) @ $930` : '>3 SQLs triggers $930/SQL'}</div>
            </div>
            <div style={card}>
              <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>Total Commission</div>
              <div style={{fontSize:24,fontWeight:800,color:C.text}}>${((currentMonth?.total ?? 0) + currentMonthAdj).toLocaleString()}</div>
              {currentMonthAdj!==0&&<div style={{fontSize:10,color:currentMonthAdj<0?C.red:C.green,marginTop:2,fontWeight:600}}>{currentMonthAdj<0?'':'+'}{currentMonthAdj.toLocaleString()} adj</div>}
              <div style={{fontSize:10,color:C.text3,marginTop:currentMonthAdj!==0?2:6}}>
                {now.toLocaleString('en-US',{month:'long',year:'numeric'})}
              </div>
            </div>
            <div style={card}>
              <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>Payout Date</div>
              <div style={{fontSize:16,fontWeight:700,color:C.purpleL,marginTop:6}}>{currentMonth?.payoutMonth ?? '—'}</div>
              <div style={{fontSize:10,color:C.text3,marginTop:4}}>2nd half pay cycle</div>
            </div>
          </div>

          {/* ── Monthly Breakdown Table ── */}
          <div style={{...card,marginBottom:20}}>
            <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:14}}>Monthly Breakdown</div>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead>
                <tr style={{borderBottom:`2px solid ${C.border2}`}}>
                  {['Month','Meetings','Meeting $','SQLs','SQL $','Accel $','Total','Cap Status','Payout'].map(h=>(
                    <th key={h} style={{padding:'8px 10px',textAlign:h==='Month'?'left':'right',fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...commData.months].reverse().map(m=>{
                  const isExpanded = expandedMonth === m.key
                  return (
                    <React.Fragment key={m.key}>
                      <tr
                        style={{borderBottom:`1px solid ${C.border}`,cursor:'pointer',background:isExpanded?'rgba(123,110,246,0.08)':m.key===currentMonthKey?'rgba(0,229,160,0.06)':'transparent'}}
                        onClick={()=>setExpandedMonth(p=>p===m.key?null:m.key)}
                      >
                        <td style={{padding:'10px',fontWeight:m.key===currentMonthKey?700:500,color:m.key===currentMonthKey?C.green:C.text}}>
                          {isExpanded?'▼':'▶'} {m.label}
                          {m.key===currentMonthKey&&<span style={{fontSize:9,color:C.green,marginLeft:6,background:'rgba(0,229,160,0.15)',padding:'1px 5px',borderRadius:4}}>current</span>}
                        </td>
                        <td style={{padding:'10px',textAlign:'right',color:C.text}}>{m.meetings.length}</td>
                        <td style={{padding:'10px',textAlign:'right',color:C.green,fontWeight:600}}>${m.meetingTotal.toLocaleString()}</td>
                        <td style={{padding:'10px',textAlign:'right',color:C.text}}>{m.sqls.length}</td>
                        <td style={{padding:'10px',textAlign:'right',color:'#c084fc',fontWeight:600}}>${(m.sqlTotal - m.acceleratorTotal).toLocaleString()}</td>
                        <td style={{padding:'10px',textAlign:'right',color:m.acceleratorTotal>0?C.amber:C.text3,fontWeight:m.acceleratorTotal>0?600:400}}>{m.acceleratorTotal>0?`$${m.acceleratorTotal.toLocaleString()}`:'—'}</td>
                        {(()=>{
                          const adj=getMonthAdj(m.key,adjRepId)
                          const adjusted=m.total+adj
                          return <td style={{padding:'10px',textAlign:'right',fontWeight:700,color:C.text}}>
                            ${adjusted.toLocaleString()}
                            {adj!==0&&<div style={{fontSize:9,color:adj<0?C.red:C.green,fontWeight:600}}>{adj<0?'':'+'}{adj.toLocaleString()}</div>}
                          </td>
                        })()}
                        <td style={{padding:'10px',textAlign:'right',fontSize:10,color:C.text3}}>—</td>
                        <td style={{padding:'10px',textAlign:'right',fontSize:11,color:C.text2}}>{m.payoutMonth}</td>
                      </tr>
                      {/* ── Lead Attribution (expanded) ── */}
                      {isExpanded&&(
                        <tr><td colSpan={9} style={{padding:0}}>
                          <div style={{background:C.surface2,padding:'12px 16px',borderBottom:`1px solid ${C.border}`}}>
                            {m.meetings.length>0&&(
                              <div style={{marginBottom:m.sqls.length>0?12:0}}>
                                <div style={{fontSize:10,fontWeight:700,color:C.green,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>Meetings Booked ({m.meetings.length})</div>
                                {m.meetings.map((mt,i)=>(
                                  <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 8px',background:C.surface3,borderRadius:6,marginBottom:3,border:`1px solid ${C.border}`}}>
                                    <div>
                                      <span style={{fontSize:12,color:C.text,fontWeight:500}}>{mt.account}</span>
                                      <span style={{fontSize:10,color:C.text3,marginLeft:8}}>{new Date(mt.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
                                    </div>
                                    <span style={{fontSize:12,fontWeight:700,color:C.green}}>${mt.amount}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {m.sqls.length>0&&(
                              <div>
                                <div style={{fontSize:10,fontWeight:700,color:'#c084fc',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>SQLs ({m.sqls.length})</div>
                                {m.sqls.map((sq,i)=>(
                                  <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 8px',background:C.surface3,borderRadius:6,marginBottom:3,border:`1px solid ${C.border}`}}>
                                    <div>
                                      <span style={{fontSize:12,color:C.text,fontWeight:500}}>{sq.account}</span>
                                      <span style={{fontSize:10,color:C.text3,marginLeft:8}}>{new Date(sq.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
                                      {sq.accelerated&&<span style={{fontSize:9,color:C.amber,marginLeft:6,background:'rgba(245,166,35,0.15)',padding:'1px 5px',borderRadius:4,border:'1px solid rgba(245,166,35,0.3)'}}>ACCEL</span>}
                                    </div>
                                    <span style={{fontSize:12,fontWeight:700,color:sq.accelerated?C.amber:'#c084fc'}}>${sq.amount}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {m.meetings.length===0&&m.sqls.length===0&&(
                              <div style={{fontSize:11,color:C.text3}}>No commission events this month.</div>
                            )}
                          </div>
                        </td></tr>
                      )}
                    </React.Fragment>
                  )
                })}
                {commData.months.length===0&&(
                  <tr><td colSpan={9} style={{padding:'20px 10px',textAlign:'center',color:C.text3,fontSize:12}}>No commission data yet. Meetings and SQLs will appear here as they are recorded.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── YTD Totals — BDM only ── */}
          {isBdm&&<div style={{...card,marginBottom:20}}>
            <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:14}}>Year-to-Date · {now.getFullYear()}</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
              <div style={{background:C.surface3,border:`1px solid ${C.border}`,borderRadius:10,padding:14}}>
                <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>Meeting Bonuses</div>
                <div style={{fontSize:22,fontWeight:800,color:C.green}}>${commData.ytdMeetingTotal.toLocaleString()}</div>
                <div style={{marginTop:6}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:C.text3,marginBottom:3}}>
                    <span>{pct(commData.ytdMeetingTotal, ANNUAL_MEETING_CAP)}% of cap</span>
                    <span>${ANNUAL_MEETING_CAP.toLocaleString()}</span>
                  </div>
                  <div style={{height:4,borderRadius:2,background:C.surface}}>
                    <div style={{height:4,borderRadius:2,background:C.green,width:`${Math.min(100, commData.ytdMeetingTotal / ANNUAL_MEETING_CAP * 100)}%`,transition:'width 0.3s'}}/>
                  </div>
                </div>
              </div>
              <div style={{background:C.surface3,border:`1px solid ${C.border}`,borderRadius:10,padding:14}}>
                <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>SQL Bonuses</div>
                <div style={{fontSize:22,fontWeight:800,color:'#c084fc'}}>${commData.ytdSqlTotal.toLocaleString()}</div>
                <div style={{marginTop:6}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:C.text3,marginBottom:3}}>
                    <span>{pct(commData.ytdSqlTotal + commData.ytdAcceleratorTotal, ANNUAL_SQL_CAP)}% of cap</span>
                    <span>${ANNUAL_SQL_CAP.toLocaleString()}</span>
                  </div>
                  <div style={{height:4,borderRadius:2,background:C.surface}}>
                    <div style={{height:4,borderRadius:2,background:'#c084fc',width:`${Math.min(100, (commData.ytdSqlTotal + commData.ytdAcceleratorTotal) / ANNUAL_SQL_CAP * 100)}%`,transition:'width 0.3s'}}/>
                  </div>
                </div>
              </div>
              <div style={{background:C.surface3,border:`1px solid ${C.border}`,borderRadius:10,padding:14}}>
                <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>Accelerator Bonuses</div>
                <div style={{fontSize:22,fontWeight:800,color:C.amber}}>${commData.ytdAcceleratorTotal.toLocaleString()}</div>
                <div style={{fontSize:10,color:C.text3,marginTop:6}}>from months with &gt;3 SQLs</div>
              </div>
              {(()=>{
                const ytdAdj=getYtdAdj(adjRepId)
                const adjusted=commData.ytdGrandTotal+ytdAdj
                return <div style={{background:C.surface3,border:`1px solid ${C.border}`,borderRadius:10,padding:14}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>Total Variable Earned</div>
                  <div style={{fontSize:22,fontWeight:800,color:C.text}}>${adjusted.toLocaleString()}</div>
                  {ytdAdj!==0&&<div style={{fontSize:10,color:ytdAdj<0?C.red:C.green,marginTop:4,fontWeight:600}}>{ytdAdj<0?'':'+'}{ytdAdj.toLocaleString()} adjustments</div>}
                  <div style={{fontSize:10,color:C.text3,marginTop:ytdAdj!==0?2:6}}>calendar YTD commission</div>
                </div>
              })()}
            </div>
          </div>}

          {/* ── Manager View: All Reps Comparison — BDM only ── */}
          {isBdm&&(
            <div style={{...card,marginBottom:20}}>
              <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:14}}>Manager View · All Reps</div>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{borderBottom:`2px solid ${C.border2}`}}>
                    {['Rep','MTD Meetings','MTD Meeting $','MTD SQLs','MTD SQL $','MTD Total','YTD Total','YTD Meeting Cap','YTD SQL Cap'].map(h=>(
                      <th key={h} style={{padding:'8px 10px',textAlign:h==='Rep'?'left':'right',fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {managerRepData.map(({rep, months, ytdMeetingTotal, ytdSqlTotal, ytdAcceleratorTotal, ytdGrandTotal})=>{
                    const cm = months.find(m => m.key === currentMonthKey)
                    const mtdAdj = getMonthAdj(currentMonthKey, rep.id)
                    const repYtdAdj = getYtdAdj(rep.id)
                    return (
                      <tr key={rep.id} style={{borderBottom:`1px solid ${C.border}`}}>
                        <td style={{padding:'10px',fontWeight:600,color:C.text}}>{rep.name}</td>
                        <td style={{padding:'10px',textAlign:'right',color:C.text}}>{cm?.meetings.length ?? 0}</td>
                        <td style={{padding:'10px',textAlign:'right',color:C.green,fontWeight:600}}>${(cm?.meetingTotal ?? 0).toLocaleString()}</td>
                        <td style={{padding:'10px',textAlign:'right',color:C.text}}>{cm?.sqls.length ?? 0}</td>
                        <td style={{padding:'10px',textAlign:'right',color:'#c084fc',fontWeight:600}}>${(cm?.sqlTotal ?? 0).toLocaleString()}</td>
                        <td style={{padding:'10px',textAlign:'right',fontWeight:700,color:C.text}}>${((cm?.total ?? 0)+mtdAdj).toLocaleString()}{mtdAdj!==0&&<span style={{fontSize:9,color:mtdAdj<0?C.red:C.green,marginLeft:3}}>{mtdAdj<0?'':'+'}{mtdAdj}</span>}</td>
                        <td style={{padding:'10px',textAlign:'right',fontWeight:700,color:C.amber}}>${(ytdGrandTotal+repYtdAdj).toLocaleString()}{repYtdAdj!==0&&<span style={{fontSize:9,color:repYtdAdj<0?C.red:C.green,marginLeft:3}}>{repYtdAdj<0?'':'+'}{repYtdAdj}</span>}</td>
                        <td style={{padding:'10px',textAlign:'right',fontSize:11,color:ytdMeetingTotal>=ANNUAL_MEETING_CAP?C.red:C.text3}}>{pct(ytdMeetingTotal,ANNUAL_MEETING_CAP)}%</td>
                        <td style={{padding:'10px',textAlign:'right',fontSize:11,color:(ytdSqlTotal+ytdAcceleratorTotal)>=ANNUAL_SQL_CAP?C.red:C.text3}}>{pct(ytdSqlTotal+ytdAcceleratorTotal,ANNUAL_SQL_CAP)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Adjustments Log ── */}
          {isBdm&&commAdjustments.length>0&&(
            <div style={{...card,marginBottom:20}}>
              <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:14}}>Commission Adjustments</div>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{borderBottom:`2px solid ${C.border2}`}}>
                    {['Month','Rep','Amount','Reason','Date',''].map(h=>(
                      <th key={h} style={{padding:'8px 10px',textAlign:h==='Amount'?'right':'left',fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...commAdjustments].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(adj=>{
                    const repName=adj.repId==='all'?'All Reps':reps.find(r=>r.id===adj.repId)?.name||adj.repId
                    const [y,mo]=adj.month.split('-').map(Number)
                    const monthLabel=new Date(y,mo-1).toLocaleString('en-US',{month:'short',year:'numeric'})
                    return (
                      <tr key={adj.id} style={{borderBottom:`1px solid ${C.border}`}}>
                        <td style={{padding:'8px 10px',color:C.text2}}>{monthLabel}</td>
                        <td style={{padding:'8px 10px',color:C.text}}>{repName}</td>
                        <td style={{padding:'8px 10px',textAlign:'right',fontWeight:700,color:adj.amount<0?C.red:C.green}}>{adj.amount<0?'−':'+'} ${Math.abs(adj.amount).toLocaleString()}</td>
                        <td style={{padding:'8px 10px',color:C.text3,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{adj.reason||'—'}</td>
                        <td style={{padding:'8px 10px',color:C.text3,fontSize:10}}>{new Date(adj.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</td>
                        <td style={{padding:'8px 10px'}}>
                          <div style={{display:'flex',gap:4}}>
                            <button onClick={()=>{setEditingAdj({...adj});setShowAdjModal(true)}} style={{fontSize:10,fontWeight:600,padding:'3px 7px',borderRadius:4,border:`1px solid ${C.border2}`,background:'transparent',color:C.purpleL,cursor:'pointer'}}>Edit</button>
                            <button onClick={()=>saveAdj(commAdjustments.filter(a=>a.id!==adj.id),'Deleted adjustment')} style={{fontSize:10,fontWeight:600,padding:'3px 7px',borderRadius:4,border:`1px solid ${C.red}`,background:'transparent',color:C.red,cursor:'pointer'}}>✕</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Adjustment Modal ── */}
          {showAdjModal&&isBdm&&editingAdj&&(
            <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>{setShowAdjModal(false);setEditingAdj(null)}}>
              <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:28,width:400}} onClick={e=>e.stopPropagation()}>
                <div style={{fontSize:16,fontWeight:800,marginBottom:20}}>Commission Adjustment</div>
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:4}}>Rep</div>
                  <select value={editingAdj.repId} onChange={e=>setEditingAdj({...editingAdj,repId:e.target.value})}
                    style={{width:'100%',padding:'8px 10px',borderRadius:6,border:`1px solid ${C.border2}`,background:C.surface2,color:C.text,fontSize:12,outline:'none',appearance:'none' as const}}>
                    <option value="all">All Reps</option>
                    {reps.filter(r=>r.slackId).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:4}}>Month</div>
                    <input type="month" value={editingAdj.month} onChange={e=>setEditingAdj({...editingAdj,month:e.target.value})}
                      style={{width:'100%',padding:'8px 10px',borderRadius:6,border:`1px solid ${C.border2}`,background:C.surface2,color:C.text,fontSize:12,outline:'none',colorScheme:'dark',boxSizing:'border-box'}}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:4}}>Amount ($)</div>
                    <input type="number" value={editingAdj.amount||''} onChange={e=>setEditingAdj({...editingAdj,amount:parseFloat(e.target.value)||0})} placeholder="-620"
                      style={{width:'100%',padding:'8px 10px',borderRadius:6,border:`1px solid ${C.border2}`,background:C.surface2,color:C.text,fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                    <div style={{fontSize:9,color:C.text3,marginTop:3}}>Negative to redact (e.g. -620), positive to add</div>
                  </div>
                </div>
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:4}}>Reason</div>
                  <textarea value={editingAdj.reason} onChange={e=>setEditingAdj({...editingAdj,reason:e.target.value})} placeholder="e.g. SQL overpayment redacted per RevOps"
                    rows={3}
                    style={{width:'100%',padding:'8px 10px',borderRadius:6,border:`1px solid ${C.border2}`,background:C.surface2,color:C.text,fontSize:12,outline:'none',boxSizing:'border-box',resize:'vertical',minHeight:60,fontFamily:'inherit',lineHeight:1.5}}/>
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>{
                    const isNew=!commAdjustments.some(a=>a.id===editingAdj.id)
                    const updated=isNew?[...commAdjustments,editingAdj]:commAdjustments.map(a=>a.id===editingAdj.id?editingAdj:a)
                    saveAdj(updated,isNew?'Added adjustment':'Edited adjustment')
                    setShowAdjModal(false);setEditingAdj(null)
                  }} style={{flex:1,padding:'8px',borderRadius:6,border:'none',background:C.green,color:C.bg,fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    Save Adjustment
                  </button>
                  <button onClick={()=>{setShowAdjModal(false);setEditingAdj(null)}} style={{padding:'8px 14px',borderRadius:6,border:`1px solid ${C.border2}`,background:'transparent',color:C.text3,fontSize:12,cursor:'pointer'}}>Cancel</button>
                </div>
              </div>
            </div>
          )}
          </>)
        })()}


        {/* ══════════════════════════════════════════════════════
            LEADERBOARD VIEW
        ══════════════════════════════════════════════════════ */}
        {view==='leaderboard'&&(()=>{
          const LB_METRIC_LABELS: Record<LbMetric,string> = { meetings:'Meetings Booked', meetings_held:'Meetings Held', sqls:'SQLs', sqos:'SQOs' }
          const LB_PERIOD_LABELS: Record<LbPeriod,string> = { today:'Today', week:'This Week', month:'This Month', quarter:'This Quarter', year:'This Year', all:'All Time' }

          // Period range
          const now = new Date()
          const getPeriodRange = (p: LbPeriod): { start: Date; end: Date } => {
            const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
            let start = new Date('2020-01-01')
            if (p === 'today') { start = new Date(now.getFullYear(), now.getMonth(), now.getDate()) }
            else if (p === 'week') { start = new Date(now); start.setDate(now.getDate() - now.getDay()); start.setHours(0,0,0,0) }
            else if (p === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1) }
            else if (p === 'quarter') { start = new Date(now.getFullYear(), Math.floor(now.getMonth()/3)*3, 1) }
            else if (p === 'year') { start = new Date(now.getFullYear(), 0, 1) }
            return { start, end }
          }

          const { start: lbStart, end: lbEnd } = getPeriodRange(lbPeriod)
          const inLbRange = (dateStr: string | undefined) => {
            if (!dateStr) return false
            const d = new Date(dateStr)
            return !isNaN(d.getTime()) && d >= lbStart && d <= lbEnd
          }

          // Count metric for a set of leads
          // Use HISTORICAL_DETAILS fallback to match pipeline behavior
          const getDet = (email: string) => details[email] || (HISTORICAL_DETAILS[email] ? {...EMPTY_DETAIL,...HISTORICAL_DETAILS[email]} : null)
          const getDateProxy = (l: AppLead, det: LeadDetail | null) => det?.meetingDate || l.receivedAt || l.date || null
          const BOOKED_STATUSES = new Set(['booked','inprogress','closedwon'])

          const countMetric = (leads: AppLead[], metric: LbMetric): number => {
            switch (metric) {
              case 'meetings':
                return leads.filter(l => {
                  const det = getDet(l.email)
                  const s = statuses[l.email] || 'new'
                  // A lead counts as a meeting if it has a meetingDate OR is in a booked status
                  const isMeeting = det?.meetingDate || BOOKED_STATUSES.has(s)
                  if (!isMeeting) return false
                  // Use meetingDate for time range, fall back to receivedAt/date
                  const rangeDate = det?.meetingDate || getDateProxy(l, det)
                  return rangeDate ? inLbRange(rangeDate) : false
                }).length
              case 'meetings_held':
                return leads.filter(l => {
                  const det = getDet(l.email)
                  const s = statuses[l.email] || 'new'
                  const isMeeting = det?.meetingDate || BOOKED_STATUSES.has(s)
                  if (!isMeeting) return false
                  const rangeDate = det?.meetingDate || getDateProxy(l, det)
                  if (!rangeDate || !inLbRange(rangeDate)) return false
                  // Must be in the past to count as "held"
                  const md = new Date(det?.meetingDate || rangeDate)
                  if (md > now) return false
                  return BOOKED_STATUSES.has(s) || (det?.sqlDq||'').toLowerCase()==='yes'
                }).length
              case 'sqls':
                return leads.filter(l => {
                  const det = getDet(l.email)
                  if ((det?.sqlDq||'').toLowerCase()!=='yes') return false
                  // Use sqlDate, fall back to meetingDate, then receivedAt/date
                  const rangeDate = det?.sqlDate || det?.meetingDate || getDateProxy(l, det)
                  return rangeDate ? inLbRange(rangeDate) : true // if no date at all, still count
                }).length
              case 'sqos':
                return leads.filter(l => {
                  const det = getDet(l.email)
                  if ((det?.sqo||'').toLowerCase()!=='yes') return false
                  // Use sqoDate, fall back to sqlDate, meetingDate, receivedAt/date
                  const rangeDate = det?.sqoDate || det?.sqlDate || det?.meetingDate || getDateProxy(l, det)
                  return rangeDate ? inLbRange(rangeDate) : true
                }).length
            }
          }

          // Build leaderboard rows for all reps
          // Use all data (historical + live + manual) unfiltered by current rep
          const allLeadsUnfiltered: AppLead[] = [
            ...HISTORICAL_LEADS,
            ...manualLeads.filter(l => !HISTORICAL_LEADS.some(h => h.email === l.email)),
            ...liveLeads.filter(l => !HISTORICAL_LEADS.some(h => h.email === l.email) && !manualLeads.some(m => m.email === l.email) && !new Set(HISTORICAL_LEADS.map(h=>h.domain)).has(l.domain)),
          ].filter(l => !deletedEmails.has(l.email))

          const activeMetrics = Array.from(lbMetrics)
          const lbRows = reps
            .filter(r => r.slackId)
            .map(rep => {
              const repLeads = rep.id === 'jonathan'
                ? allLeadsUnfiltered.filter(l => !l.repSlackId || l.repSlackId === rep.slackId)
                : allLeadsUnfiltered.filter(l => l.repSlackId === rep.slackId)
              const perMetric: Record<LbMetric, number> = { meetings:0, meetings_held:0, sqls:0, sqos:0 }
              for (const m of activeMetrics) perMetric[m] = countMetric(repLeads, m)
              const total = activeMetrics.reduce((s, m) => s + perMetric[m], 0)
              return { rep, perMetric, total }
            })
            .sort((a, b) => b.total - a.total)

          const maxCount = Math.max(1, ...lbRows.map(r => r.total))
          const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32']
          const currentRepId = auth?.role === 'rep' ? (auth as {role:'rep';repId:string}).repId : null

          // Active spiff
          const todayStr = now.toISOString().split('T')[0]
          const activeSpiff = spiffs.find(s => s.active && s.startDate <= todayStr && s.endDate >= todayStr) || null

          // Spiff save helper
          const saveSpiffs = (updated: Spiff[]) => {
            setSpiffs(updated)
            localStorage.setItem('mql-spiffs', JSON.stringify(updated))
            syncToEdgeConfig()
          }

          // Spiff progress per rep
          const spiffLeaderProgress = activeSpiff ? lbRows
            .map(r => {
              const repLeads = r.rep.id === 'jonathan'
                ? allLeadsUnfiltered.filter(l => !l.repSlackId || l.repSlackId === r.rep.slackId)
                : allLeadsUnfiltered.filter(l => l.repSlackId === r.rep.slackId)
              // Use spiff date range
              const spiffStart = new Date(activeSpiff.startDate)
              const spiffEnd = new Date(activeSpiff.endDate + 'T23:59:59')
              const inSpiffRange = (dateStr: string | undefined) => {
                if (!dateStr) return false
                const d = new Date(dateStr)
                return !isNaN(d.getTime()) && d >= spiffStart && d <= spiffEnd
              }
              let count = 0
              const m = activeSpiff.metric
              if (m === 'meetings') count = repLeads.filter(l => { const det=getDet(l.email); const s=statuses[l.email]||'new'; const isMtg=det?.meetingDate||BOOKED_STATUSES.has(s); if(!isMtg) return false; const rd=det?.meetingDate||getDateProxy(l,det); return rd?inSpiffRange(rd):false }).length
              else if (m === 'meetings_held') count = repLeads.filter(l => { const det=getDet(l.email); const s=statuses[l.email]||'new'; const isMtg=det?.meetingDate||BOOKED_STATUSES.has(s); if(!isMtg) return false; const rd=det?.meetingDate||getDateProxy(l,det); if(!rd||!inSpiffRange(rd)) return false; if(new Date(det?.meetingDate||rd)>now) return false; return BOOKED_STATUSES.has(s)||(det?.sqlDq||'').toLowerCase()==='yes' }).length
              else if (m === 'sqls') count = repLeads.filter(l => { const det=getDet(l.email); if((det?.sqlDq||'').toLowerCase()!=='yes') return false; const rd=det?.sqlDate||det?.meetingDate||getDateProxy(l,det); return rd?inSpiffRange(rd):true }).length
              else if (m === 'sqos') count = repLeads.filter(l => { const det=getDet(l.email); if((det?.sqo||'').toLowerCase()!=='yes') return false; const rd=det?.sqoDate||det?.sqlDate||det?.meetingDate||getDateProxy(l,det); return rd?inSpiffRange(rd):true }).length
              return { rep: r.rep, count }
            })
            .sort((a,b) => b.count - a.count)
            : []

          return (<>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:16,marginBottom:activeSpiff?0:28}}>
              <div>
                <div style={{fontSize:26,fontWeight:800,letterSpacing:'-0.02em',lineHeight:1.15}}>Leaderboard<br/><span style={{color:C.green}}>Rankings.</span></div>
                <div style={{fontSize:12,color:C.text3,marginTop:4}}>Rep performance rankings · spiff challenges</div>
              </div>
              {isManagerRole(auth)&&(
                <button onClick={()=>{setEditingSpiff(null);setShowSpiffModal(true)}} style={{fontSize:11,fontWeight:700,padding:'8px 14px',borderRadius:8,border:`1px solid ${C.border2}`,background:C.surface,color:C.text2,cursor:'pointer'}}>
                  Manage Spiffs
                </button>
              )}
            </div>

            {/* ── Active Spiff Banner ── */}
            {activeSpiff&&(
              <div style={{background:'linear-gradient(135deg, rgba(123,110,246,0.25) 0%, rgba(96,165,250,0.2) 100%)',border:`1px solid rgba(123,110,246,0.35)`,borderRadius:14,padding:'18px 22px',marginBottom:20,marginTop:16}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:800,color:C.text,display:'flex',alignItems:'center',gap:6}}>🎯 {activeSpiff.title}</div>
                    <div style={{fontSize:12,color:C.text2,marginTop:3}}>{activeSpiff.description}</div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em'}}>Reward</div>
                    <div style={{fontSize:14,fontWeight:800,color:C.green,marginTop:2}}>{activeSpiff.reward}</div>
                  </div>
                </div>
                <div style={{display:'flex',gap:16,alignItems:'center',fontSize:11,color:C.text3,marginBottom:10}}>
                  <span>{LB_METRIC_LABELS[activeSpiff.metric]} · Target: <strong style={{color:C.text}}>{activeSpiff.target}</strong></span>
                  <span>{new Date(activeSpiff.startDate).toLocaleDateString('en-US',{month:'short',day:'numeric'})} – {new Date(activeSpiff.endDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>
                </div>
                {/* Leader progress */}
                {spiffLeaderProgress.length>0&&(
                  <div style={{display:'grid',gap:5}}>
                    {spiffLeaderProgress.slice(0,4).map((r,i)=>{
                      const pctDone = Math.min(100, r.count / activeSpiff.target * 100)
                      const isCurrentUser = r.rep.id === currentRepId
                      return (
                        <div key={r.rep.id} style={{display:'flex',alignItems:'center',gap:10}}>
                          <div style={{width:80,fontSize:11,fontWeight:isCurrentUser?700:500,color:isCurrentUser?C.green:C.text2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{i===0?'👑 ':''}{r.rep.name.split(' ')[0]}</div>
                          <div style={{flex:1,height:6,borderRadius:3,background:'rgba(255,255,255,0.08)'}}>
                            <div style={{height:6,borderRadius:3,background:i===0?C.green:isCurrentUser?C.purpleL:C.purple,width:`${pctDone}%`,transition:'width 0.4s ease'}}/>
                          </div>
                          <div style={{width:50,fontSize:11,fontWeight:600,color:i===0?C.green:C.text2,textAlign:'right'}}>{r.count}/{activeSpiff.target}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Metric Tabs (multi-select) ── */}
            <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
              {(['meetings','meetings_held','sqls','sqos'] as LbMetric[]).map(m=>(
                <div key={m} style={filterPill(lbMetrics.has(m))} onClick={()=>setLbMetrics(prev=>{
                  const next=new Set(prev)
                  if(next.has(m)){ if(next.size>1) next.delete(m) } else next.add(m)
                  return next
                })}>{LB_METRIC_LABELS[m]}</div>
              ))}
            </div>

            {/* ── Period Toggles ── */}
            <div style={{display:'flex',gap:6,marginBottom:20,flexWrap:'wrap'}}>
              {(['today','week','month','quarter','year','all'] as LbPeriod[]).map(p=>(
                <div key={p} style={filterPill(lbPeriod===p,C.green)} onClick={()=>setLbPeriod(p)}>{LB_PERIOD_LABELS[p]}</div>
              ))}
            </div>

            {/* ── Leaderboard Table ── */}
            <div style={card}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead>
                  <tr style={{borderBottom:`2px solid ${C.border2}`}}>
                    <th style={{padding:'10px 12px',textAlign:'left',fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',width:50}}>Rank</th>
                    <th style={{padding:'10px 12px',textAlign:'left',fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em'}}>Rep</th>
                    {activeMetrics.map(m=>(
                      <th key={m} style={{padding:'10px 12px',textAlign:'right',fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',width:80}}>{LB_METRIC_LABELS[m]}</th>
                    ))}
                    {activeMetrics.length>1&&<th style={{padding:'10px 12px',textAlign:'right',fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',width:70}}>Total</th>}
                    <th style={{padding:'10px 12px',fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',width:'30%'}}></th>
                  </tr>
                </thead>
                <tbody>
                  {lbRows.map((row,i)=>{
                    const rank = i + 1
                    const isCurrentUser = row.rep.id === currentRepId
                    const medalColor = rank<=3 ? medalColors[rank-1] : undefined
                    return (
                      <tr key={row.rep.id} style={{
                        borderBottom:`1px solid ${C.border}`,
                        background: isCurrentUser ? 'rgba(123,110,246,0.12)' : rank===1 ? 'rgba(255,215,0,0.04)' : 'transparent',
                        transition: 'background 0.3s ease',
                      }}>
                        <td style={{padding:'12px',fontWeight:800,fontSize:16,color:medalColor||C.text3,textAlign:'center'}}>
                          {rank===1?'👑 ':''}{rank<=3?<span style={{color:medalColor}}>#{rank}</span>:<span>#{rank}</span>}
                        </td>
                        <td style={{padding:'12px',fontWeight:isCurrentUser?700:500,color:isCurrentUser?C.purpleL:C.text}}>
                          {row.rep.name}
                          {isCurrentUser&&<span style={{fontSize:9,color:C.purpleL,marginLeft:6,background:'rgba(123,110,246,0.15)',padding:'1px 5px',borderRadius:4}}>you</span>}
                        </td>
                        {activeMetrics.map(m=>(
                          <td key={m} style={{padding:'12px',textAlign:'right',fontWeight:activeMetrics.length===1?800:600,fontSize:activeMetrics.length===1?18:14,color:activeMetrics.length===1?(rank===1?'#FFD700':rank===2?'#C0C0C0':rank===3?'#CD7F32':C.text):C.text2}}>{row.perMetric[m]}</td>
                        ))}
                        {activeMetrics.length>1&&<td style={{padding:'12px',textAlign:'right',fontWeight:800,fontSize:18,color:rank===1?'#FFD700':rank===2?'#C0C0C0':rank===3?'#CD7F32':C.text}}>{row.total}</td>}
                        <td style={{padding:'12px 16px'}}>
                          <div style={{height:8,borderRadius:4,background:C.surface3,overflow:'hidden'}}>
                            <div style={{
                              height:8,borderRadius:4,
                              background: rank===1?'linear-gradient(90deg,#FFD700,#f5a623)':rank===2?'linear-gradient(90deg,#C0C0C0,#a0a0a0)':rank===3?'linear-gradient(90deg,#CD7F32,#b06c2a)':C.purple,
                              width:`${maxCount>0?(row.total/maxCount*100):0}%`,
                              transition:'width 0.4s ease',
                            }}/>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {lbRows.length===0&&(
                    <tr><td colSpan={3+activeMetrics.length+(activeMetrics.length>1?1:0)} style={{padding:'24px',textAlign:'center',color:C.text3,fontSize:12}}>No reps with Slack IDs configured. Add reps in manager mode to see rankings.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>)
        })()}

        {/* ── Spiff Management Modal ── */}
        {showSpiffModal&&isManagerRole(auth)&&(
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>{setShowSpiffModal(false);setEditingSpiff(null)}}>
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:28,width:480,maxHeight:'85vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
              <div style={{fontSize:16,fontWeight:800,marginBottom:20}}>Manage Spiff Challenges</div>

              {/* Existing spiffs list */}
              {spiffs.length>0&&!editingSpiff&&(
                <div style={{marginBottom:16}}>
                  {spiffs.map(s=>(
                    <div key={s.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 12px',background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,marginBottom:6}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:C.text,display:'flex',alignItems:'center',gap:6}}>
                          {s.title}
                          <span style={{fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:4,
                            background:s.active&&s.startDate<=new Date().toISOString().split('T')[0]&&s.endDate>=new Date().toISOString().split('T')[0]?'rgba(0,229,160,0.15)':s.active?'rgba(245,166,35,0.15)':'rgba(255,255,255,0.06)',
                            color:s.active&&s.startDate<=new Date().toISOString().split('T')[0]&&s.endDate>=new Date().toISOString().split('T')[0]?C.green:s.active?C.amber:C.text3,
                            border:`1px solid ${s.active?'rgba(0,229,160,0.3)':'rgba(255,255,255,0.1)'}`,
                          }}>{s.active&&s.startDate<=new Date().toISOString().split('T')[0]&&s.endDate>=new Date().toISOString().split('T')[0]?'LIVE':s.active?'SCHEDULED':'INACTIVE'}</span>
                        </div>
                        <div style={{fontSize:11,color:C.text3,marginTop:2}}>{s.startDate} → {s.endDate} · {s.reward}</div>
                      </div>
                      <div style={{display:'flex',gap:4,flexShrink:0}}>
                        <button onClick={()=>setEditingSpiff({...s})} style={{fontSize:10,fontWeight:600,padding:'4px 8px',borderRadius:5,border:`1px solid ${C.border2}`,background:'transparent',color:C.purpleL,cursor:'pointer'}}>Edit</button>
                        <button onClick={()=>{
                          const updated = spiffs.map(x=>x.id===s.id?{...x,active:!x.active}:x)
                          setSpiffs(updated); localStorage.setItem('mql-spiffs',JSON.stringify(updated)); syncToEdgeConfig()
                        }} style={{fontSize:10,fontWeight:600,padding:'4px 8px',borderRadius:5,border:`1px solid ${C.border2}`,background:'transparent',color:s.active?C.amber:C.green,cursor:'pointer'}}>{s.active?'Deactivate':'Activate'}</button>
                        <button onClick={()=>{
                          if(!window.confirm(`Delete "${s.title}"?`)) return
                          const updated = spiffs.filter(x=>x.id!==s.id)
                          setSpiffs(updated); localStorage.setItem('mql-spiffs',JSON.stringify(updated)); syncToEdgeConfig()
                        }} style={{fontSize:10,fontWeight:600,padding:'4px 8px',borderRadius:5,border:`1px solid ${C.red}`,background:'transparent',color:C.red,cursor:'pointer'}}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Create / Edit form */}
              {editingSpiff!==null?(()=>{
                const sp = editingSpiff!
                const isNew = !spiffs.some(s=>s.id===sp.id)
                return (
                  <div>
                    <div style={{fontSize:13,fontWeight:700,marginBottom:12,color:C.text2}}>{isNew?'New Spiff':'Edit Spiff'}</div>
                    {([
                      ['Title','title','text','Q2 SQL Sprint'] as const,
                      ['Description','description','text','First to hit target wins!'] as const,
                      ['Reward','reward','text','$200 Amazon gift card'] as const,
                    ]).map(([label,field,type,placeholder])=>(
                      <div key={field} style={{marginBottom:10}}>
                        <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:4}}>{label}</div>
                        <input value={(sp as any)[field]} onChange={e=>setEditingSpiff({...sp,[field]:e.target.value})} placeholder={placeholder} type={type}
                          style={{width:'100%',padding:'8px 10px',borderRadius:6,border:`1px solid ${C.border2}`,background:C.surface2,color:C.text,fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                      </div>
                    ))}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                      <div>
                        <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:4}}>Metric</div>
                        <select value={sp.metric} onChange={e=>setEditingSpiff({...sp,metric:e.target.value as LbMetric})}
                          style={{width:'100%',padding:'8px 10px',borderRadius:6,border:`1px solid ${C.border2}`,background:C.surface2,color:C.text,fontSize:12,outline:'none',appearance:'none' as const}}>
                          <option value="meetings">Meetings Booked</option>
                          <option value="meetings_held">Meetings Held</option>
                          <option value="sqls">SQLs</option>
                          <option value="sqos">SQOs</option>
                        </select>
                      </div>
                      <div>
                        <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:4}}>Target Number</div>
                        <input type="number" value={sp.target||''} onChange={e=>setEditingSpiff({...sp,target:parseInt(e.target.value)||0})} placeholder="5"
                          style={{width:'100%',padding:'8px 10px',borderRadius:6,border:`1px solid ${C.border2}`,background:C.surface2,color:C.text,fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                      </div>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
                      <div>
                        <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:4}}>Start Date</div>
                        <input type="date" value={sp.startDate} onChange={e=>setEditingSpiff({...sp,startDate:e.target.value})}
                          style={{width:'100%',padding:'8px 10px',borderRadius:6,border:`1px solid ${C.border2}`,background:C.surface2,color:C.text,fontSize:12,outline:'none',colorScheme:'dark',boxSizing:'border-box'}}/>
                      </div>
                      <div>
                        <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:4}}>End Date</div>
                        <input type="date" value={sp.endDate} onChange={e=>setEditingSpiff({...sp,endDate:e.target.value})}
                          style={{width:'100%',padding:'8px 10px',borderRadius:6,border:`1px solid ${C.border2}`,background:C.surface2,color:C.text,fontSize:12,outline:'none',colorScheme:'dark',boxSizing:'border-box'}}/>
                      </div>
                    </div>
                    <div style={{display:'flex',gap:8}}>
                      <button onClick={()=>{
                        const updated = isNew ? [...spiffs, {...sp, active:true}] : spiffs.map(s=>s.id===sp.id?sp:s)
                        setSpiffs(updated); localStorage.setItem('mql-spiffs',JSON.stringify(updated)); syncToEdgeConfig()
                        setEditingSpiff(null)
                      }} style={{flex:1,padding:'8px',borderRadius:6,border:'none',background:C.green,color:C.bg,fontSize:12,fontWeight:700,cursor:'pointer'}}>
                        {isNew?'Create Spiff':'Save Changes'}
                      </button>
                      <button onClick={()=>setEditingSpiff(null)} style={{padding:'8px 14px',borderRadius:6,border:`1px solid ${C.border2}`,background:'transparent',color:C.text3,fontSize:12,cursor:'pointer'}}>Cancel</button>
                    </div>
                  </div>
                )
              })():(
                <button onClick={()=>setEditingSpiff({id:`spiff-${Date.now()}`,title:'',description:'',metric:'sqls',target:5,reward:'',startDate:'',endDate:'',createdBy:currentRep?.id||'',active:true})}
                  style={{width:'100%',padding:'10px',borderRadius:8,border:`1px dashed ${C.border2}`,background:'transparent',color:C.purpleL,fontSize:12,fontWeight:600,cursor:'pointer'}}>
                  + Create New Spiff
                </button>
              )}

              <div style={{marginTop:16,display:'flex',justifyContent:'flex-end'}}>
                <button onClick={()=>{setShowSpiffModal(false);setEditingSpiff(null)}} style={{padding:'8px 16px',borderRadius:6,border:`1px solid ${C.border2}`,background:'transparent',color:C.text3,fontSize:12,cursor:'pointer'}}>Close</button>
              </div>
            </div>
          </div>
        )}


        {/* ══════════════════════════════════════════════════════
            REVOPS COMMISSIONS VIEW
        ══════════════════════════════════════════════════════ */}
        {view==='revops_commissions'&&(()=>{
          const MEETING_BONUS = 150
          const SQL_BONUS = 620
          const SQL_ACCELERATOR = 930
          const SQL_ACCELERATOR_THRESHOLD = 3
          const ANNUAL_SQL_CAP = 22320
          const ANNUAL_MEETING_CAP = 18000
          const isIcp = (email: string): boolean => {
            const det = details[email]
            const tier = det?.accountTier || ''
            if (tier) return tier === 'A' || tier === 'B' || tier === 'E'
            return (det?.mqlQuality || '') === 'hq'
          }

          // Use ALL leads unfiltered (revops needs full picture)
          const allLeadsUnfiltered: AppLead[] = [
            ...HISTORICAL_LEADS,
            ...manualLeads.filter(l => !HISTORICAL_LEADS.some(h => h.email === l.email)),
            ...liveLeads.filter(l => !HISTORICAL_LEADS.some(h => h.email === l.email) && !manualLeads.some(m => m.email === l.email) && !new Set(HISTORICAL_LEADS.map(h=>h.domain)).has(l.domain)),
          ].filter(l => !deletedEmails.has(l.email))

          // Reference the same commission overrides used by the Commissions Tracker
          // (defined inside the commissions IIFE — we access it via a module-level ref)
          const mkPayoutLabelRO=(mk:string)=>{const [y,m]=mk.split('-').map(Number);return `${new Date(y,m,1).toLocaleString('en-US',{month:'short',year:'numeric'})} (2nd half)`}
          const OVERRIDE_MONTHS = new Set(['2025-09','2025-10','2025-11','2025-12','2026-01','2026-02','2026-03'])

          type RevOpsEvent = { email:string; account:string; meetingDate:string|null; sqlDate:string|null; sqoDate:string|null; mqlQuality:string; accountTier:string; sourceChannel:string; ae:string; acv:string; isMeeting:boolean; isSql:boolean; amount:number; sfUrl:string; gongUrl:string }

          // Build per-rep data — use frozen overrides for override months, dynamic for others
          const repData = reps.filter(r=>r.slackId).map(rep => {
            const repLeads = rep.id === 'jonathan'
              ? allLeadsUnfiltered.filter(l => !l.repSlackId || l.repSlackId === rep.slackId)
              : allLeadsUnfiltered.filter(l => l.repSlackId === rep.slackId)

            // Dynamic events — only for non-override months
            // Requirement: discovery must be held (meetingDate in the past) AND AE assigned
            const events: RevOpsEvent[] = []
            const nowTs = new Date()
            repLeads.forEach(l => {
              const det = details[l.email] || (HISTORICAL_DETAILS[l.email] ? {...EMPTY_DETAIL,...HISTORICAL_DETAILS[l.email]} : null)
              if (!det) return
              // Must have AE assigned
              if (!det.ae) return
              // Must have discovery held: meetingDate exists AND is in the past
              if (!det.meetingDate) return
              const meetDt = new Date(det.meetingDate)
              if (meetDt > nowTs) return
              const displayName = nameOverrides[l.email] || l.account || formatDomain(l.domain) || l.email
              const hasMeeting = isIcp(l.email)
              const hasSql = (det.sqlDq||'').toLowerCase()==='yes' && !!det.sqlDate && isIcp(l.email)
              if (!hasMeeting && !hasSql) return
              // Check if this event falls in an override month — skip if so
              const meetMonth = `${meetDt.getFullYear()}-${String(meetDt.getMonth()+1).padStart(2,'0')}`
              const sqlMonth = det.sqlDate ? `${new Date(det.sqlDate).getFullYear()}-${String(new Date(det.sqlDate).getMonth()+1).padStart(2,'0')}` : ''
              const meetingInOverride = OVERRIDE_MONTHS.has(meetMonth)
              const sqlInOverride = sqlMonth && OVERRIDE_MONTHS.has(sqlMonth)
              const effectiveMeeting = hasMeeting && !meetingInOverride
              const effectiveSql = hasSql && !sqlInOverride
              if (!effectiveMeeting && !effectiveSql) return
              let amount = 0
              if (effectiveMeeting) amount += MEETING_BONUS
              if (effectiveSql) amount += SQL_BONUS
              events.push({
                email: l.email, account: displayName,
                meetingDate: effectiveMeeting ? det.meetingDate : null,
                sqlDate: effectiveSql ? det.sqlDate : null,
                sqoDate: det.sqoDate||null,
                mqlQuality: det.mqlQuality||'', accountTier: det.accountTier||'', sourceChannel: det.sourceChannel||'', ae: det.ae||'', acv: det.acv||'',
                isMeeting: effectiveMeeting, isSql: effectiveSql, amount,
                sfUrl: det.sfLink || l.sfUrl || '', gongUrl: det.gongUrl || '',
              })
            })

            // Inject frozen override events (only for Jonathan since overrides are his data)
            if (rep.id === 'jonathan') {
              OVERRIDE_MONTHS.forEach(mk => {
                // Use the same override data as the Commissions Tracker
                // We inline the frozen data reference here
                const overrideData = getCommissionOverride(mk)
                if (!overrideData) return
                overrideData.meetings.forEach(m => {
                  events.push({ email:m.email, account:m.account, meetingDate:m.date, sqlDate:null, sqoDate:null, mqlQuality:'hq', accountTier:'', sourceChannel:'', ae:'', acv:'', isMeeting:true, isSql:false, amount:m.amount, sfUrl:'', gongUrl:'' })
                })
                overrideData.sqls.forEach(s => {
                  events.push({ email:s.email, account:s.account, meetingDate:null, sqlDate:s.date, sqoDate:null, mqlQuality:'hq', accountTier:'', sourceChannel:'', ae:'', acv:'', isMeeting:false, isSql:true, amount:s.amount, sfUrl:'', gongUrl:'' })
                })
              })
            }

            // Monthly totals
            const monthMap = new Map<string,{meetings:number;sqls:number;meetingAmt:number;sqlAmt:number;accelAmt:number}>()
            events.forEach(e => {
              if (e.isMeeting && e.meetingDate) {
                const d = new Date(e.meetingDate)
                const mk = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
                if (!monthMap.has(mk)) monthMap.set(mk,{meetings:0,sqls:0,meetingAmt:0,sqlAmt:0,accelAmt:0})
                const m=monthMap.get(mk)!; m.meetings++; m.meetingAmt+=e.amount
              }
              if (e.isSql && e.sqlDate) {
                const d = new Date(e.sqlDate)
                const mk = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
                if (!monthMap.has(mk)) monthMap.set(mk,{meetings:0,sqls:0,meetingAmt:0,sqlAmt:0,accelAmt:0})
                const m=monthMap.get(mk)!; m.sqls++; m.sqlAmt+=e.amount
              }
            })

            const currentYear = new Date().getFullYear()
            const ytdEvents = events.filter(e=>{const d=e.meetingDate||e.sqlDate;return d&&new Date(d).getFullYear()===currentYear})
            const ytdMeetings = ytdEvents.filter(e=>e.isMeeting).length
            const ytdSqls = ytdEvents.filter(e=>e.isSql).length
            const ytdMeetingAmt = ytdEvents.filter(e=>e.isMeeting).reduce((s,e)=>s+e.amount,0)
            const ytdSqlAmt = ytdEvents.filter(e=>e.isSql).reduce((s,e)=>s+e.amount,0)
            const ytdAccelAmt = 0 // included in sqlAmt from overrides
            const ytdTotal = ytdMeetingAmt + ytdSqlAmt

            return { rep, events, monthMap, ytdMeetings, ytdSqls, ytdMeetingAmt, ytdSqlAmt, ytdAccelAmt, ytdTotal }
          })

          const filteredRepData = revopsSelectedRep === 'all' ? repData : repData.filter(r => r.rep.id === revopsSelectedRep)

          // All events for the detail table
          const allEvents = filteredRepData.flatMap(r => r.events.map(e => ({ ...e, repName: r.rep.name, repId: r.rep.id })))
            .sort((a, b) => {
              const da = a.meetingDate || a.sqlDate || ''
              const db = b.meetingDate || b.sqlDate || ''
              return db.localeCompare(da)
            })

          return (<>
            <div style={{marginBottom:28}}>
              <div style={{fontSize:26,fontWeight:800,letterSpacing:'-0.02em',lineHeight:1.15}}>RevOps<br/><span style={{color:'#60d4f4'}}>Commissions.</span></div>
              <div style={{fontSize:12,color:C.text3,marginTop:4}}>Commission verification · rep attribution · payout processing</div>
            </div>

            {/* Rep filter */}
            <div style={{display:'flex',gap:5,marginBottom:12,flexWrap:'wrap'}}>
              <button onClick={()=>setRevopsSelectedRep('all')} style={filterPill(revopsSelectedRep==='all','#60d4f4')}>All Reps</button>
              {reps.filter(r=>r.slackId).map(r=>(
                <button key={r.id} onClick={()=>setRevopsSelectedRep(r.id)} style={filterPill(revopsSelectedRep===r.id,'#60d4f4')}>{r.name}</button>
              ))}
            </div>

            {/* Time period filter */}
            <div style={{display:'flex',gap:5,marginBottom:12,flexWrap:'wrap'}}>
              {(['week','month','quarter','year','all'] as const).map(p=>(
                <button key={p} onClick={()=>{setRevopsPeriod(p);setRevopsFrom('');setRevopsTo('')}} style={filterPill(revopsPeriod===p)}>
                  {{week:'This Week',month:'This Month',quarter:'This Quarter',year:'This Year',all:'All Time'}[p]}
                </button>
              ))}
              <button onClick={()=>setRevopsPeriod('custom')} style={filterPill(revopsPeriod==='custom',C.amber)}>Custom Range</button>
            </div>
            {revopsPeriod==='custom'&&(
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:12,flexWrap:'wrap'}}>
                <span style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em'}}>From</span>
                <input type="date" value={revopsFrom} onChange={e=>setRevopsFrom(e.target.value)} style={{fontSize:11,padding:'4px 8px',border:`1px solid ${C.border2}`,borderRadius:6,background:C.surface3,color:C.text2,outline:'none',colorScheme:'dark'}}/>
                <span style={{fontSize:11,color:C.text3}}>→</span>
                <input type="date" value={revopsTo} onChange={e=>setRevopsTo(e.target.value)} style={{fontSize:11,padding:'4px 8px',border:`1px solid ${C.border2}`,borderRadius:6,background:C.surface3,color:C.text2,outline:'none',colorScheme:'dark'}}/>
                {(revopsFrom||revopsTo)&&<button onClick={()=>{setRevopsFrom('');setRevopsTo('')}} style={{fontSize:10,fontWeight:600,color:C.text3,background:'none',border:'none',cursor:'pointer',padding:'2px 6px'}}>✕ Clear</button>}
              </div>
            )}
            <div style={{marginBottom:20}}/>

            {/* Period-scoped Summary per rep */}
            {(()=>{
              // Compute period range
              const now=new Date()
              let pStart:Date,pEnd:Date
              if(revopsPeriod==='week'){pStart=new Date(now);pStart.setDate(now.getDate()-now.getDay());pStart.setHours(0,0,0,0);pEnd=new Date(pStart);pEnd.setDate(pStart.getDate()+6);pEnd.setHours(23,59,59)}
              else if(revopsPeriod==='month'){pStart=new Date(now.getFullYear(),now.getMonth(),1);pEnd=new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59)}
              else if(revopsPeriod==='quarter'){const qm=Math.floor(now.getMonth()/3)*3;pStart=new Date(now.getFullYear(),qm,1);pEnd=new Date(now.getFullYear(),qm+3,0,23,59,59)}
              else if(revopsPeriod==='year'){pStart=new Date(now.getFullYear(),0,1);pEnd=new Date(now.getFullYear(),11,31,23,59,59)}
              else if(revopsPeriod==='custom'&&revopsFrom){pStart=new Date(revopsFrom);pEnd=revopsTo?new Date(revopsTo+'T23:59:59'):new Date('2099-01-01')}
              else {pStart=new Date('2020-01-01');pEnd=new Date('2099-01-01')}

              const inRange=(d:string|null)=>{if(!d)return false;const dt=new Date(d);return dt>=pStart&&dt<=pEnd}
              const periodLabel=revopsPeriod==='week'?'This Week':revopsPeriod==='month'?'This Month':revopsPeriod==='quarter'?'This Quarter':revopsPeriod==='year'?`YTD · ${now.getFullYear()}`:revopsPeriod==='custom'?'Custom Range':'All Time'

              // Filter events by period
              const periodRepData=filteredRepData.map(r=>{
                const periodEvents=r.events.filter(e=>{
                  const d=e.meetingDate||e.sqlDate
                  return inRange(d)
                })
                const meetings=periodEvents.filter(e=>e.isMeeting).length
                const sqls=periodEvents.filter(e=>e.isSql).length
                const meetingAmt=meetings*MEETING_BONUS
                let sqlAmt=0,accelAmt=0
                // Recalculate with accelerator per month within period
                const sqlByMonth=new Map<string,number>()
                periodEvents.filter(e=>e.isSql&&e.sqlDate).forEach(e=>{
                  const d=new Date(e.sqlDate!)
                  const mk=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
                  sqlByMonth.set(mk,(sqlByMonth.get(mk)||0)+1)
                })
                // Simple approach: count base vs accel from monthly totals
                sqlByMonth.forEach(count=>{
                  const base=Math.min(count,SQL_ACCELERATOR_THRESHOLD)
                  const accel=Math.max(0,count-SQL_ACCELERATOR_THRESHOLD)
                  sqlAmt+=base*SQL_BONUS
                  accelAmt+=accel*SQL_ACCELERATOR
                })
                return {...r,periodEvents,periodMeetings:meetings,periodSqls:sqls,periodMeetingAmt:meetingAmt,periodSqlAmt:sqlAmt,periodAccelAmt:accelAmt,periodTotal:meetingAmt+sqlAmt+accelAmt}
              })

              // Filter detail events by period
              const periodAllEvents=periodRepData.flatMap(r=>r.periodEvents.map(e=>({...e,repName:r.rep.name,repId:r.rep.id})))
                .sort((a,b)=>{const da=a.meetingDate||a.sqlDate||'';const db=b.meetingDate||b.sqlDate||'';return db.localeCompare(da)})

              // Commission Summary visibility:
              // - BDM (Jonathan): sees all reps
              // - Reps: see only their own row
              // - Everyone else (CMO, PM, RevOps): hidden entirely
              const isBdmViewer=auth&&'email' in auth&&isBdmEmail(auth.email)
              const isRepViewer=auth&&'role' in auth&&auth.role==='rep'
              const repViewerId=isRepViewer&&'repId' in auth?(auth as {repId:string}).repId:null
              const showCommSummary=isBdmViewer||isRepViewer
              const summaryRepData=isBdmViewer?periodRepData:isRepViewer?periodRepData.filter(r=>r.rep.id===repViewerId):[]

              return (<>
              {showCommSummary&&summaryRepData.length>0&&(
              <div style={{...card,marginBottom:20}}>
                <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:14}}>Commission Summary · {periodLabel}</div>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead>
                    <tr style={{borderBottom:`2px solid ${C.border2}`}}>
                      {['Rep','Meetings','Meeting $','SQLs','SQL $','Accel $','Total','Mtg Cap %','SQL Cap %'].map(h=>(
                        <th key={h} style={{padding:'8px 10px',textAlign:h==='Rep'?'left':'right',fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRepData.map(r=>(
                      <tr key={r.rep.id} style={{borderBottom:`1px solid ${C.border}`}}>
                        <td style={{padding:'10px',fontWeight:600,color:C.text}}>{r.rep.name}</td>
                        <td style={{padding:'10px',textAlign:'right',color:C.text}}>{r.periodMeetings}</td>
                        <td style={{padding:'10px',textAlign:'right',color:C.green,fontWeight:600}}>${r.periodMeetingAmt.toLocaleString()}</td>
                        <td style={{padding:'10px',textAlign:'right',color:C.text}}>{r.periodSqls}</td>
                        <td style={{padding:'10px',textAlign:'right',color:'#c084fc',fontWeight:600}}>${r.periodSqlAmt.toLocaleString()}</td>
                        <td style={{padding:'10px',textAlign:'right',color:r.periodAccelAmt>0?C.amber:C.text3,fontWeight:r.periodAccelAmt>0?600:400}}>{r.periodAccelAmt>0?`$${r.periodAccelAmt.toLocaleString()}`:'—'}</td>
                        <td style={{padding:'10px',textAlign:'right',fontWeight:800,color:C.text}}>${r.periodTotal.toLocaleString()}</td>
                        <td style={{padding:'10px',textAlign:'right',fontSize:11,color:r.ytdMeetingAmt>=ANNUAL_MEETING_CAP?C.red:C.text3}}>{Math.round(r.ytdMeetingAmt/ANNUAL_MEETING_CAP*100)}%</td>
                        <td style={{padding:'10px',textAlign:'right',fontSize:11,color:(r.ytdSqlAmt+r.ytdAccelAmt)>=ANNUAL_SQL_CAP?C.red:C.text3}}>{Math.round((r.ytdSqlAmt+r.ytdAccelAmt)/ANNUAL_SQL_CAP*100)}%</td>
                      </tr>
                    ))}
                    {isBdmViewer&&summaryRepData.length>1&&(
                      <tr style={{borderTop:`2px solid ${C.border2}`,background:C.surface2}}>
                        <td style={{padding:'10px',fontWeight:800,color:C.text}}>Total</td>
                        <td style={{padding:'10px',textAlign:'right',fontWeight:700,color:C.text}}>{summaryRepData.reduce((s,r)=>s+r.periodMeetings,0)}</td>
                        <td style={{padding:'10px',textAlign:'right',fontWeight:700,color:C.green}}>${summaryRepData.reduce((s,r)=>s+r.periodMeetingAmt,0).toLocaleString()}</td>
                        <td style={{padding:'10px',textAlign:'right',fontWeight:700,color:C.text}}>{summaryRepData.reduce((s,r)=>s+r.periodSqls,0)}</td>
                        <td style={{padding:'10px',textAlign:'right',fontWeight:700,color:'#c084fc'}}>${summaryRepData.reduce((s,r)=>s+r.periodSqlAmt,0).toLocaleString()}</td>
                        <td style={{padding:'10px',textAlign:'right',fontWeight:700,color:C.amber}}>${summaryRepData.reduce((s,r)=>s+r.periodAccelAmt,0).toLocaleString()}</td>
                        <td style={{padding:'10px',textAlign:'right',fontWeight:800,color:C.text}}>${summaryRepData.reduce((s,r)=>s+r.periodTotal,0).toLocaleString()}</td>
                        <td/><td/>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              )}

              {/* Detailed attribution table — filtered by period */}
              <div style={{...card,marginBottom:20}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em'}}>Commission Event Detail · {periodAllEvents.length} events · {periodLabel}</div>
                </div>
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                    <thead>
                      <tr style={{borderBottom:`2px solid ${C.border2}`}}>
                        {['Rep','Account','Tier','Source','AE','Quality','Meeting Date','SQL Date','SQO Date','ACV','Type',...(isBdmViewer?['Amount']:[])].map(h=>(
                          <th key={h} style={{padding:'7px 8px',textAlign:['ACV','Amount'].includes(h)?'right':'left',fontSize:9,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',whiteSpace:'nowrap'}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {periodAllEvents.map((e,i)=>{
                        const types: string[] = []
                        if (e.isMeeting) types.push('Meeting')
                        if (e.isSql) types.push('SQL')
                        const amount = e.amount
                        const qualityColor = e.mqlQuality==='hq'?C.amber:e.mqlQuality==='lq'?'#fb923c':C.text3
                        const eventKey=`${e.email}-${i}`
                        const isExpanded=revopsExpandedEvent===eventKey
                        return (
                          <React.Fragment key={eventKey}>
                          <tr style={{borderBottom:isExpanded?'none':`1px solid ${C.border}`,cursor:'pointer',background:isExpanded?C.surface2:'transparent'}} onClick={()=>setRevopsExpandedEvent(isExpanded?null:eventKey)}>
                            <td style={{padding:'7px 8px',fontWeight:500,color:C.text2,whiteSpace:'nowrap'}}>{e.repName}</td>
                            <td style={{padding:'7px 8px',fontWeight:600,color:isExpanded?'#60d4f4':C.text,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{isExpanded?'▼ ':''}{e.account}</td>
                            <td style={{padding:'7px 8px'}}>{(()=>{const t=e.accountTier;const tc=t==='A'?C.green:t==='B'?'#60d4f4':t==='E'?C.purpleL:t==='C'?C.red:C.text3;return <span style={{fontSize:9,fontWeight:700,color:tc,background:`${tc}18`,padding:'1px 5px',borderRadius:3}}>{t||'—'}</span>})()}</td>
                            <td style={{padding:'7px 8px',color:C.text3,fontSize:10}}>{e.sourceChannel||'—'}</td>
                            <td style={{padding:'7px 8px',color:C.text2}}>{e.ae||'—'}</td>
                            <td style={{padding:'7px 8px'}}><span style={{fontSize:9,fontWeight:700,color:qualityColor,background:`${qualityColor}18`,padding:'1px 5px',borderRadius:3}}>{e.mqlQuality==='hq'?'HQ':e.mqlQuality==='lq'?'LQ':e.mqlQuality||'—'}</span></td>
                            <td style={{padding:'7px 8px',color:e.meetingDate?C.text2:C.text3,whiteSpace:'nowrap'}}>{e.meetingDate?new Date(e.meetingDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}):'—'}</td>
                            <td style={{padding:'7px 8px',color:e.sqlDate?'#c084fc':C.text3,whiteSpace:'nowrap'}}>{e.sqlDate?new Date(e.sqlDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}):'—'}</td>
                            <td style={{padding:'7px 8px',color:e.sqoDate?C.amber:C.text3,whiteSpace:'nowrap'}}>{e.sqoDate?new Date(e.sqoDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}):'—'}</td>
                            <td style={{padding:'7px 8px',textAlign:'right',color:e.acv?C.text2:C.text3}}>{e.acv?`$${parseAcv(e.acv).toLocaleString()}`:'—'}</td>
                            <td style={{padding:'7px 8px'}}>
                              {types.map(t=>(
                                <span key={t} style={{fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:3,marginRight:3,
                                  background:t==='Meeting'?'rgba(0,229,160,0.15)':'rgba(192,132,252,0.15)',
                                  color:t==='Meeting'?C.green:'#c084fc',
                                  border:`1px solid ${t==='Meeting'?'rgba(0,229,160,0.3)':'rgba(192,132,252,0.3)'}`,
                                }}>{t}</span>
                              ))}
                            </td>
                            {isBdmViewer&&<td style={{padding:'7px 8px',textAlign:'right',fontWeight:700,color:C.text}}>${amount.toLocaleString()}</td>}
                          </tr>
                          {isExpanded&&(
                            <tr style={{borderBottom:`1px solid ${C.border}`,background:C.surface2}}>
                              <td colSpan={isBdmViewer?12:11} style={{padding:'10px 16px'}}>
                                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:12}}>
                                  <div>
                                    <div style={{fontSize:8,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:3}}>Salesforce URL</div>
                                    {e.sfUrl?<a href={e.sfUrl} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:'#60d4f4',textDecoration:'none',wordBreak:'break-all'}} onClick={ev=>ev.stopPropagation()}>{e.sfUrl.length>50?e.sfUrl.slice(0,50)+'…':e.sfUrl}</a>:<span style={{fontSize:10,color:C.text3}}>—</span>}
                                  </div>
                                  <div>
                                    <div style={{fontSize:8,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:3}}>Meeting Booked</div>
                                    <div style={{fontSize:10,color:e.meetingDate?C.text:C.text3}}>{e.meetingDate?new Date(e.meetingDate).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'}):'—'}</div>
                                  </div>
                                  <div>
                                    <div style={{fontSize:8,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:3}}>SQL Date</div>
                                    <div style={{fontSize:10,color:e.sqlDate?'#c084fc':C.text3}}>{e.sqlDate?new Date(e.sqlDate).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'}):'—'}</div>
                                  </div>
                                  <div>
                                    <div style={{fontSize:8,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:3}}>Gong URL</div>
                                    {e.gongUrl?<a href={e.gongUrl} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:'#60d4f4',textDecoration:'none',wordBreak:'break-all'}} onClick={ev=>ev.stopPropagation()}>{e.gongUrl.length>50?e.gongUrl.slice(0,50)+'…':e.gongUrl}</a>:<span style={{fontSize:10,color:C.text3}}>—</span>}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                          </React.Fragment>
                        )
                      })}
                      {periodAllEvents.length===0&&(
                        <tr><td colSpan={isBdmViewer?12:11} style={{padding:'20px',textAlign:'center',color:C.text3}}>No commission events found for this period.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              </>)
            })()}

            {/* Commission rules reference */}
            <div style={{...card,opacity:0.7}}>
              <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10}}>Commission Structure Reference</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:12,fontSize:11,color:C.text2}}>
                <div><strong style={{color:C.text}}>Meeting Booked:</strong> $150/ICP meeting (A/B/E tier)</div>
                <div><strong style={{color:C.text}}>SQL:</strong> $620/SQL · $930 accelerator if &gt;3/month</div>
              </div>
              <div style={{fontSize:10,color:C.text3,marginTop:8}}>Payout: following month, 2nd half pay cycle. Meeting + SQL can stack on the same account.</div>
            </div>
          </>)
        })()}


        {/* ══════════════════════════════════════════════════════
            ROUND ROBIN VIEW (v2 — click-to-book)
        ══════════════════════════════════════════════════════ */}
        {view==='roundrobin'&&(()=>{
          // ── Persistence helpers ────────────────────────────────
          const saveAssignments=(a:RRAssignment[])=>{setRrAssignments(a);localStorage.setItem('rr-assignments',JSON.stringify(a))}
          const saveSkips=(s:RRSkip[])=>{setRrSkips(s);localStorage.setItem('rr-skips',JSON.stringify(s))}
          const saveMgr=(m:RRManagerSettings)=>{setRrMgr(m);localStorage.setItem('rr-manager',JSON.stringify(m))}
          const setSeg=(s:'Major'|'Commercial')=>{setRrSeg(s);localStorage.setItem('rr-seg',s);setRrViewAeIdx(0);setRrBookSlot(null)}
          const setRegion=(r:'West'|'East')=>{setRrRegion(r);localStorage.setItem('rr-region',r);setRrViewAeIdx(0);setRrBookSlot(null)}

          // ── Rolling 30-day counts (queue fairness) ──────────────
          const thirtyDaysAgo=new Date();thirtyDaysAgo.setDate(thirtyDaysAgo.getDate()-30)
          const recentAssignments=rrAssignments.filter(a=>new Date(a.assignedAt)>=thirtyDaysAgo)
          const countByAE=(name:string)=>recentAssignments.filter(a=>a.assignedAE===name).length
          const lastAssigned=(name:string)=>{const a=rrAssignments.filter(x=>x.assignedAE===name).sort((a,b)=>b.assignedAt.localeCompare(a.assignedAt))[0];return a?.assignedAt||''}
          // ── Equity window counts (display) ─────────────────────
          const eqDays={week:7,month:30,quarter:90,year:365}[rrEquityWindow]
          const eqAgo=new Date();eqAgo.setDate(eqAgo.getDate()-eqDays)
          const eqAssignments=rrAssignments.filter(a=>new Date(a.assignedAt)>=eqAgo)
          const eqCountByAE=(name:string)=>eqAssignments.filter(a=>a.assignedAE===name).length
          const eqWindowLabel={week:'7 Days',month:'30 Days',quarter:'90 Days',year:'365 Days'}[rrEquityWindow]

          // ── Queue computation ──────────────────────────────────
          const removedAEs=rrMgr.removedAEs||[]
          const eligible=rrRoster.filter(ae=>ae.status==='Active'&&ae.region===rrRegion&&ae.segment===rrSeg)
          const queue=eligible
            .filter(ae=>!removedAEs.includes(ae.name))
            .map(ae=>({...ae,count:countByAE(ae.name),lastDate:lastAssigned(ae.name)}))
            .sort((a,b)=>a.count-b.count||a.lastDate.localeCompare(b.lastDate)||a.name.localeCompare(b.name))

          const viewIdx=Math.min(rrViewAeIdx,queue.length-1)
          const currentAE=queue[viewIdx]||null
          const seInfo=currentAE?SE_ROSTER[currentAE.se]:null

          // ── Week calendar dates ────────────────────────────────
          const today=new Date()
          const mondayBase=new Date(today);mondayBase.setDate(today.getDate()-((today.getDay()+6)%7))
          const monday=new Date(mondayBase);monday.setDate(monday.getDate()+rrWeekOffset*7)
          const weekDays=Array.from({length:5},(_,i)=>{const d=new Date(monday);d.setDate(monday.getDate()+i);return d})
          // 30-minute slots from 8am to 5:30pm (20 slots)
          const slots=Array.from({length:20},(_,i)=>({hour:8+Math.floor(i/2),min:(i%2)*30}))
          const weekLabel=`${weekDays[0].toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${weekDays[4].toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`

          // ── Calendar event checking ────────────────────────────
          // Check if a slot overlaps with any calendar event.
          // Slots are in the user's local browser timezone.
          // Events from Google API have timezone offsets — new Date() handles conversion.
          const checkEventsForSlot=(events:{summary:string;start:string;end:string;isAllDay:boolean;isOOO:boolean}[],slotStart:Date,slotEnd:Date,dayStr:string):{hit:boolean;label:string|null;isOoo:boolean}=>{
            for(const ev of events){
              if(ev.isAllDay){
                // All-day events use date strings (YYYY-MM-DD). Check if our day falls in range.
                if(ev.start<=dayStr&&(ev.end>dayStr||ev.end===dayStr)){return {hit:true,label:ev.isOOO?'OOO':ev.summary,isOoo:ev.isOOO}}
              } else {
                const evStart=new Date(ev.start),evEnd=new Date(ev.end)
                // Standard overlap check: event starts before slot ends AND event ends after slot starts
                if(evStart<slotEnd&&evEnd>slotStart){return {hit:true,label:ev.summary,isOoo:ev.isOOO}}
              }
            }
            return {hit:false,label:null,isOoo:false}
          }

          const getSlotStatus=(day:Date,hour:number,min:number):{busy:boolean;label:string|null;isOoo:boolean;isSeBusy:boolean}=>{
            const slotStart=new Date(day.getFullYear(),day.getMonth(),day.getDate(),hour,min,0)
            const slotEnd=new Date(day.getFullYear(),day.getMonth(),day.getDate(),hour,min+30,0)
            const dayStr=`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`
            let busy=false,label:string|null=null,isOoo=false,isSeBusy=false
            // Check AE calendar events
            const aeCheck=checkEventsForSlot(rrCalEvents,slotStart,slotEnd,dayStr)
            if(aeCheck.hit){busy=true;label=aeCheck.label;isOoo=aeCheck.isOoo}
            // Check assignment history too
            if(!busy&&currentAE){
              const match=rrAssignments.find(a=>{if(!a.meetingTime||a.assignedAE!==currentAE.name)return false;const mt=new Date(a.meetingTime);return mt.getFullYear()===day.getFullYear()&&mt.getMonth()===day.getMonth()&&mt.getDate()===day.getDate()&&mt.getHours()===hour&&mt.getMinutes()===min})
              if(match){busy=true;label=match.accountName}
            }
            // Check SE calendar if overlay is on
            if(rrShowSe){
              const seCheck=checkEventsForSlot(rrSeEvents,slotStart,slotEnd,dayStr)
              if(seCheck.hit) isSeBusy=true
            }
            return {busy,label,isOoo,isSeBusy}
          }

          // ── All AEs for leaderboard ────────────────────────────
          const allAEs=rrRoster
            .map(ae=>({...ae,count:eqCountByAE(ae.name),count30:countByAE(ae.name),removed:removedAEs.includes(ae.name)||ae.status==='Inactive'}))
            .sort((a,b)=>a.count-b.count||a.name.localeCompare(b.name))
          const maxCount=Math.max(1,...allAEs.map(a=>a.count))
          const saveRoster=(r:RosterAE[])=>{setRrRoster(r);localStorage.setItem('roundRobinAERoster',JSON.stringify(r))}

          // ── Assign from slot click ─────────────────────────────
          const assignFromSlot=(acct:string)=>{
            if(!currentAE||!rrBookSlot) return
            const mt=new Date(rrBookSlot.day);mt.setHours(rrBookSlot.hour,rrBookSlot.min,0,0)
            const assignment:RRAssignment={
              id:`rr-${Date.now()}`,accountName:acct,segment:rrSeg,region:rrRegion,
              assignedAE:currentAE.name,calendarId:currentAE.calendarId,
              meetingTime:mt.toISOString(),assignedAt:new Date().toISOString(),
              skippedAEs:queue.slice(0,viewIdx).map(ae=>({name:ae.name,reason:'Skipped in queue'})),
              seIncluded:rrShowSe?seInfo?.name:undefined,
            }
            saveAssignments([assignment,...rrAssignments])
            if(viewIdx>0){
              const newSkips=queue.slice(0,viewIdx).map(ae=>({timestamp:new Date().toISOString(),accountName:acct,skippedAE:ae.name,reason:'Queue position',assignedTo:currentAE.name}))
              saveSkips([...newSkips,...rrSkips])
            }
            setRrBookSlot(null);setRrBookAcct('');setRrViewAeIdx(0)
          }

          // ── Fetch calendar events ─────────────────────────────
          // Triggered by useEffect in the component body (can't use hooks here in IIFE)
          // Instead, we provide a fetch function and call it from the render
          const fetchCalKey=`${currentAE?.calendarId||''}|${monday.toISOString().split('T')[0]}|${rrWeekOffset}`
          const fetchSeKey=`${seInfo?.calendarId||''}|${monday.toISOString().split('T')[0]}|${rrShowSe}`

          return (<>
            <div style={{marginBottom:20,display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:12}}>
              <div>
                <div style={{fontSize:26,fontWeight:800,letterSpacing:'-0.02em',lineHeight:1.15}}>Round Robin<br/><span style={{color:C.green}}>Click to Book.</span></div>
                <div style={{fontSize:12,color:C.text3,marginTop:4}}>Live AE calendar · click a slot to assign · rolling 30-day equity</div>
              </div>
              {isManagerRole(auth)&&(
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  <button onClick={()=>{setRrShowBackfillModal(true);setRrBfDate(new Date().toISOString().slice(0,10))}} style={{fontSize:11,fontWeight:700,padding:'8px 16px',borderRadius:7,border:`1px solid ${C.amber}`,background:'rgba(245,166,35,0.1)',color:C.amber,cursor:'pointer',display:'flex',alignItems:'center',gap:5}}>
                    <span style={{fontSize:14}}>+</span> Log Past Meeting
                  </button>
                  <button onClick={()=>setRrShowManageModal(true)} style={{fontSize:11,fontWeight:700,padding:'8px 16px',borderRadius:7,border:`1px solid ${C.purple}`,background:'rgba(123,110,246,0.1)',color:C.purpleL,cursor:'pointer',display:'flex',alignItems:'center',gap:5}}>
                    Manage AEs
                  </button>
                </div>
              )}
            </div>

            {/* ── Segment & Region Toggles ── */}
            <div style={{display:'flex',gap:16,marginBottom:20,flexWrap:'wrap'}}>
              <div style={{display:'flex',gap:5}}>
                <span style={{fontSize:10,fontWeight:700,color:C.text3,alignSelf:'center',marginRight:4}}>SEGMENT</span>
                {(['Commercial','Major'] as const).map(s=>(
                  <button key={s} onClick={()=>setSeg(s)} style={filterPill(rrSeg===s)}>{s}</button>
                ))}
              </div>
              <div style={{display:'flex',gap:5}}>
                <span style={{fontSize:10,fontWeight:700,color:C.text3,alignSelf:'center',marginRight:4}}>REGION</span>
                {(['East','West'] as const).map(r=>(
                  <button key={r} onClick={()=>setRegion(r)} style={filterPill(rrRegion===r,r==='West'?'#60d4f4':C.green)}>{r} Coast</button>
                ))}
              </div>
            </div>

            {currentAE?(
              <div style={{display:'grid',gridTemplateColumns:'260px minmax(0,640px)',gap:16,marginBottom:20}}>
                {/* ── Next Up Card ── */}
                <div style={{...card,background:'linear-gradient(135deg, rgba(0,229,160,0.08) 0%, rgba(123,110,246,0.08) 100%)',border:`1px solid rgba(0,229,160,0.25)`}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>
                    {viewIdx===0?'Next Up':'Viewing #'+(viewIdx+1)}
                  </div>
                  <div style={{fontSize:28,fontWeight:800,color:C.green,lineHeight:1.1}}>{currentAE.name}</div>
                  <div style={{fontSize:12,color:C.text2,marginTop:4}}>Team {currentAE.team} · SE: {seInfo?.name||currentAE.se}</div>
                  <div style={{fontSize:11,color:C.text3,marginTop:2}}>{currentAE.count} meetings in 30 days</div>

                  <div style={{borderTop:`1px solid ${C.border}`,marginTop:12,paddingTop:10}}>
                    <div style={{fontSize:9,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>Queue</div>
                    {queue.map((ae,i)=>(
                      <div key={ae.name} onClick={()=>{setRrViewAeIdx(i);setRrBookSlot(null)}}
                        style={{display:'flex',justifyContent:'space-between',padding:'4px 6px',borderRadius:4,cursor:'pointer',
                          background:i===viewIdx?'rgba(0,229,160,0.15)':'transparent',marginBottom:1}}>
                        <span style={{fontSize:10,color:i===viewIdx?C.green:C.text2,fontWeight:i===viewIdx?700:400}}>
                          {i+1}. {ae.name}
                        </span>
                        <span style={{fontSize:10,color:C.text3}}>{ae.count}</span>
                      </div>
                    ))}
                  </div>

                  {viewIdx>0&&(
                    <button onClick={()=>{setRrViewAeIdx(0);setRrBookSlot(null)}} style={{marginTop:8,fontSize:10,fontWeight:600,padding:'4px 10px',borderRadius:5,border:`1px solid ${C.border2}`,background:'transparent',color:C.text3,cursor:'pointer',width:'100%'}}>
                      ← Back to #1
                    </button>
                  )}
                </div>

                {/* ── Weekly Calendar ── */}
                <div style={card}>
                  {/* Fetch calendar data — trigger via inline effect-like pattern */}
                  {(()=>{
                    const key=fetchCalKey
                    if(key!==rrFetchedCalKey&&currentAE&&!rrCalLoading){
                      // Schedule fetch after render
                      setTimeout(()=>{
                        setRrFetchedCalKey(key)
                        rrFetchCal(currentAE.calendarId,monday.toISOString().split('T')[0])
                      },0)
                    }
                    const seKey=fetchSeKey
                    if(seKey!==rrFetchedSeKey&&seInfo&&rrShowSe){
                      setTimeout(()=>{
                        setRrFetchedSeKey(seKey)
                        rrFetchSe(seInfo.calendarId,monday.toISOString().split('T')[0])
                      },0)
                    }
                    return null
                  })()}

                  {/* Auth prompt */}
                  {rrCalError==='not_authenticated'&&(
                    <div style={{padding:'14px',background:'rgba(245,166,35,0.1)',border:`1px solid rgba(245,166,35,0.3)`,borderRadius:8,marginBottom:12,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                      <div style={{fontSize:11,color:C.amber}}>Connect Google Calendar to see live AE availability</div>
                      <button onClick={()=>signIn('google')} style={{fontSize:11,fontWeight:700,padding:'6px 14px',borderRadius:6,border:'none',background:C.amber,color:C.bg,cursor:'pointer'}}>Connect Google Calendar</button>
                    </div>
                  )}
                  {rrCalError&&rrCalError!=='not_authenticated'&&(
                    <div style={{fontSize:10,color:C.red,marginBottom:8}}>Calendar unavailable: {rrCalError}</div>
                  )}
                  {rrCalLoading&&<div style={{fontSize:10,color:C.text3,marginBottom:8}}>Loading calendar...</div>}

                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <button onClick={()=>{setRrWeekOffset(p=>p-1);setRrBookSlot(null)}} style={{fontSize:14,background:'none',border:'none',color:C.text3,cursor:'pointer',padding:'2px 8px'}}>←</button>
                    <div style={{fontSize:12,fontWeight:700,color:C.text}}>{weekLabel}{rrCalEvents.length>0&&<span style={{fontSize:9,color:C.text3,marginLeft:6}}>{rrCalEvents.length} events</span>}</div>
                    <button onClick={()=>{setRrWeekOffset(p=>p+1);setRrBookSlot(null)}} style={{fontSize:14,background:'none',border:'none',color:C.text3,cursor:'pointer',padding:'2px 8px'}}>→</button>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                    <button onClick={()=>setRrBookOver(p=>!p)} style={{fontSize:9,fontWeight:600,padding:'3px 8px',borderRadius:4,cursor:'pointer',border:`1px solid ${rrBookOver?C.amber:C.border2}`,background:rrBookOver?'rgba(245,166,35,0.15)':'transparent',color:rrBookOver?C.amber:C.text3}}>
                      {rrBookOver?'✓ Book over busy ON':'Book over busy'}
                    </button>
                    <span style={{fontSize:9,color:C.text3}}>30-min slots</span>
                  </div>

                  {/* Day headers */}
                  <div style={{display:'grid',gridTemplateColumns:'50px repeat(5,1fr)',gap:2}}>
                    <div/>
                    {weekDays.map((d,i)=>{
                      const isToday=d.toDateString()===today.toDateString()
                      return <div key={i} style={{textAlign:'center',fontSize:10,fontWeight:isToday?700:500,color:isToday?C.green:C.text3,padding:'4px 0'}}>
                        {d.toLocaleDateString('en-US',{weekday:'short'})}<br/>{d.getDate()}
                      </div>
                    })}
                  </div>

                  {/* Time grid — 30-min clickable slots */}
                  <div style={{display:'grid',gridTemplateColumns:'50px repeat(5,1fr)',gap:2,maxHeight:500,overflowY:'auto'}}>
                    {slots.map((s,si)=>(
                      <React.Fragment key={si}>
                        <div style={{fontSize:9,color:C.text3,textAlign:'right',paddingRight:6,paddingTop:3,fontWeight:500}}>{s.hour>12?s.hour-12:s.hour}:{s.min===0?'00':'30'}{s.hour>=12?'pm':'am'}</div>
                        {weekDays.map((d,di)=>{
                          const ds=d.toISOString().split('T')[0]
                          const slot=getSlotStatus(d,s.hour,s.min)
                          const isPast=d<today&&!(d.toDateString()===today.toDateString()&&(s.hour>today.getHours()||(s.hour===today.getHours()&&s.min>today.getMinutes())))
                          const isSelected=rrBookSlot?.day===ds&&rrBookSlot?.hour===s.hour&&rrBookSlot?.min===s.min
                          // When book-over is on: can book over busy (but not OOO). When off: only free slots.
                          const canBook=rrBookOver?(!isPast&&!slot.isOoo):(!slot.busy&&!isPast)
                          const mutualFree=canBook&&!slot.busy&&rrShowSe&&!slot.isSeBusy
                          return (
                            <div key={di}
                              onClick={()=>{if(canBook)setRrBookSlot(isSelected?null:{day:ds,hour:s.hour,min:s.min})}}
                              style={{
                                height:28,borderRadius:4,cursor:canBook?'pointer':'default',overflow:'hidden',minWidth:0,
                                background:isSelected?'rgba(0,229,160,0.3)':slot.isOoo?'rgba(255,92,92,0.18)':slot.busy?(rrBookOver?'rgba(96,165,250,0.12)':'rgba(96,165,250,0.2)'):slot.isSeBusy&&rrShowSe?'rgba(192,132,252,0.12)':isPast?'rgba(255,255,255,0.02)':C.surface3,
                                border:`1px solid ${isSelected?C.green:mutualFree?'rgba(0,229,160,0.5)':slot.isOoo?'rgba(255,92,92,0.35)':slot.busy?(rrBookOver?'rgba(245,166,35,0.3)':'rgba(96,165,250,0.3)'):slot.isSeBusy&&rrShowSe?'rgba(192,132,252,0.3)':'transparent'}`,
                                display:'flex',alignItems:'center',justifyContent:'center',
                                transition:'all 0.12s',position:'relative',
                                boxShadow:isSelected?`0 0 6px rgba(0,229,160,0.3)`:'none',
                              }}
                              onMouseEnter={e=>{if(canBook){e.currentTarget.style.borderColor=C.green;e.currentTarget.style.background=slot.busy?'rgba(245,166,35,0.15)':'rgba(0,229,160,0.1)'}}}
                              onMouseLeave={e=>{if(!isSelected&&canBook){e.currentTarget.style.borderColor=mutualFree?'rgba(0,229,160,0.5)':'transparent';e.currentTarget.style.background=slot.busy?(rrBookOver?'rgba(96,165,250,0.12)':'rgba(96,165,250,0.2)'):C.surface3}}}
                            >
                              {isSelected?<span style={{fontSize:11,color:C.green,fontWeight:700}}>✓</span>:(
                                <>
                                {slot.isOoo&&<span style={{fontSize:7,color:C.red,fontWeight:700}}>OOO</span>}
                                {slot.busy&&!slot.isOoo&&<span style={{fontSize:7,color:rrBookOver?'rgba(96,165,250,0.6)':'#60a5fa',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'block',width:'100%',textAlign:'center',padding:'0 2px',boxSizing:'border-box'}}>{slot.label||'Busy'}</span>}
                                {!slot.busy&&slot.isSeBusy&&rrShowSe&&<span style={{fontSize:7,color:'#c084fc',fontWeight:600}}>SE</span>}
                                {canBook&&!slot.busy&&!slot.isSeBusy&&<span style={{fontSize:8,color:'rgba(255,255,255,0.12)'}}>+</span>}
                                {mutualFree&&<span style={{position:'absolute',top:1,right:2,fontSize:5,color:C.green}}>●</span>}
                                </>
                              )}
                            </div>
                          )
                        })}
                      </React.Fragment>
                    ))}
                  </div>

                  {/* Calendar legend */}
                  <div style={{display:'flex',gap:10,marginTop:8,flexWrap:'wrap'}}>
                    <div style={{display:'flex',alignItems:'center',gap:3}}><span style={{width:8,height:8,borderRadius:2,background:'rgba(96,165,250,0.3)'}}/><span style={{fontSize:8,color:C.text3}}>AE Busy</span></div>
                    <div style={{display:'flex',alignItems:'center',gap:3}}><span style={{width:8,height:8,borderRadius:2,background:'rgba(255,92,92,0.2)'}}/><span style={{fontSize:8,color:C.text3}}>OOO</span></div>
                    {rrShowSe&&<div style={{display:'flex',alignItems:'center',gap:3}}><span style={{width:8,height:8,borderRadius:2,background:'rgba(192,132,252,0.2)'}}/><span style={{fontSize:8,color:C.text3}}>SE Busy</span></div>}
                    {rrShowSe&&<div style={{display:'flex',alignItems:'center',gap:3}}><span style={{width:6,height:6,borderRadius:'50%',background:C.green}}/><span style={{fontSize:8,color:C.text3}}>Both Free</span></div>}
                    <div style={{display:'flex',alignItems:'center',gap:3}}><span style={{width:8,height:8,borderRadius:2,background:C.surface3,border:`1px solid ${C.border}`}}/><span style={{fontSize:8,color:C.text3}}>Available</span></div>
                  </div>

                  {/* Slot booking popover */}
                  {rrBookSlot&&currentAE&&(
                    <div style={{marginTop:12,padding:'12px 14px',background:C.surface2,borderRadius:8,border:`1px solid ${C.green}40`}}>
                      <div style={{fontSize:11,color:C.text2,marginBottom:8}}>
                        {new Date(rrBookSlot.day).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})} at {rrBookSlot.hour>12?rrBookSlot.hour-12:rrBookSlot.hour}:{rrBookSlot.min===0?'00':'30'}{rrBookSlot.hour>=12?'pm':'am'} (30 min) → <strong style={{color:C.green}}>{currentAE.name}</strong>
                      </div>
                      <div style={{display:'flex',gap:8,alignItems:'end'}}>
                        <div style={{flex:1}}>
                          <input value={rrBookAcct} onChange={e=>setRrBookAcct(e.target.value)} placeholder="Account name" onKeyDown={e=>{if(e.key==='Enter'&&rrBookAcct.trim())assignFromSlot(rrBookAcct.trim())}}
                            style={{...inputStyle,fontSize:13,padding:'8px 10px'}} autoFocus/>
                        </div>
                        <button onClick={()=>{if(rrBookAcct.trim())assignFromSlot(rrBookAcct.trim())}} disabled={!rrBookAcct.trim()}
                          style={{padding:'8px 16px',borderRadius:7,border:'none',background:rrBookAcct.trim()?C.green:'rgba(0,229,160,0.3)',color:C.bg,fontSize:12,fontWeight:700,cursor:rrBookAcct.trim()?'pointer':'default',whiteSpace:'nowrap'}}>
                          Assign to {currentAE.name}
                        </button>
                        {viewIdx<queue.length-1&&(
                          <button onClick={()=>{setRrViewAeIdx(viewIdx+1);setRrBookSlot(null)}}
                            style={{padding:'8px 12px',borderRadius:7,border:`1px solid ${C.border2}`,background:'transparent',color:C.text2,fontSize:11,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>
                            Skip → {queue[viewIdx+1]?.name}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* SE overlay toggle */}
                  <div style={{marginTop:12,borderTop:`1px solid ${C.border}`,paddingTop:10}}>
                    <button onClick={()=>setRrShowSe(!rrShowSe)} style={{fontSize:10,fontWeight:600,color:rrShowSe?C.purpleL:C.text3,background:'none',border:'none',cursor:'pointer',padding:0}}>
                      {rrShowSe?'▼':'▶'} Need SE on the call? · {seInfo?.name||'—'}
                    </button>
                    {rrShowSe&&seInfo&&(
                      <div style={{marginTop:8,padding:'8px 10px',background:C.surface3,borderRadius:6,fontSize:10,color:C.text2}}>
                        SE: <strong>{seInfo.name}</strong> · {seInfo.tz} · {seInfo.calendarId}
                        <div style={{fontSize:9,color:C.text3,marginTop:4}}>Calendar integration coming soon. For now, check {seInfo.name}'s calendar manually.</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ):(
              <div style={{...card,marginBottom:20,padding:24,textAlign:'center'}}>
                <div style={{fontSize:14,color:C.text3}}>No eligible AEs for {rrSeg} · {rrRegion} Coast</div>
              </div>
            )}

            {/* ── Equity Bar Chart ── */}
            <div style={{...card,marginBottom:20}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em'}}>AE Equity · Rolling {eqWindowLabel}</div>
                <div style={{display:'flex',gap:4}}>
                  {(['week','month','quarter','year'] as const).map(w=>(
                    <button key={w} onClick={()=>{setRrEquityWindow(w);localStorage.setItem('rr-equity-window',w)}} style={{fontSize:9,fontWeight:600,padding:'3px 8px',borderRadius:4,cursor:'pointer',border:`1px solid ${rrEquityWindow===w?C.purple:C.border2}`,background:rrEquityWindow===w?'rgba(123,110,246,0.15)':'transparent',color:rrEquityWindow===w?C.purpleL:C.text3,textTransform:'capitalize'}}>{w}</button>
                  ))}
                </div>
              </div>
              <div style={{display:'grid',gap:5}}>
                {allAEs.map(ae=>(
                  <div key={ae.name} style={{display:'grid',gridTemplateColumns:'70px 1fr 30px',gap:8,alignItems:'center',opacity:ae.removed?0.35:1}}>
                    <div style={{fontSize:10,fontWeight:600,color:queue[0]?.name===ae.name?C.green:C.text2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                      {queue[0]?.name===ae.name?'★ ':''}{ae.name}
                    </div>
                    <div style={{height:10,borderRadius:5,background:C.surface3,overflow:'hidden'}}>
                      <div style={{height:10,borderRadius:5,background:ae.region==='West'?'#60d4f4':C.green,width:`${ae.count/maxCount*100}%`}}/>
                    </div>
                    <div style={{fontSize:10,fontWeight:700,color:C.text,textAlign:'right'}}>{ae.count}</div>
                  </div>
                ))}
              </div>
              <div style={{display:'flex',gap:10,marginTop:8,justifyContent:'center'}}>
                <div style={{display:'flex',alignItems:'center',gap:3}}><span style={{width:8,height:8,borderRadius:2,background:'#60d4f4'}}/><span style={{fontSize:9,color:C.text3}}>West</span></div>
                <div style={{display:'flex',alignItems:'center',gap:3}}><span style={{width:8,height:8,borderRadius:2,background:C.green}}/><span style={{fontSize:9,color:C.text3}}>East</span></div>
                <div style={{display:'flex',alignItems:'center',gap:3}}><span style={{fontSize:9,color:C.green}}>★</span><span style={{fontSize:9,color:C.text3}}>Next up</span></div>
              </div>
            </div>

            {/* ── Recent Assignments (collapsible) ── */}
            <div style={{...card,marginBottom:20}}>
              <button onClick={()=>setRrShowRecent(!rrShowRecent)} style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',background:'none',border:'none',cursor:'pointer',padding:0}}>
                {rrShowRecent?'▼':'▶'} Recent Assignments · {recentAssignments.length}
              </button>
              {rrShowRecent&&recentAssignments.length>0&&(
                <div style={{marginTop:12}}>
                  {recentAssignments.slice(0,10).map(a=>{
                    const isEditing=rrEditAssignId===a.id
                    return (<div key={a.id} style={{borderBottom:`1px solid ${C.border}`}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',fontSize:10}}>
                        <span style={{color:C.text2}}>
                          {new Date(a.assignedAt).toLocaleDateString('en-US',{month:'short',day:'numeric'})} · <strong style={{color:C.text}}>{a.accountName}</strong> → <span style={{color:C.green}}>{a.assignedAE}</span>
                          {a.manualBackfill&&<span style={{marginLeft:4,fontSize:8,fontWeight:700,color:C.amber,background:'rgba(245,166,35,0.15)',padding:'1px 5px',borderRadius:3,verticalAlign:'middle'}}>Manual</span>}
                        </span>
                        <span style={{display:'flex',alignItems:'center',gap:6}}>
                          <span style={{color:C.text3}}>{a.segment} · {a.region}{a.skippedAEs.length>0?` · skipped ${a.skippedAEs.length}`:''}{a.source?` · ${a.source}`:''}</span>
                          <button onClick={()=>{
                            if(isEditing){setRrEditAssignId(null)} else {
                              setRrEditAssignId(a.id);setRrEditAE(a.assignedAE);setRrEditSeg(a.segment);setRrEditRegion(a.region);setRrEditAcct(a.accountName)
                            }
                          }} style={{fontSize:8,fontWeight:600,padding:'2px 6px',borderRadius:3,cursor:'pointer',border:`1px solid ${isEditing?C.amber:C.border2}`,background:isEditing?'rgba(245,166,35,0.12)':'transparent',color:isEditing?C.amber:C.text3}}>
                            {isEditing?'Cancel':'Edit'}
                          </button>
                          <button onClick={()=>{if(window.confirm(`Delete assignment for ${a.accountName}?`))saveAssignments(rrAssignments.filter(x=>x.id!==a.id))}} style={{fontSize:8,fontWeight:600,padding:'2px 6px',borderRadius:3,cursor:'pointer',border:`1px solid ${C.red}`,background:'transparent',color:C.red}}>
                            Del
                          </button>
                        </span>
                      </div>
                      {isEditing&&(
                        <div style={{padding:'8px 0 10px',display:'flex',gap:6,alignItems:'end',flexWrap:'wrap'}}>
                          <div style={{flex:'1 1 120px',minWidth:100}}>
                            <label style={{fontSize:8,fontWeight:700,color:C.text3,textTransform:'uppercase',display:'block',marginBottom:2}}>Account</label>
                            <input value={rrEditAcct} onChange={e=>setRrEditAcct(e.target.value)} style={{...inputStyle,fontSize:10,padding:'4px 7px'}}/>
                          </div>
                          <div style={{flex:'0 0 auto',minWidth:90}}>
                            <label style={{fontSize:8,fontWeight:700,color:C.text3,textTransform:'uppercase',display:'block',marginBottom:2}}>AE</label>
                            <select value={rrEditAE} onChange={e=>{
                              setRrEditAE(e.target.value)
                              const ae=rrRoster.find(r=>r.name===e.target.value)
                              if(ae){setRrEditSeg(ae.segment);setRrEditRegion(ae.region)}
                            }} style={{...inputStyle,fontSize:10,padding:'4px 7px'}}>
                              {rrRoster.filter(ae=>ae.status==='Active').map(ae=><option key={ae.id} value={ae.name}>{ae.name}</option>)}
                            </select>
                          </div>
                          <div style={{flex:'0 0 auto'}}>
                            <label style={{fontSize:8,fontWeight:700,color:C.text3,textTransform:'uppercase',display:'block',marginBottom:2}}>Segment</label>
                            <select value={rrEditSeg} onChange={e=>setRrEditSeg(e.target.value as 'Major'|'Commercial')} style={{...inputStyle,fontSize:10,padding:'4px 7px'}}>
                              <option value="Commercial">Commercial</option><option value="Major">Major</option>
                            </select>
                          </div>
                          <div style={{flex:'0 0 auto'}}>
                            <label style={{fontSize:8,fontWeight:700,color:C.text3,textTransform:'uppercase',display:'block',marginBottom:2}}>Region</label>
                            <select value={rrEditRegion} onChange={e=>setRrEditRegion(e.target.value as 'West'|'East')} style={{...inputStyle,fontSize:10,padding:'4px 7px'}}>
                              <option value="East">East</option><option value="West">West</option>
                            </select>
                          </div>
                          <button onClick={()=>{
                            if(!rrEditAcct.trim()||!rrEditAE) return
                            const aeMatch=rrRoster.find(r=>r.name===rrEditAE)
                            const updated=rrAssignments.map(x=>x.id===a.id?{...x,accountName:rrEditAcct.trim(),assignedAE:rrEditAE,calendarId:aeMatch?.calendarId||x.calendarId,segment:rrEditSeg,region:rrEditRegion}:x)
                            saveAssignments(updated);setRrEditAssignId(null)
                          }} style={{fontSize:9,fontWeight:700,padding:'5px 12px',borderRadius:5,border:'none',background:C.green,color:'#000',cursor:'pointer'}}>Save</button>
                        </div>
                      )}
                    </div>)
                  })}
                </div>
              )}
            </div>

            {/* ── Skip Log (collapsible) ── */}
            <div style={{...card,marginBottom:20}}>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <button onClick={()=>setRrShowSkipLog(!rrShowSkipLog)} style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',background:'none',border:'none',cursor:'pointer',padding:0}}>
                  {rrShowSkipLog?'▼':'▶'} Skip Log · {rrSkips.length}
                </button>
                {rrAssignments.length>0&&(
                  <button onClick={()=>{
                    const csv=['Account,Segment,Region,Assigned AE,Team,Meeting Time,Assigned At,Skipped,SE',...rrAssignments.map(a=>`"${a.accountName}",${a.segment},${a.region},${a.assignedAE},${allAEs.find(x=>x.name===a.assignedAE)?.team||''},${a.meetingTime},${a.assignedAt},"${a.skippedAEs.map(s=>s.name+':'+s.reason).join(';')}",${a.seIncluded||''}`)].join('\n')
                    const blob=new Blob([csv],{type:'text/csv'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=`rr-export-${new Date().toISOString().slice(0,10)}.csv`;a.click()
                  }} style={{fontSize:10,fontWeight:600,padding:'4px 10px',borderRadius:5,border:`1px solid ${C.border2}`,background:'transparent',color:C.text3,cursor:'pointer'}}>↓ CSV</button>
                )}
              </div>
              {rrShowSkipLog&&rrSkips.slice(0,20).map((s,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:`1px solid ${C.border}`,fontSize:10,marginTop:i===0?10:0}}>
                  <span style={{color:C.text3}}>{new Date(s.timestamp).toLocaleDateString('en-US',{month:'short',day:'numeric'})} · <span style={{color:C.red}}>{s.skippedAE}</span> → <span style={{color:C.green}}>{s.assignedTo}</span></span>
                  <span style={{color:C.text3}}>{s.reason} · {s.accountName}</span>
                </div>
              ))}
            </div>

            {/* ── Manager Controls ── */}
            {isManagerRole(auth)&&(
              <div style={{...card,marginBottom:20,opacity:0.8}}>
                <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10}}>Manager Controls</div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>
                  <button onClick={()=>{if(window.confirm('Reset all counts?')){saveAssignments([]);saveSkips([])}}} style={{fontSize:10,fontWeight:600,padding:'6px 12px',borderRadius:5,border:`1px solid ${C.red}`,background:'transparent',color:C.red,cursor:'pointer'}}>Reset Counts</button>
                </div>
                <div style={{fontSize:10,fontWeight:700,color:C.text3,marginBottom:6}}>Remove AE from rotation:</div>
                <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                  {allAEs.filter(ae=>ae.status==='Active').map(ae=>(
                    <button key={ae.name} onClick={()=>{
                      const removed=removedAEs.includes(ae.name)?removedAEs.filter(n=>n!==ae.name):[...removedAEs,ae.name]
                      saveMgr({...rrMgr,removedAEs:removed})
                    }} style={{fontSize:9,fontWeight:600,padding:'3px 8px',borderRadius:4,cursor:'pointer',
                      border:`1px solid ${removedAEs.includes(ae.name)?C.red:C.border2}`,
                      background:removedAEs.includes(ae.name)?'rgba(255,92,92,0.12)':'transparent',
                      color:removedAEs.includes(ae.name)?C.red:C.text3}}>
                      {ae.name}{removedAEs.includes(ae.name)?' ✕':''}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════
                LOG PAST MEETING MODAL
            ═══════════════════════════════════════════════════════ */}
            {rrShowBackfillModal&&(
              <div style={{position:'fixed',inset:0,zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.6)',backdropFilter:'blur(4px)'}} onClick={e=>{if(e.target===e.currentTarget){setRrShowBackfillModal(false);setRrBfPassErr(false)}}}>
                <div style={{background:C.surface,border:`1px solid ${C.border2}`,borderRadius:14,padding:28,width:440,maxHeight:'90vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                    <div style={{fontSize:18,fontWeight:800,color:C.text}}>Log Past Meeting</div>
                    <button onClick={()=>{setRrShowBackfillModal(false);setRrBfPassErr(false)}} style={{fontSize:18,background:'none',border:'none',color:C.text3,cursor:'pointer'}}>✕</button>
                  </div>
                  <div style={{display:'grid',gap:12}}>
                    <div>
                      <label style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',display:'block',marginBottom:4}}>AE *</label>
                      <select value={rrBfAE} onChange={e=>setRrBfAE(e.target.value)} style={{...inputStyle,fontSize:11}}>
                        <option value="">Select AE...</option>
                        {rrRoster.filter(ae=>ae.status==='Active').map(ae=><option key={ae.id} value={ae.name}>{ae.name} — {ae.segment} · {ae.region}</option>)}
                      </select>
                      {(()=>{const sel=rrRoster.find(a=>a.name===rrBfAE);return sel?<div style={{marginTop:5,display:'flex',gap:6,alignItems:'center'}}>
                        <span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:4,background:'rgba(123,110,246,0.15)',color:C.purpleL}}>{sel.segment}</span>
                        <span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:4,background:sel.region==='West'?'rgba(96,212,244,0.15)':'rgba(0,229,160,0.15)',color:sel.region==='West'?'#60d4f4':C.green}}>{sel.region} Coast</span>
                        <span style={{fontSize:9,color:C.text3}}>Team {sel.team} · SE: {SE_ROSTER[sel.se]?.name||sel.se}</span>
                      </div>:null})()}
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                      <div>
                        <label style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',display:'block',marginBottom:4}}>Meeting Date *</label>
                        <input type="date" value={rrBfDate} onChange={e=>setRrBfDate(e.target.value)} style={{...inputStyle,fontSize:11}}/>
                      </div>
                      <div>
                        <label style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',display:'block',marginBottom:4}}>Meeting Time</label>
                        <input type="time" value={rrBfTime} onChange={e=>setRrBfTime(e.target.value)} style={{...inputStyle,fontSize:11}} placeholder="Optional"/>
                      </div>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                      <div>
                        <label style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',display:'block',marginBottom:4}}>Prospect Name *</label>
                        <input value={rrBfProspectName} onChange={e=>setRrBfProspectName(e.target.value)} placeholder="First Last" style={{...inputStyle,fontSize:11}}/>
                      </div>
                      <div>
                        <label style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',display:'block',marginBottom:4}}>Prospect Company *</label>
                        <input value={rrBfCompany} onChange={e=>setRrBfCompany(e.target.value)} placeholder="Company name" style={{...inputStyle,fontSize:11}}/>
                      </div>
                    </div>
                    <div>
                      <label style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',display:'block',marginBottom:4}}>Source</label>
                      <select value={rrBfSource} onChange={e=>setRrBfSource(e.target.value)} style={{...inputStyle,fontSize:11}}>
                        {BACKFILL_SOURCES.map(s=><option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',display:'block',marginBottom:4}}>Salesforce URL</label>
                      <input value={rrBfSfUrl} onChange={e=>setRrBfSfUrl(e.target.value)} placeholder="https://qawolf.lightning.force.com/..." style={{...inputStyle,fontSize:11}}/>
                    </div>
                    <div>
                      <label style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',display:'block',marginBottom:4}}>Notes</label>
                      <textarea value={rrBfNotes} onChange={e=>setRrBfNotes(e.target.value)} placeholder="Optional notes..." rows={3} style={{...inputStyle,fontSize:11,resize:'vertical'}}/>
                    </div>
                    <button onClick={()=>{
                      if(!rrBfAE||!rrBfProspectName.trim()||!rrBfCompany.trim()||!rrBfDate) return
                      const aeMatch=rrRoster.find(a=>a.name===rrBfAE)
                      if(!aeMatch) return
                      const mtDate=rrBfTime?new Date(`${rrBfDate}T${rrBfTime}:00`):new Date(`${rrBfDate}T12:00:00`)
                      const assignment:RRAssignment={
                        id:`rr-manual-${Date.now()}`,
                        accountName:`${rrBfProspectName.trim()} — ${rrBfCompany.trim()}`,
                        segment:aeMatch.segment,region:aeMatch.region,
                        assignedAE:aeMatch.name,calendarId:aeMatch.calendarId,
                        meetingTime:mtDate.toISOString(),
                        assignedAt:new Date().toISOString(),
                        skippedAEs:[],
                        manualBackfill:true,
                        prospectName:rrBfProspectName.trim(),
                        prospectCompany:rrBfCompany.trim(),
                        source:rrBfSource,
                        sfUrl:rrBfSfUrl.trim()||undefined,
                        notes:rrBfNotes.trim()||undefined,
                      }
                      saveAssignments([assignment,...rrAssignments])
                      setRrBfAE('');setRrBfDate('');setRrBfTime('');setRrBfProspectName('');setRrBfCompany('');setRrBfSource('Inbound MQL');setRrBfSfUrl('');setRrBfNotes('')
                      setRrShowBackfillModal(false)
                    }} disabled={!rrBfAE||!rrBfProspectName.trim()||!rrBfCompany.trim()||!rrBfDate}
                      style={{padding:'10px 0',borderRadius:8,border:'none',fontWeight:700,fontSize:12,cursor:(!rrBfAE||!rrBfProspectName.trim()||!rrBfCompany.trim()||!rrBfDate)?'not-allowed':'pointer',background:(!rrBfAE||!rrBfProspectName.trim()||!rrBfCompany.trim()||!rrBfDate)?C.surface3:C.green,color:(!rrBfAE||!rrBfProspectName.trim()||!rrBfCompany.trim()||!rrBfDate)?C.text3:'#000',opacity:(!rrBfAE||!rrBfProspectName.trim()||!rrBfCompany.trim()||!rrBfDate)?0.5:1}}>
                      Log Meeting
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════
                MANAGE AEs MODAL
            ═══════════════════════════════════════════════════════ */}
            {rrShowManageModal&&(()=>{
              const closeManage=()=>{setRrShowManageModal(false);setRrMgmtEditId(null);setRrMgmtAddOpen(false);setRrMgmtPassErr(false);setRrMgmtPass('');setRrMgmtToast('')}
              const resetForm=()=>{setRrMgmtName('');setRrMgmtEmail('');setRrMgmtCalEmail('');setRrMgmtSe('Ricky');setRrMgmtSeg('Commercial');setRrMgmtRegion('East');setRrMgmtStatus('Active')}
              const emailValid=(e:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
              const startEdit=(ae:RosterAE)=>{setRrMgmtEditId(ae.id);setRrMgmtAddOpen(false);setRrMgmtName(ae.name);setRrMgmtEmail(ae.calendarId);setRrMgmtCalEmail(ae.calendarId);setRrMgmtSe(ae.se);setRrMgmtSeg(ae.segment);setRrMgmtRegion(ae.region);setRrMgmtStatus(ae.status)}
              const startAdd=()=>{setRrMgmtEditId(null);setRrMgmtAddOpen(true);resetForm()}
              const showToast=(msg:string)=>{setRrMgmtToast(msg);setTimeout(()=>setRrMgmtToast(''),4000)}
              const formValid=rrMgmtName.trim()&&emailValid(rrMgmtEmail)&&rrMgmtCalEmail.trim()
              const formFields=(<div style={{display:'grid',gap:10,marginTop:12,padding:14,background:C.surface2,borderRadius:8,border:`1px solid ${C.border}`}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  <div>
                    <label style={{fontSize:9,fontWeight:700,color:C.text3,textTransform:'uppercase',display:'block',marginBottom:3}}>Full Name *</label>
                    <input value={rrMgmtName} onChange={e=>setRrMgmtName(e.target.value)} style={{...inputStyle,fontSize:11}} placeholder="Full name"/>
                  </div>
                  <div>
                    <label style={{fontSize:9,fontWeight:700,color:C.text3,textTransform:'uppercase',display:'block',marginBottom:3}}>Email *</label>
                    <input value={rrMgmtEmail} onChange={e=>setRrMgmtEmail(e.target.value)} style={{...inputStyle,fontSize:11,borderColor:rrMgmtEmail&&!emailValid(rrMgmtEmail)?C.red:undefined}} placeholder="ae@qawolf.com"/>
                  </div>
                </div>
                <div>
                  <label style={{fontSize:9,fontWeight:700,color:C.text3,textTransform:'uppercase',display:'block',marginBottom:3}}>Google Calendar Email *</label>
                  <input value={rrMgmtCalEmail} onChange={e=>setRrMgmtCalEmail(e.target.value)} style={{...inputStyle,fontSize:11}} placeholder="calendar@qawolf.com"/>
                  <div style={{fontSize:8,color:C.text3,marginTop:2}}>Adding an AE here registers them in the dashboard. Don{"'"}t forget to subscribe to their calendar in your Google Calendar settings.</div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                  <div>
                    <label style={{fontSize:9,fontWeight:700,color:C.text3,textTransform:'uppercase',display:'block',marginBottom:3}}>Assigned SE</label>
                    <select value={rrMgmtSe} onChange={e=>setRrMgmtSe(e.target.value)} style={{...inputStyle,fontSize:11}}>
                      {Object.entries(SE_ROSTER).map(([k,v])=><option key={k} value={k}>{v.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{fontSize:9,fontWeight:700,color:C.text3,textTransform:'uppercase',display:'block',marginBottom:3}}>Segment</label>
                    <select value={rrMgmtSeg} onChange={e=>setRrMgmtSeg(e.target.value as 'Major'|'Commercial')} style={{...inputStyle,fontSize:11}}>
                      <option value="Commercial">Commercial</option><option value="Major">Major</option>
                    </select>
                  </div>
                  <div>
                    <label style={{fontSize:9,fontWeight:700,color:C.text3,textTransform:'uppercase',display:'block',marginBottom:3}}>Region</label>
                    <select value={rrMgmtRegion} onChange={e=>setRrMgmtRegion(e.target.value as 'West'|'East')} style={{...inputStyle,fontSize:11}}>
                      <option value="East">East</option><option value="West">West</option>
                    </select>
                  </div>
                </div>
                {rrMgmtEditId&&(
                  <div>
                    <label style={{fontSize:9,fontWeight:700,color:C.text3,textTransform:'uppercase',display:'block',marginBottom:3}}>Status</label>
                    <select value={rrMgmtStatus} onChange={e=>setRrMgmtStatus(e.target.value as 'Active'|'Inactive')} style={{...inputStyle,fontSize:11}}>
                      <option value="Active">Active</option><option value="Inactive">Inactive</option>
                    </select>
                  </div>
                )}
                <div>
                  <label style={{fontSize:9,fontWeight:700,color:C.text3,textTransform:'uppercase',display:'block',marginBottom:3}}>Manager Passcode *</label>
                  <input type="password" value={rrMgmtPass} onChange={e=>{setRrMgmtPass(e.target.value);setRrMgmtPassErr(false)}} style={{...inputStyle,fontSize:11,borderColor:rrMgmtPassErr?C.red:undefined}} placeholder="Enter passcode"/>
                  {rrMgmtPassErr&&<div style={{fontSize:9,color:C.red,marginTop:2}}>Incorrect passcode</div>}
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>{
                    if(rrMgmtPass!=='johnnywolfpack2026'){setRrMgmtPassErr(true);return}
                    if(!formValid) return
                    if(rrMgmtEditId){
                      const updated=rrRoster.map(ae=>ae.id===rrMgmtEditId?{...ae,name:rrMgmtName.trim(),calendarId:rrMgmtCalEmail.trim(),se:rrMgmtSe,team:SE_TO_TEAM[rrMgmtSe]||rrMgmtSe,segment:rrMgmtSeg,region:rrMgmtRegion,status:rrMgmtStatus}:ae)
                      saveRoster(updated);setRrMgmtEditId(null);resetForm();setRrMgmtPass('');showToast(rrMgmtStatus==='Inactive'?`${rrMgmtName.trim()} deactivated. Historical data preserved.`:`${rrMgmtName.trim()} updated.`)
                    } else {
                      const newAE:RosterAE={id:`ae-${Date.now()}`,name:rrMgmtName.trim(),calendarId:rrMgmtCalEmail.trim(),se:rrMgmtSe,team:SE_TO_TEAM[rrMgmtSe]||rrMgmtSe,segment:rrMgmtSeg,region:rrMgmtRegion,status:'Active',dateAdded:new Date().toISOString().slice(0,10)}
                      saveRoster([...rrRoster,newAE]);setRrMgmtAddOpen(false);resetForm();setRrMgmtPass('')
                      showToast(`AE added to roster. Don't forget to subscribe to their calendar in your Google Calendar settings.`)
                    }
                  }} disabled={!formValid||!rrMgmtPass} style={{flex:1,padding:'8px 0',borderRadius:6,border:'none',fontWeight:700,fontSize:11,cursor:(!formValid||!rrMgmtPass)?'not-allowed':'pointer',background:(!formValid||!rrMgmtPass)?C.surface3:C.green,color:(!formValid||!rrMgmtPass)?C.text3:'#000',opacity:(!formValid||!rrMgmtPass)?0.5:1}}>
                    {rrMgmtEditId?'Save Changes':'Add AE'}
                  </button>
                  <button onClick={()=>{rrMgmtEditId?setRrMgmtEditId(null):setRrMgmtAddOpen(false);resetForm();setRrMgmtPass('');setRrMgmtPassErr(false)}} style={{padding:'8px 16px',borderRadius:6,border:`1px solid ${C.border2}`,background:'transparent',color:C.text3,fontSize:11,fontWeight:600,cursor:'pointer'}}>Cancel</button>
                </div>
              </div>)
              return (
                <div style={{position:'fixed',inset:0,zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.6)',backdropFilter:'blur(4px)'}} onClick={e=>{if(e.target===e.currentTarget)closeManage()}}>
                  <div style={{background:C.surface,border:`1px solid ${C.border2}`,borderRadius:14,padding:28,width:560,maxHeight:'90vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                      <div style={{fontSize:18,fontWeight:800,color:C.text}}>Manage AEs</div>
                      <div style={{display:'flex',gap:8,alignItems:'center'}}>
                        {!rrMgmtAddOpen&&!rrMgmtEditId&&<button onClick={startAdd} style={{fontSize:11,fontWeight:700,padding:'6px 14px',borderRadius:6,border:'none',background:C.green,color:'#000',cursor:'pointer'}}>+ Add AE</button>}
                        <button onClick={closeManage} style={{fontSize:18,background:'none',border:'none',color:C.text3,cursor:'pointer'}}>✕</button>
                      </div>
                    </div>
                    {rrMgmtToast&&<div style={{marginBottom:12,padding:'8px 12px',borderRadius:6,background:'rgba(0,229,160,0.12)',border:`1px solid rgba(0,229,160,0.3)`,fontSize:10,color:C.green,fontWeight:600}}>{rrMgmtToast}</div>}
                    {rrMgmtAddOpen&&!rrMgmtEditId&&formFields}
                    <div style={{marginTop:rrMgmtAddOpen?16:0}}>
                      <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>Active AEs ({rrRoster.filter(a=>a.status==='Active').length})</div>
                      {rrRoster.filter(a=>a.status==='Active').map(ae=>(
                        <div key={ae.id}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:`1px solid ${C.border}`}}>
                            <div>
                              <div style={{fontSize:12,fontWeight:600,color:C.text}}>{ae.name}</div>
                              <div style={{fontSize:9,color:C.text3}}>{ae.calendarId} · {ae.segment} · {ae.region} · SE: {SE_ROSTER[ae.se]?.name||ae.se} · Added {ae.dateAdded}</div>
                            </div>
                            <div style={{display:'flex',gap:4}}>
                              <button onClick={()=>startEdit(ae)} style={{fontSize:9,fontWeight:600,padding:'3px 8px',borderRadius:4,cursor:'pointer',border:`1px solid ${C.border2}`,background:'transparent',color:C.text3}}>Edit</button>
                              <button onClick={()=>{
                                if(!window.confirm(`Deactivate ${ae.name}? They will be removed from the active queue but historical data is preserved.`)) return
                                const p=window.prompt('Enter manager passcode:')
                                if(p!=='johnnywolfpack2026'){if(p!==null)alert('Incorrect passcode');return}
                                saveRoster(rrRoster.map(a=>a.id===ae.id?{...a,status:'Inactive' as const}:a))
                                showToast(`${ae.name} deactivated. Historical data preserved.`)
                              }} style={{fontSize:9,fontWeight:600,padding:'3px 8px',borderRadius:4,cursor:'pointer',border:`1px solid ${C.red}`,background:'transparent',color:C.red}}>Deactivate</button>
                            </div>
                          </div>
                          {rrMgmtEditId===ae.id&&formFields}
                        </div>
                      ))}
                      {rrRoster.some(a=>a.status==='Inactive')&&(
                        <>
                          <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginTop:16,marginBottom:8}}>Inactive AEs ({rrRoster.filter(a=>a.status==='Inactive').length})</div>
                          {rrRoster.filter(a=>a.status==='Inactive').map(ae=>(
                            <div key={ae.id}>
                              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:`1px solid ${C.border}`,opacity:0.6}}>
                                <div>
                                  <div style={{fontSize:12,fontWeight:600,color:C.text}}>{ae.name}</div>
                                  <div style={{fontSize:9,color:C.text3}}>{ae.calendarId} · {ae.segment} · {ae.region} · SE: {SE_ROSTER[ae.se]?.name||ae.se}</div>
                                </div>
                                <div style={{display:'flex',gap:4}}>
                                  <button onClick={()=>startEdit(ae)} style={{fontSize:9,fontWeight:600,padding:'3px 8px',borderRadius:4,cursor:'pointer',border:`1px solid ${C.border2}`,background:'transparent',color:C.text3}}>Edit</button>
                                  <button onClick={()=>{
                                    const p=window.prompt('Enter manager passcode to reactivate:')
                                    if(p!=='johnnywolfpack2026'){if(p!==null)alert('Incorrect passcode');return}
                                    saveRoster(rrRoster.map(a=>a.id===ae.id?{...a,status:'Active' as const}:a))
                                    showToast(`${ae.name} reactivated. They join at the back of the queue.`)
                                  }} style={{fontSize:9,fontWeight:600,padding:'3px 8px',borderRadius:4,cursor:'pointer',border:`1px solid ${C.green}`,background:'transparent',color:C.green}}>Reactivate</button>
                                </div>
                              </div>
                              {rrMgmtEditId===ae.id&&formFields}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}
          </>)
        })()}
      </main>

      {/* ── Create Contact Modal ── */}
      {showCreate&&<CreateContactModal onSave={createContact} onClose={()=>setShowCreate(false)}/>}
    </div>
  )
}
