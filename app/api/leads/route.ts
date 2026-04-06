import { NextRequest, NextResponse } from 'next/server'

const EDGE_CONFIG_ID = process.env.EDGE_CONFIG?.match(/ecfg_[a-z0-9]+/)?.[0] || ''
const EDGE_CONFIG_TOKEN = process.env.EDGE_CONFIG_TOKEN || ''
const EC_BASE = `https://api.vercel.com/v1/edge-config/${EDGE_CONFIG_ID}`

// GET /api/rep-data?repId=U098PSETPJ4
export async function GET(req: NextRequest) {
  const repId = req.nextUrl.searchParams.get('repId')
  if (!repId) return NextResponse.json({ error: 'repId required' }, { status: 400 })

  try {
    const key = `rep_${repId}`
    const res = await fetch(`${EC_BASE}/item/${key}`, {
      headers: { Authorization: `Bearer ${EDGE_CONFIG_TOKEN}` },
      cache: 'no-store',
    })
    if (res.status === 404) return NextResponse.json({ data: null })
    if (!res.ok) throw new Error(`Edge Config read failed: ${res.status}`)
    const data = await res.json()
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST /api/rep-data  body: { repId, data }
export async function POST(req: NextRequest) {
  const { repId, data } = await req.json()
  if (!repId) return NextResponse.json({ error: 'repId required' }, { status: 400 })

  try {
    const key = `rep_${repId}`
    const res = await fetch(`${EC_BASE}/items`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${EDGE_CONFIG_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items: [{ operation: 'upsert', key, value: data }] }),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Edge Config write failed: ${res.status} ${err}`)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

