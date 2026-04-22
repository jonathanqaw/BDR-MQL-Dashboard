import { NextResponse } from 'next/server'
import { fetchMessagesPaginated, parseMessage, BDR_CHANNEL } from '@/lib/slack'
import type { Lead } from '@/lib/slack'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // allow up to 60s for backfill

export async function GET() {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return NextResponse.json({ error: 'SLACK_BOT_TOKEN not set' }, { status: 500 })

  try {
    // Backfill from 2026-04-21 00:00 EDT (UTC-4) to now
    const oldest = String(new Date('2026-04-21T04:00:00Z').getTime() / 1000)
    const latest = String(Date.now() / 1000)

    const messages = await fetchMessagesPaginated(token, BDR_CHANNEL, oldest, latest)

    const seen = new Map<string, Lead>()
    const seenTs = new Set<string>()
    let inbound = 0
    let outbound = 0
    let skipped = 0

    for (const msg of messages) {
      if (seenTs.has(msg.ts)) continue
      const lead = parseMessage(msg)
      if (!lead) { skipped++; continue }

      const dedupKey = lead.email || (lead.sfdcContactId ? `sfdc:${lead.sfdcContactId}` : null)
      if (!dedupKey) { skipped++; continue }
      if (seen.has(dedupKey)) continue

      seenTs.add(msg.ts)
      seen.set(dedupKey, lead)
      if (lead.leadType === 'inbound') inbound++
      else outbound++
    }

    const leads = Array.from(seen.values())

    // Estimate localStorage size
    const estimatedBytes = JSON.stringify(leads).length
    const estimatedKB = Math.round(estimatedBytes / 1024)

    return NextResponse.json({
      summary: `Backfill: ingested ${inbound} inbound leads, ${outbound} Lonescale pings, ${skipped} skipped (unknown format)`,
      inbound,
      outbound,
      skipped,
      totalMessages: messages.length,
      estimatedKB,
      leads,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
