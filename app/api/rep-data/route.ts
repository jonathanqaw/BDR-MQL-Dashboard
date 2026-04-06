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
    const blob = await get(key(repId))
    if (!blob) {
      return NextResponse.json({ data: null })
    }

    const res = await fetch(blob.url, { cache: 'no-store' })
    if (!res.ok) {
      throw new Error(`Blob fetch failed: ${res.status}`)
    }

    const data = await res.json()
    return NextResponse.json({ data })
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
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
