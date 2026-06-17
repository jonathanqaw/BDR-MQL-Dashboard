import { NextRequest, NextResponse } from 'next/server'
import { fetchLonescaleReport, LONESCALE_REPORTS, LONESCALE_CATEGORY_ORDER, LONESCALE_LIVE_FETCH_ENABLED, type LonescaleCategory } from '@/lib/lonescale'

export const dynamic = 'force-dynamic'

// GET /api/lonescale?category=job_postings
// Returns the rows for one Lonescale Salesforce report (mock until the live
// fetch in lib/lonescale.ts is wired up). The Outbound workbench overlays its
// dashboard-only fields (status/priority/bucket/notes/next step) on top of these.
export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get('category') as LonescaleCategory | null

  if (!category || !LONESCALE_CATEGORY_ORDER.includes(category)) {
    return NextResponse.json({ error: 'valid category required', categories: LONESCALE_CATEGORY_ORDER }, { status: 400 })
  }

  try {
    const records = await fetchLonescaleReport(category)
    return NextResponse.json({
      category,
      records,
      fetchedAt: new Date().toISOString(),
      source: LONESCALE_LIVE_FETCH_ENABLED ? 'salesforce' : 'mock',
      reportUrl: LONESCALE_REPORTS[category].reportUrl,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
