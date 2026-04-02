import { NextResponse } from 'next/server'
import { fetchLeads } from '@/lib/slack'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const leads = await fetchLeads()
    return NextResponse.json({ leads, fetchedAt: new Date().toISOString() })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
