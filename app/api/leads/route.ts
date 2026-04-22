import { NextResponse } from 'next/server'
import { fetchLeads } from '@/lib/slack'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // allow up to 60s for paginated Slack fetch

export async function GET() {
  try {
    const leads = await fetchLeads()
    return NextResponse.json({ leads, fetchedAt: new Date().toISOString() })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
