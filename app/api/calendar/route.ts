import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const calendarId = searchParams.get('calendarId')
  const weekStart = searchParams.get('weekStart')

  if (!calendarId || !weekStart) {
    return NextResponse.json({ events: [], error: 'missing_params' })
  }

  // Get the OAuth access token from NextAuth session
  let accessToken: string | null = null
  try {
    const session = await getServerSession(authOptions) as any
    accessToken = session?.accessToken || null
  } catch {
    // Session unavailable
  }

  if (!accessToken) {
    return NextResponse.json({ events: [], timezone: null, error: 'not_authenticated' })
  }

  const timeMin = new Date(weekStart + 'T00:00:00')
  const timeMax = new Date(timeMin)
  timeMax.setDate(timeMax.getDate() + 5)

  try {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`)
    url.searchParams.set('timeMin', timeMin.toISOString())
    url.searchParams.set('timeMax', timeMax.toISOString())
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('orderBy', 'startTime')
    url.searchParams.set('maxResults', '100')

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      console.error('Google Calendar API error:', res.status, errBody)
      return NextResponse.json({ events: [], timezone: null, error: `calendar_error_${res.status}`, detail: errBody.slice(0, 200) })
    }

    const data = await res.json()
    const timezone = data.timeZone || null

    const events = (data.items || []).map((item: any) => {
      const isAllDay = !!(item.start?.date && !item.start?.dateTime)
      const summary = item.summary || 'Busy'
      const isOOO =
        item.eventType === 'outOfOffice' ||
        /\b(ooo|pto|out of office|vacation|sick)\b/i.test(summary)

      return {
        summary,
        start: item.start?.dateTime || item.start?.date || '',
        end: item.end?.dateTime || item.end?.date || '',
        isAllDay,
        isOOO,
      }
    })

    return NextResponse.json({ events, timezone, error: null })
  } catch {
    return NextResponse.json({ events: [], timezone: null, error: 'calendar_unavailable' })
  }
}
