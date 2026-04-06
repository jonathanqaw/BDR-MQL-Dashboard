import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function POST(req: Request) {
  const body = await req.json()

  const filePath = path.join(process.cwd(), 'contact-log.json')

  let existing = []
  try {
    existing = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {}

  existing.unshift({
    ...body,
    capturedAt: new Date().toISOString(),
  })

  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2))

  return NextResponse.json({ success: true })
}
