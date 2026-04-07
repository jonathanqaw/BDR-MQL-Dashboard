'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import React from 'react'
import type { Lead } from '@/lib/slack'
import SalesforceWidget from './components/SalesforceWidget'

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

const MANAGER_PASSCODE = 'johnnywolfpack2026'

type AuthState = { role: 'manager' } | { role: 'rep'; repId: string } | null

// ─── Types ────────────────────────────────────────────────────────────────────
type Status       = 'new' | 'contacted' | 'inprogress' | 'booked' | 'nurture' | 'lost' | 'na' | 'dq' | 'closedwon'
type View         = 'pipeline' | 'analytics' | 'reporting'
type PeriodFilter = 'week' | 'month' | 'quarter' | 'all'
type WorkedFilter = 'all' | 'worked' | 'untouched'
type StatusFilter = 'all' | Status
type ReportTimeframe = 'monthly' | 'quarterly' | 'custom'
type ReportScope = 'all_bdrs' | 'individual_bdr'
type ReportType = 'full_funnel' | 'pipeline_performance' | 'mql_quality' | 'conversion_analysis'

interface LeadDetail {
  prospectName: string; title: string; sourceChannel: string; outreachChannel: string
  connectedDate: string; meetingDate: string; nextStep: string; nextStepStatus: string
  sqlDq: string; sqlDate: string; ae: string; multithreading: string
  sqo: string; sqoDate: string; acv: string; closedWon: string; closedWonDate: string; notes: string; sfLink: string
  mqlQuality: string  // '' | 'hq' | 'lq' | 'dq'
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
  mqlQuality:''
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

// ─── Dropdown options ─────────────────────────────────────────────────────────
const SOURCE_CHANNELS  = ['','#growth-wins','#leads-bot','leads-platform waitlist','gated-content','QA Wolf inbox','webinar','AE assist','gen OB','Other']
const OUTREACH_CH      = ['','Email','LinkedIn','Call','Other']
const NEXT_STEPS       = ['','Discovery Call','Demo','Sample Tests','Reconnect','Other']
const NEXT_STEP_STATUS = ['','In Progress','Discovery Held','Waiting for AE','TBD - Evaluation','Scheduled']
const SQL_OPTIONS      = ['','Yes','No','Pending']
const SQO_OPTIONS      = ['','Yes','No']
const CLOSED_WON_OPTIONS = ['','Yes','No']
const MT_OPTIONS       = ['','Yes','No']

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
                <button
                  onClick={async()=>{
                    const url = lead.sfUrl || d.sfLink
                    if (!url) {
                      alert('Add a Salesforce link first.')
                      return
                    }
                    try {
                      setHydrating(true)
                      const res = await fetch('http://localhost:3030/hydrate', {
                        method:'POST',
                        headers:{'Content-Type':'application/json'},
                        body: JSON.stringify({ url })
                      })
                      const json = await res.json()
                      if (!json?.success || !json?.data) {
                        alert('Hydration failed.')
                        return
                      }
                      const data = json.data
                      setD(prev => ({
                        ...prev,
                        prospectName: data.name || prev.prospectName,
                        title: data.title || prev.title,
                        sfLink: data.url || url,
                        sqlDate: toDateInputValue(data.sqlDate || prev.sqlDate),
                        connectedDate: toDateInputValue(data.mqlDate || prev.connectedDate),
                        meetingDate: toDateInputValue(data.meetingBookedDate || prev.meetingDate),
                      }))
                    } catch {
                      alert('Could not reach local Salesforce agent.')
                    } finally {
                      setHydrating(false)
                    }
                  }}
                  style={{marginLeft:8,fontSize:11,fontWeight:600,padding:'4px 10px',borderRadius:999,border:`1px solid ${C.purple}`,background:'rgba(123,110,246,0.14)',color:C.purpleL,cursor:'pointer'}}
                >
                  {hydrating ? 'Hydrating…' : 'Hydrate from SF'}
                </button>
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
            <Field label="Source Channel"><Sel value={d.sourceChannel} onChange={setVal('sourceChannel')} opts={SOURCE_CHANNELS}/></Field>
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
                {val:'dq', label:'DQ',     desc:'Not ICP',    color:C.red,     dim:'rgba(255,92,92,0.12)',  border:'rgba(255,92,92,0.35)'},
              ].map(opt=>{
                const active = d.mqlQuality===opt.val
                return (
                  <button
                    key={opt.val}
                    onMouseDown={stopProp}
                    onClick={e=>{e.stopPropagation(); setVal('mqlQuality')(active?'':opt.val)}}
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

          <div style={{display:'grid',gridTemplateColumns:'160px 140px 160px 260px 1fr',gap:12}}>
            <Field label="ACV ($)"><Inp value={d.acv} onChange={setVal('acv')} placeholder="e.g. 72000"/></Field>
            <Field label="Closed-Won"><Sel value={d.closedWon} onChange={setVal('closedWon')} opts={CLOSED_WON_OPTIONS}/></Field>
            <Field label="Closed-Won Date"><DateField value={d.closedWonDate} onChange={setVal('closedWonDate')}/></Field>
            <Field label="Salesforce Link"><Inp value={d.sfLink} onChange={setVal('sfLink')} placeholder="https://qawolf1.lightning.force.com/…"/></Field>
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
  const [groupBy,  setGroupBy]  = useState<'day'|'week'>('week')
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
          {(['week','day'] as const).map(g=>(
            <button key={g} onClick={()=>setGroupBy(g)}
                    style={{fontSize:11,fontWeight:600,padding:'4px 10px',borderRadius:6,cursor:'pointer',border:`1px solid ${groupBy===g?C.purple:C.border2}`,background:groupBy===g?'rgba(123,110,246,0.18)':'transparent',color:groupBy===g?C.purpleL:C.text3}}>
              {g==='week'?'Weekly':'Daily'}
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
        <span style={{fontSize:10,color:C.text3,marginLeft:'auto'}}>{bars.length} {groupBy==='week'?'weeks':'days'} shown</span>
      </div>

      {/* Bars */}
      <div style={{display:'flex',alignItems:'flex-end',gap:groupBy==='week'?8:4,height:barH+40,position:'relative',overflowX:'hidden'}}>
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
                 style={{display:'flex',flexDirection:'column',alignItems:'center',flex:1,minWidth:groupBy==='week'?32:16,cursor:'default',transition:'opacity 0.15s',opacity:hovered!==null&&!isHov?0.4:1,position:'relative'}}>
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
              <span style={{fontSize:groupBy==='week'?9:7,color:isHov?(b.isLive?C.green:C.purpleL):C.text3,
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
  const [passcode, setPasscode] = useState('')
  const [passErr, setPassErr] = useState(false)
  const [activeRepId, setActiveRepId] = useState('jonathan')
  const [ecSaving, setEcSaving] = useState(false)
  const [reps, setReps] = useState<Rep[]>(DEFAULT_REPS)
  const [showRepEditor, setShowRepEditor] = useState(false)
  const [editingRep, setEditingRep] = useState<Rep|null>(null)

  // ── Auth: check sessionStorage on mount ───────────────────────────────────
  useEffect(()=>{
    const saved = sessionStorage.getItem('mql-auth')
    if (saved) { try { setAuth(JSON.parse(saved)) } catch {} }
    // Check URL param for direct rep access (bypasses login)
    const params = new URLSearchParams(window.location.search)
    const repParam = params.get('rep')
    if (repParam) {
      const a:AuthState = { role:'rep', repId: repParam }
      setAuth(a); sessionStorage.setItem('mql-auth', JSON.stringify(a))
    }
    // Load rep registry from Edge Config
    fetch('/api/rep-data?repId=__registry__').then(r=>r.json()).then(({data})=>{
      if (data?.reps) setReps(data.reps)
    }).catch(()=>{})
  },[])

  const handleLogin=()=>{
    if (passcode === MANAGER_PASSCODE) {
      const a:AuthState = { role:'manager' }
      setAuth(a); sessionStorage.setItem('mql-auth', JSON.stringify(a))
      setPassErr(false)
    } else {
      // Check rep passcodes
      const rep = reps.find(r=>r.passcode && r.passcode===passcode)
      if (rep) {
        const a:AuthState = { role:'rep', repId: rep.id }
        setAuth(a); sessionStorage.setItem('mql-auth', JSON.stringify(a))
        setPassErr(false)
      } else {
        setPassErr(true)
      }
    }
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
  const currentRep = auth?.role==='manager'
    ? (reps.find(r=>r.id===activeRepId) || reps[0])
    : auth?.role==='rep'
    ? (reps.find(r=>r.id===auth.repId) || reps[0])
    : reps[0]

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
  const [worked,     setWorked]     = useState<WorkedFilter>('all')
  const [stFilter,   setStFilter]   = useState<StatusFilter>('all')
  const [reportTimeframe, setReportTimeframe] = useState<ReportTimeframe>('quarterly')
  const [reportScope, setReportScope] = useState<ReportScope>('all_bdrs')
  const [reportBdrId, setReportBdrId] = useState<string>('')
  const [reportType, setReportType] = useState<ReportType>('full_funnel')
  const [reportRangeStart, setReportRangeStart] = useState('')
  const [reportRangeEnd, setReportRangeEnd] = useState('')
  const [reportGenerated, setReportGenerated] = useState(false)
  const [oppPeriod,setOppPeriod]=useState<'week'|'month'|'quarter'>('quarter')
  const [oppMode,setOppMode]=useState<'sqo'|'active'|'lost'|'closedwon'>('sqo')
  const [oppFrom,setOppFrom]=useState('')
  const [oppTo,setOppTo]=useState('')
  const [mqlView,setMqlView]=useState<'daily'|'quarterly'>('daily')
  const [detailFilter,setDetailFilter]=useState<'none'|'sql'|'sqo'>('none')
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

  const getManualLeads=():AppLead[]=>{ try { return JSON.parse(localStorage.getItem('mql-manual')||'[]') } catch { return [] } }
  const saveManualLeads=(leads:AppLead[])=>{ localStorage.setItem('mql-manual',JSON.stringify(leads)) }

  const getDeletedEmails=():Set<string>=>{ try { return new Set(JSON.parse(localStorage.getItem('mql-deleted')||'[]')) } catch { return new Set() } }
  const deleteAccount=(email:string)=>{
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
    const seeded=localStorage.getItem('mql-seeded-version')
    const st=getSt(); const dt=getDetails()
    // Only fill in MISSING entries — never overwrite what the user has set
    HISTORICAL_LEADS.forEach(l=>{
      if (!st[l.email]) st[l.email]=HISTORICAL_STATUSES[l.email]||'new'
      if (!dt[l.email]) dt[l.email]={...EMPTY_DETAIL,...(HISTORICAL_DETAILS[l.email]||{})}
    })
    localStorage.setItem('mql-st',JSON.stringify(st))
    localStorage.setItem('mql-dt',JSON.stringify(dt))
    localStorage.setItem('mql-seeded-version',DATA_VERSION)
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

  // Load Edge Config data only when manager switches to a different rep
  const prevRepId = useRef<string>('')
  useEffect(()=>{
    if (!currentRep?.slackId) return
    if (prevRepId.current === currentRep.id) return  // same rep, don't reload
    if (auth?.role !== 'manager') return  // only manager switches reps
    prevRepId.current = currentRep.id
    loadFromEdgeConfig(currentRep.slackId).then(()=>{
      setStatuses(getSt()); setDetails(getDetails())
      setManualLeads(getManualLeads()); setDeletedEmails(getDeletedEmails())
    })
  },[currentRep?.id, auth?.role])

  const updateStatus=(email:string,v:Status)=>{ saveSt(email,v); setStatuses(p=>({...p,[email]:v})); saveSnapshot('status'); syncToEdgeConfig() }
  const updateDetail=(email:string,d:LeadDetail)=>{ saveDetail(email,d); setDetails(p=>({...p,[email]:d})); saveSnapshot('detail'); syncToEdgeConfig() }
  const copyEmail=(email:string)=>{ navigator.clipboard.writeText(email).then(()=>{ setCopied(email); setTimeout(()=>setCopied(null),2000) }) }

  const createContact=(account:string,email:string,domain:string)=>{
    const newLead:AppLead={ email, domain, account, name:null, sfUrl:null, date:new Date().toISOString().split('T')[0], receivedAt:new Date().toISOString(), source:'bdr', repSlackId: currentRep?.slackId||null, repId: currentRep?.id||null, isManual:true }
    const updated=[...manualLeads,newLead]
    setManualLeads(updated); saveManualLeads(updated)
    saveSt(email,'new')
    setStatuses(p=>({...p,[email]:'new'}))
    setShowCreate(false)
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
  const periodStart=getPeriodStart(period)
  const pipelineLeads=allLeads.filter(l=>{
    if (!l.receivedAt) return false
    if (new Date(l.receivedAt)<periodStart) return false
    const s=statuses[l.email]||'new'
    if (worked==='worked'&&s==='new') return false
    if (worked==='untouched'&&s!=='new') return false
    if (stFilter!=='all'&&s!==stFilter) return false
    const det=details[l.email]
    if (detailFilter==='sql'&&(det?.sqlDq||'')==='Yes'===false) return false
    if (detailFilter==='sql'&&(det?.sqlDq||'')!=='Yes') return false
    if (detailFilter==='sqo'&&(det?.sqo||'')!=='Yes') return false
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

  // Bar: group leads by week or month, stacked by status, with optional date range filter
  const buildBars=(groupBy:'week'|'month'|'quarter')=>{
    const groups=new Map<string,{label:string;date:Date;byStatus:Record<Status,number>;leads:AppLead[]}>()
    allLeads.forEach(l=>{
      if (!l.receivedAt) return
      const d=new Date(l.receivedAt)
      if (chartFrom && d < new Date(chartFrom)) return
      if (chartTo   && d > new Date(chartTo+'T23:59:59')) return
      const key=groupBy==='week'?getWeekLabel(d):getMonthLabel(d)
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

  const reportBaseLeads =
  reportScope === 'individual_bdr' && reportBdrId
    ? allLeads.filter(l => {
        const rep = reps.find(r => r.id === reportBdrId)
        if (!rep) return false

        // Manager view should include unassigned leads plus anything explicitly assigned to Jonathan
        if (rep.id === 'jonathan') {
          return !l.repSlackId || (rep.slackId && l.repSlackId === rep.slackId)
        }

        // Individual reps only see leads explicitly assigned to them
        return !!rep.slackId && l.repSlackId === rep.slackId
      })
    : allLeads
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
  const reportPipeline = reportBaseLeads.reduce((sum,l)=>sum + (parseInt(details[l.email]?.acv || '0') || 0), 0)

  const reportSummaryText = `Generated ${reportTotal} leads, ${reportSqlCount} SQLs (${pct(reportSqlCount, reportTotal)}%), ${reportSqoCount} SQOs (${pct(reportSqoCount, reportSqlCount || reportTotal)}%), and $${reportPipeline.toLocaleString()} in pipeline.`

  const reportRatioCards = [
    { label:'New → Contacted', value:`${pct(reportStatusCounts.contacted, reportStatusCounts.new || reportStatusCounts.contacted)}%`, sub:`${reportStatusCounts.contacted} progressed` },
    { label:'Contacted → In Progress', value:`${pct(reportStatusCounts.inprogress, reportStatusCounts.contacted || reportStatusCounts.inprogress)}%`, sub:`${reportStatusCounts.inprogress} progressed` },
    { label:'In Progress → Booked', value:`${pct(reportStatusCounts.booked, reportStatusCounts.inprogress || reportStatusCounts.booked)}%`, sub:`${reportStatusCounts.booked} progressed` },
    { label:'Booked → SQL', value:`${pct(reportSqlCount, reportStatusCounts.booked || reportSqlCount)}%`, sub:`${reportSqlCount} SQLs` },
    { label:'SQL → SQO', value:`${pct(reportSqoCount, reportSqlCount || reportSqoCount)}%`, sub:`${reportSqoCount} SQOs` },
    { label:'Lost %', value:`${pct(reportStatusCounts.lost, reportTotal)}%`, sub:`${reportStatusCounts.lost} lost` },
    { label:'DQ %', value:`${pct(reportStatusCounts.dq, reportTotal)}%`, sub:`${reportStatusCounts.dq} DQ` },
    { label:'Nurture Pool', value:`${pct(reportStatusCounts.nurture, reportTotal)}%`, sub:`${reportStatusCounts.nurture} in nurture` },
  ]


  const reportSourceRows = Object.entries(
    reportBaseLeads.reduce((acc, lead) => {
      const source = (details[lead.email]?.sourceChannel || lead.source || 'unknown').toString()
      if (!acc[source]) acc[source] = { mqls:0, sqls:0, sqos:0, pipeline:0 }
      acc[source].mqls += 1
      if ((details[lead.email]?.sqlDq || '').toLowerCase() === 'yes') acc[source].sqls += 1
      if ((details[lead.email]?.sqo || '').toLowerCase() === 'yes') acc[source].sqos += 1
      acc[source].pipeline += parseInt(details[lead.email]?.acv || '0') || 0
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
    const pipeline = repLeads.reduce((sum,l)=>sum + (parseInt(details[l.email]?.acv || '0') || 0), 0)

    return {
      name: rep.name,
      mqls: repLeads.length,
      sqls,
      sqos,
      pipeline,
    }
  })

  const progressionRatios = [
    { label:'New → Contacted', value:pct(reportStatusCounts.contacted, reportStatusCounts.new || reportStatusCounts.contacted) },
    { label:'Contacted → In Progress', value:pct(reportStatusCounts.inprogress, reportStatusCounts.contacted || reportStatusCounts.inprogress) },
    { label:'In Progress → Booked', value:pct(reportStatusCounts.booked, reportStatusCounts.inprogress || reportStatusCounts.booked) },
    { label:'Booked → SQL', value:pct(reportSqlCount, reportStatusCounts.booked || reportSqlCount) },
    { label:'SQL → SQO', value:pct(reportSqoCount, reportSqlCount || reportSqoCount) },
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



  const getReportRange = () => {
    const now = new Date()
    let start = new Date(now)
    let end = new Date(now)

    if (reportTimeframe === 'monthly') {
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    } else if (reportTimeframe === 'quarterly') {
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3
      start = new Date(now.getFullYear(), qStartMonth, 1)
      end = new Date(now.getFullYear(), qStartMonth + 3, 0)
    } else if (reportTimeframe === 'custom' && reportRangeStart && reportRangeEnd) {
      start = new Date(reportRangeStart + 'T00:00:00')
      end = new Date(reportRangeEnd + 'T23:59:59')
    } else {
      start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
      end = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0)
    }

    return { start, end }
  }

  const { start: reportStart, end: reportEnd } = getReportRange()
  const rangeMs = Math.max(1, reportEnd.getTime() - reportStart.getTime())
  const prevStart = new Date(reportStart.getTime() - rangeMs)
  const prevEnd = new Date(reportEnd.getTime() - rangeMs)

  const inRange = (lead:any, start:Date, end:Date) => {
    const d = lead.date ? new Date(lead.date + 'T12:00:00') : null
    return !!d && d >= start && d <= end
  }

  const currentPeriodLeads = reportBaseLeads.filter(l => inRange(l, reportStart, reportEnd))
  const previousPeriodLeads = reportBaseLeads.filter(l => inRange(l, prevStart, prevEnd))

  const calcPeriodMetrics = (leads:any[]) => {
    const total = leads.length
    const sqls = leads.filter(l => (details[l.email]?.sqlDq || '').toLowerCase() === 'yes').length
    const sqos = leads.filter(l => (details[l.email]?.sqo || '').toLowerCase() === 'yes').length
    const pipeline = leads.reduce((sum,l)=>sum + (parseInt(details[l.email]?.acv || '0') || 0), 0)
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
        <div style={{fontSize:13,color:C.text3,marginBottom:28}}>QA Wolf · Manager Access</div>
        <input
          type="password"
          placeholder="Enter passcode"
          value={passcode}
          onChange={e=>{setPasscode(e.target.value);setPassErr(false)}}
          onKeyDown={e=>e.key==='Enter'&&handleLogin()}
          style={{width:'100%',padding:'10px 14px',borderRadius:8,border:`1px solid ${passErr?C.red:C.border2}`,background:C.surface2,color:C.text,fontSize:14,outline:'none',boxSizing:'border-box',marginBottom:passErr?6:12}}
        />
        {passErr&&<div style={{fontSize:11,color:C.red,marginBottom:8}}>Incorrect passcode</div>}
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
          {auth.role==='manager'&&(
            <div title="Manager" style={{fontSize:10,fontWeight:700,color:C.amber,background:'rgba(245,166,35,0.15)',borderRadius:5,padding:'2px 6px',border:'1px solid rgba(245,166,35,0.3)',flexShrink:0}}>MGR</div>
          )}
          <button onClick={()=>{setAuth(null);sessionStorage.removeItem('mql-auth')}} title="Sign out" style={{background:'none',border:'none',color:C.text3,cursor:'pointer',fontSize:14,padding:2,flexShrink:0}}
            onMouseEnter={e=>(e.currentTarget.style.color=C.red)} onMouseLeave={e=>(e.currentTarget.style.color=C.text3)}>⎋</button>
        </div>

        {/* Manager rep switcher + editor */}
        {auth.role==='manager'&&(
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
                ['Slack User ID', 'slackId', 'text', 'U098PSETPJ4'],
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

        <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.1em',padding:'6px 20px 4px'}}>Views</div>
        {([
          ['pipeline','📊','Pipeline','Lead tracking · expandable'],
          ['analytics','📈','Analytics','Charts · trends · breakdown'],
          ...(auth?.role==='manager' ? [['reporting','🧾','Reporting','Generated summaries · leadership-ready'] as const] : [])
        ] as const).map(([v,icon,label,sub])=>(
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
              <div style={{fontSize:12,color:C.text3,marginTop:4}}>{currentRep.name} · {allLeads.length} total leads · click any row to expand{ecSaving&&<span style={{color:C.amber,marginLeft:8}}>↑ syncing…</span>}</div>
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

          <SalesforceWidget />

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
              {label:'Closed-Won',      value:allLeads.filter(l=>(details[l.email]?.closedWon||'')==='Yes').length,                                     color:'#f59e0b', sub:'won accounts'},
              {label:'SQL rate',        value:`${allLeads.length?Math.round(sqlAllTime/allLeads.length*100):0}%`,                                        color:C.purpleL, sub:'SQL / total'},
              {label:'Pipeline ACV',    value:`$${allLeads.reduce((s,l)=>{const d=details[l.email]; return s+((d?.sqo==='Yes'&&d?.acv)?parseAcv(d.acv):0)},0).toLocaleString()}`, color:C.amber, sub:'SQO accounts only'},
              {label:'Closed-Won ACV',  value:`$${allLeads.reduce((s,l)=>{const d=details[l.email]; return s+((d?.closedWon==='Yes'&&d?.acv)?parseAcv(d.acv):0)},0).toLocaleString()}`, color:'#f59e0b', sub:'won revenue'},
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

          {/* SQO ACV by account */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:24}}>
            <div style={card}>
              <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:12}}>
                SQO account ACV mix
              </div>
              <PieChart
                data={allLeads
                  .filter(l => {
                    const d = details[l.email]
                    return d?.sqo === 'Yes' && parseAcv(d?.acv) > 0
                  })
                  .sort((a,b) => parseAcv(details[b.email]?.acv) - parseAcv(details[a.email]?.acv))
                  .slice(0,8)
                  .map((l,idx) => {
                    const d = details[l.email]
                    const palette = ['#c084fc','#60d4f4','#00e5a0','#f59e0b','#e879f9','#fb7185','#34d399','#a78bfa']
                    return {
                      label: l.account || d?.prospectName || formatDomain(l.domain),
                      value: parseAcv(d?.acv),
                      color: palette[idx % palette.length]
                    }
                  })}
              />
              <div style={{fontSize:11,color:C.text3,marginTop:12}}>
                Total pipeline ACV represented: $
                {allLeads.reduce((s,l)=>{const d=details[l.email]; return s+((d?.sqo==='Yes'&&d?.acv)?parseAcv(d.acv):0)},0).toLocaleString()}
              </div>
            </div>

            <div style={card}>
              <div style={{fontSize:11,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:12}}>
                Closed-Won revenue mix
              </div>
              <PieChart
                data={allLeads
                  .filter(l => {
                    const d = details[l.email]
                    return d?.closedWon === 'Yes' && parseAcv(d?.acv) > 0
                  })
                  .sort((a,b) => parseAcv(details[b.email]?.acv) - parseAcv(details[a.email]?.acv))
                  .slice(0,8)
                  .map((l,idx) => {
                    const d = details[l.email]
                    const palette = ['#f59e0b','#00e5a0','#60d4f4','#c084fc','#e879f9','#fb7185','#34d399','#a78bfa']
                    return {
                      label: l.account || d?.prospectName || formatDomain(l.domain),
                      value: parseAcv(d?.acv),
                      color: palette[idx % palette.length]
                    }
                  })}
              />
              <div style={{fontSize:11,color:C.text3,marginTop:12}}>
                Total closed-won ACV: $
                {allLeads.reduce((s,l)=>{const d=details[l.email]; return s+((d?.closedWon==='Yes'&&d?.acv)?parseAcv(d.acv):0)},0).toLocaleString()}
              </div>
            </div>
          </div>

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
              <div style={{fontSize:24,fontWeight:800,color:'#f59e0b'}}>{allLeads.filter(l=>(details[l.email]?.closedWon||'')==='Yes').length}</div>
              <div style={{fontSize:11,color:C.text3,marginTop:5}}>won accounts</div>
            </div>
            <div style={card}>
              <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>Closed-Won ACV</div>
              <div style={{fontSize:24,fontWeight:800,color:'#f59e0b'}}>${allLeads.reduce((s,l)=>{const d=details[l.email]; return s+((d?.closedWon==='Yes'&&d?.acv)?parseAcv(d.acv):0)},0).toLocaleString()}</div>
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
                onClick={()=>setReportGenerated(true)}
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
                  {[
                    ['New', reportStatusCounts.new],
                    ['Contacted', reportStatusCounts.contacted],
                    ['In Progress', reportStatusCounts.inprogress],
                    ['Booked', reportStatusCounts.booked],
                    ['Nurture', reportStatusCounts.nurture],
                    ['Lost', reportStatusCounts.lost],
                    ['DQ', reportStatusCounts.dq],
                    ['NA', reportStatusCounts.na],
                    ['SQL', reportSqlCount],
                    ['SQO', reportSqoCount],
                  ].map(([label,count])=>(
                    <div key={String(label)} style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:10,alignItems:'center',padding:'9px 10px',background:C.surface3,border:`1px solid ${C.border}`,borderRadius:10}}>
                      <div style={{fontSize:13,color:C.text2}}>{label}</div>
                      <div style={{fontSize:13,fontWeight:700,color:C.text}}>{count as number}</div>
                      <div style={{fontSize:11,color:C.text3,width:54,textAlign:'right'}}>{pct(count as number, reportTotal)}%</div>
                    </div>
                  ))}
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
                  {reportSourceRows.map(row=>(
                    <div key={row.source} style={{display:'grid',gridTemplateColumns:'1.5fr .7fr .7fr .7fr .9fr',gap:10,alignItems:'center',padding:'9px 10px',background:C.surface3,border:`1px solid ${C.border}`,borderRadius:10}}>
                      <div style={{fontSize:12,color:C.text2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{row.source}</div>
                      <div style={{fontSize:12,fontWeight:700,color:C.text}}>{row.mqls}</div>
                      <div style={{fontSize:12,color:C.text2}}>{row.sqlRate}%</div>
                      <div style={{fontSize:12,color:C.text2}}>{row.sqoRate}%</div>
                      <div style={{fontSize:12,color:C.text2}}>${row.pipeline.toLocaleString()}</div>
                    </div>
                  ))}
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
                  Trend Comparison
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
                  {[
                    {
                      label:'SQL Rate',
                      current:`${currentPeriodMetrics.sqlRate}%`,
                      prev:`${previousPeriodMetrics.sqlRate}% prev`,
                      trend: sqlTrend
                    },
                    {
                      label:'SQO Conversion',
                      current:`${currentPeriodMetrics.sqoRate}%`,
                      prev:`${previousPeriodMetrics.sqoRate}% prev`,
                      trend: sqoTrend
                    },
                    {
                      label:'Pipeline',
                      current:`$${currentPeriodMetrics.pipeline.toLocaleString()}`,
                      prev:`$${previousPeriodMetrics.pipeline.toLocaleString()} prev`,
                      trend: pipelineTrend
                    },
                  ].map(card=>(
                    <div key={card.label} style={{background:C.surface3,border:`1px solid ${C.border}`,borderRadius:10,padding:12}}>
                      <div style={{fontSize:10,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>{card.label}</div>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                        <div style={{fontSize:18,fontWeight:800,color:C.text}}>{card.current}</div>
                        <div style={{fontSize:16,fontWeight:800,color:card.trend.color}}>{card.trend.arrow} {Math.abs(card.trend.delta)}</div>
                      </div>
                      <div style={{fontSize:11,color:C.text3,marginTop:4}}>{card.prev}</div>
                    </div>
                  ))}
                </div>
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
      </main>

      {/* ── Create Contact Modal ── */}
      {showCreate&&<CreateContactModal onSave={createContact} onClose={()=>setShowCreate(false)}/>}
    </div>
  )
}
