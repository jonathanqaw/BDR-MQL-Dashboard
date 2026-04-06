import { put, list } from '@vercel/blob'
import { NextResponse } from 'next/server'

async function getContacts() {
  try {
    const blobs = await list({ prefix: 'contacts.json' })

    if (blobs.blobs.length === 0) return []

    const res = await fetch(blobs.blobs[0].url, { cache: 'no-store' })
    return await res.json()
  } catch {
    return []
  }
}

export async function GET() {
  try {
    const contacts = await getContacts()
    return NextResponse.json({ success: true, contacts })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ success: false, contacts: [] }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const existing = await getContacts()

    existing.unshift({
      ...body,
      capturedAt: new Date().toISOString(),
    })

    await put('contacts.json', JSON.stringify(existing), {
      access: 'public',
      allowOverwrite: true,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
