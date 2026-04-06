// BDR Dashboard Edge Config API — rep data storage
import { NextRequest, NextResponse } from 'next/server'

const EDGE_CONFIG_ID =
  process.env.EDGE_CONFIG?.match(/ecfg_[a-z0-9]+/)?.[0] || ''

const VERCEL_API_TOKEN = process.env.EDGE_CONFIG_TOKEN || ''
const TEAM_ID = process.env.VERCEL_TEAM_ID || ''

const qs = TEAM_ID ? `?teamId=${TEAM_ID}` : ''
const EC_ITEMS_URL = `https://api.vercel.com/v1/edge-config/${EDGE_CONFIG_ID}/items${qs}`

export async function GET(req: NextRequest) {
  const repId = req.nextUrl.searchParams.get('repId')
  if (!repId) {
    return NextResponse.json({ error: 'repId required' }, { status: 400 })
  }

  try {
    const key = `rep_${repId}`

    const res = await fetch(EC_ITEMS_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${VERCEL_API_TOKEN}`,
      },
      cache: 'no-store',
    })

    const text = await res.text()
    let json: any = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = { raw: text }
    }

    if (!res.ok) {
      throw new Error(`Edge Config read failed: ${res.status} ${text}`)
    }

    // Vercel REST API returns all items; normalize to the shape the frontend expects.
    // Support both possible response shapes.
    let value = null

    if (Array.isArray(json?.items)) {
      const hit = json.items.find((item: any) => item.key === key)
      value = hit?.value ?? null
    } else if (json && typeof json === 'object') {
      value = json[key] ?? null
    }

    return NextResponse.json({ data: value })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { repId, data } = await req.json()

  if (!repId) {
    return NextResponse.json({ error: 'repId required' }, { status: 400 })
  }

  try {
    const key = `rep_${repId}`

    const res = await fetch(EC_ITEMS_URL, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${VERCEL_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          {
            operation: 'upsert',
            key,
            value: data,
          },
        ],
      }),
    })

    const text = await res.text()

    if (!res.ok) {
      throw new Error(`Edge Config write failed: ${res.status} ${text}`)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
