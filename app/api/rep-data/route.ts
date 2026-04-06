import { NextRequest, NextResponse } from 'next/server'
import { put, get } from '@vercel/blob'

export const dynamic = 'force-dynamic'

function key(repId: string) {
  return `rep-data/${repId}.json`
}

export async function GET(req: NextRequest) {
  const repId = req.nextUrl.searchParams.get('repId')
  if (!repId) {
    return NextResponse.json({ error: 'repId required' }, { status: 400 })
  }

  try {
    const result = await get(key(repId), { access: 'private' })

    if (!result || result.statusCode !== 200 || !result.stream) {
      return NextResponse.json({ data: null })
    }

    const text = await new Response(result.stream).text()
    const raw = text ? JSON.parse(text) : null

    // Return BOTH shapes:
    // 1) data: raw full payload
    // 2) top-level aliases for older frontend code
    return NextResponse.json({
      data: raw,
      statuses: raw?.['mql-st'] ?? raw?.statuses ?? null,
      details: raw?.['mql-dt'] ?? raw?.details ?? null,
      names: raw?.['mql-names'] ?? raw?.names ?? null,
      manual: raw?.['mql-manual'] ?? raw?.manual ?? null,
      deleted: raw?.['mql-deleted'] ?? raw?.deleted ?? null,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { repId, data } = await req.json()

    if (!repId) {
      return NextResponse.json({ error: 'repId required' }, { status: 400 })
    }

    await put(key(repId), JSON.stringify(data), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
