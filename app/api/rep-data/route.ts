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
    const file = await get(key(repId), { type: 'json' })
    return NextResponse.json({ data: file ?? null })
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

    await put(key(repId), data, {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
