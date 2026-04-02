export type LeadSource = 'bdr'

export interface Lead {
  email: string
  domain: string
  name: string | null
  sfUrl: string | null
  date: string | null
  source: LeadSource
}

const SLACK_API  = 'https://slack.com/api'
const BDR_CHANNEL = 'C0AQ9UFMT3Q' // #bdr-routed-leads

const SKIP = ['qawolf', 'LeadGen', 'acme.com', 'thispagedoesnotexist', 'gmail.com']
function shouldSkip(email: string) {
  return SKIP.some(s => email.toLowerCase().includes(s.toLowerCase()))
}

interface SlackMessage {
  text: string
  bot_id?: string
  subtype?: string
  ts: string
}

async function fetchMessages(token: string, channelId: string, limit = 200): Promise<SlackMessage[]> {
  const res = await fetch(
    `${SLACK_API}/conversations.history?channel=${channelId}&limit=${limit}`,
    { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 0 } }
  )
  const data = await res.json()
  if (!data.ok) throw new Error(`Slack API error: ${data.error}`)
  return (data.messages as SlackMessage[]).filter(
    m => m.bot_id || m.subtype === 'bot_message'
  )
}

function parseEmail(text: string): string | null {
  const mailto = text.match(/<mailto:([^|>]+)\|/)
  if (mailto) return mailto[1].toLowerCase()
  const plain = text.match(/[\w.+%-]+@[\w-]+\.[\w.]+/)
  return plain ? plain[0].toLowerCase() : null
}

function parseSfUrl(text: string): string | null {
  const match = text.match(/https:\/\/qawolf1\.(lightning\.force|my\.salesforce)\.com\/[^\s>]+/)
  return match ? match[0] : null
}

function parseDate(text: string, ts: string): string {
  // Try "Lead Created Date: YYYY-MM-DD" or "Last IB Date: YYYY-MM-DD"
  const explicit = text.match(/(?:Lead Created Date|Last IB Date):\s*(\d{4}-\d{2}-\d{2})/)
  if (explicit) return explicit[1]
  // Fall back to message timestamp
  return new Date(parseFloat(ts) * 1000).toISOString().split('T')[0]
}

export async function fetchLeads(): Promise<Lead[]> {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) throw new Error('SLACK_BOT_TOKEN is not set')

  const messages = await fetchMessages(token, BDR_CHANNEL)

  const seen = new Map<string, Lead>()

  for (const msg of messages) {
    const email = parseEmail(msg.text)
    if (!email || shouldSkip(email)) continue
    if (seen.has(email)) continue // dedupe — keep first (most recent) occurrence

    seen.set(email, {
      email,
      domain: email.split('@')[1] || '',
      name: null,
      sfUrl: parseSfUrl(msg.text),
      date: parseDate(msg.text, msg.ts),
      source: 'bdr',
    })
  }

  const leads = Array.from(seen.values())

  // Sort: SF links first, then by date descending
  leads.sort((a, b) => {
    if (a.sfUrl && !b.sfUrl) return -1
    if (!a.sfUrl && b.sfUrl) return 1
    if (!a.date) return 1
    if (!b.date) return -1
    return b.date.localeCompare(a.date)
  })

  return leads
}
