import { NextResponse } from 'next/server'
import { BDR_CHANNEL } from '@/lib/slack'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const SLACK_API = 'https://slack.com/api'

export async function GET() {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return NextResponse.json({ error: 'SLACK_BOT_TOKEN not set' }, { status: 500 })

  try {
    // Fetch 50 most recent messages — show full structure for Rattle bot
    const res = await fetch(`${SLACK_API}/conversations.history?channel=${BDR_CHANNEL}&limit=50`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (!data.ok) return NextResponse.json({ error: `Slack error: ${data.error}` })

    const msgs = (data.messages || [])
    // Find Rattle messages (B078MTXEV51) and show their FULL structure
    const rattleMsgs = msgs
      .filter((m: any) => m.bot_id === 'B078MTXEV51')
      .slice(0, 3)
      .map((m: any) => ({
        ts: m.ts,
        bot_id: m.bot_id,
        text: m.text,
        textLength: (m.text || '').length,
        hasBlocks: !!m.blocks,
        blocksCount: m.blocks?.length || 0,
        blocks: m.blocks ? JSON.stringify(m.blocks).slice(0, 2000) : null,
        hasAttachments: !!m.attachments,
        attachmentsCount: m.attachments?.length || 0,
        attachments: m.attachments ? JSON.stringify(m.attachments).slice(0, 2000) : null,
        allKeys: Object.keys(m),
      }))

    // Also show a working Zapier message for comparison
    const zapierMsgs = msgs
      .filter((m: any) => m.bot_id === 'B02PC3F3GP8')
      .slice(0, 1)
      .map((m: any) => ({
        ts: m.ts,
        bot_id: m.bot_id,
        text: (m.text || '').slice(0, 500),
        hasBlocks: !!m.blocks,
        hasAttachments: !!m.attachments,
        allKeys: Object.keys(m),
      }))

    return NextResponse.json({
      rattleMessages: rattleMsgs,
      zapierMessageForComparison: zapierMsgs,
      botIdCounts: msgs.reduce((acc: any, m: any) => {
        const id = m.bot_id || m.user || 'no-bot-id'
        acc[id] = (acc[id] || 0) + 1
        return acc
      }, {}),
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
