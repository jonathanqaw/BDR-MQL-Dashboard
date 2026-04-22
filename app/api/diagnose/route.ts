import { NextResponse } from 'next/server'
import { parseMessage, BDR_CHANNEL } from '@/lib/slack'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const SLACK_API = 'https://slack.com/api'
const TARGET_EMAILS = [
  'jmfaraujo@rd.com.br',
  'ino.van.winckel@novaco.ai',
  'maksym.kryvokhvist@6037.tech',
  'peeyush.chaurasia@imsnhance.com',
  'takuya@assethub.io',
]

export async function GET() {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return NextResponse.json({ error: 'SLACK_BOT_TOKEN not set' }, { status: 500 })

  try {
    // Stage A: Fetch raw messages (2 pages = 400 msgs)
    const allRaw: any[] = []
    let cursor: string | undefined
    for (let page = 0; page < 2; page++) {
      const params = new URLSearchParams({ channel: BDR_CHANNEL, limit: '200' })
      if (cursor) params.set('cursor', cursor)
      const res = await fetch(`${SLACK_API}/conversations.history?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!data.ok) return NextResponse.json({ error: `Slack error: ${data.error}`, stage: 'A' })
      allRaw.push(...(data.messages || []))
      cursor = data.response_metadata?.next_cursor
      if (!cursor) break
    }

    const botMsgs = allRaw.filter((m: any) => m.bot_id || m.subtype === 'bot_message')
    const nonBotMsgs = allRaw.filter((m: any) => !m.bot_id && m.subtype !== 'bot_message')

    // Stage B+C: Classify and parse each bot message
    type ClassResult = {
      ts: string
      bot_id: string | null
      classification: 'inbound' | 'outbound' | 'legacy_inbound' | 'skipped'
      email: string | null
      reason: string
      rawPreview: string
      isTargetEmail: boolean
    }
    const results: ClassResult[] = []

    for (const msg of botMsgs.slice(0, 100)) {
      const lead = parseMessage(msg)
      const rawText = (msg.text || '').slice(0, 200)

      if (lead) {
        results.push({
          ts: msg.ts,
          bot_id: msg.bot_id || null,
          classification: lead.leadType || 'legacy_inbound',
          email: lead.email,
          reason: lead.leadType === 'outbound' ? 'lonescale detected' : 'inbound parsed',
          rawPreview: rawText,
          isTargetEmail: TARGET_EMAILS.includes(lead.email),
        })
      } else {
        // Why was it dropped?
        const text = (msg.text || '')
          .replace(/&gt;/g, '>')
          .replace(/&lt;/g, '<')
          .replace(/&amp;/g, '&')
        const hasEmail = text.includes('>*Email:*')
        const hasDate = text.includes('>*Created Date:*')
        const hasNewContact = text.includes('New contact assigned to you')

        // Try to extract email for reporting
        const mailto = text.match(/<mailto:([^|>]+)[|>]/)
        const plainEmail = text.match(/[\w.+%-]+@[\w-]+\.[\w.]+/)
        const extractedEmail = mailto?.[1] || plainEmail?.[0] || null

        results.push({
          ts: msg.ts,
          bot_id: msg.bot_id || null,
          classification: 'skipped',
          email: extractedEmail,
          reason: `dropped: hasBlockquoteEmail=${hasEmail}, hasCreatedDate=${hasDate}, hasNewContact=${hasNewContact}, extractedEmail=${extractedEmail}, skipFilter=${extractedEmail ? ['qawolf', 'LeadGen', 'acme.com', 'thispagedoesnotexist', 'gmail.com'].some(s => (extractedEmail).toLowerCase().includes(s.toLowerCase())) : 'no email'}`,
          rawPreview: rawText,
          isTargetEmail: extractedEmail ? TARGET_EMAILS.includes(extractedEmail.toLowerCase()) : false,
        })
      }
    }

    // Stage D: Dedup summary
    const parsed = results.filter(r => r.classification !== 'skipped')
    const emailsSeen = new Set<string>()
    let newCount = 0
    let dupCount = 0
    for (const r of parsed) {
      if (r.email && emailsSeen.has(r.email)) { dupCount++ }
      else { if (r.email) emailsSeen.add(r.email); newCount++ }
    }

    // Stage E: Target email tracking
    const targetTracking = TARGET_EMAILS.map(email => {
      const found = results.find(r => r.email === email)
      return {
        email,
        found: !!found,
        classification: found?.classification || 'NOT FOUND',
        reason: found?.reason || 'not in any message',
      }
    })

    return NextResponse.json({
      stageA: {
        totalRawMessages: allRaw.length,
        botMessages: botMsgs.length,
        nonBotMessages: nonBotMsgs.length,
        nonBotSample: nonBotMsgs.slice(0, 3).map((m: any) => ({
          ts: m.ts, subtype: m.subtype, user: m.user, textPreview: (m.text || '').slice(0, 100),
        })),
      },
      stageBC: {
        totalClassified: results.length,
        inbound: results.filter(r => r.classification === 'inbound' || r.classification === 'legacy_inbound').length,
        outbound: results.filter(r => r.classification === 'outbound').length,
        skipped: results.filter(r => r.classification === 'skipped').length,
        firstFiveInbound: results.filter(r => r.classification === 'inbound' || r.classification === 'legacy_inbound').slice(0, 5),
        firstFiveSkipped: results.filter(r => r.classification === 'skipped').slice(0, 5),
      },
      stageD: { uniqueLeads: newCount, duplicates: dupCount },
      stageE: { targetTracking },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err), stage: 'fetch' }, { status: 500 })
  }
}
