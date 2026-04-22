import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return NextResponse.json({ error: 'SLACK_BOT_TOKEN not set' }, { status: 500 })

  try {
    const res = await fetch(
      `https://slack.com/api/conversations.history?channel=C0AQ9UFMT3Q&limit=20`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const data = await res.json()
    if (!data.ok) return NextResponse.json({ error: data.error }, { status: 500 })

    // Return raw messages with detection results
    const msgs = (data.messages || []).map((m: any) => {
      const text = m.text || ''
      return {
        ts: m.ts,
        bot_id: m.bot_id || null,
        subtype: m.subtype || null,
        hasBlockquoteEmail: text.includes('>*Email:*'),
        hasCreatedDate: text.includes('>*Created Date:*'),
        hasNewContact: text.includes('New contact assigned to you'),
        hasLastIBDate: text.includes('Last IB Date:'),
        hasLinkToRecord: text.includes('Link to record:'),
        textPreview: text.slice(0, 500),
        textLength: text.length,
      }
    })

    return NextResponse.json({ count: msgs.length, messages: msgs })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
