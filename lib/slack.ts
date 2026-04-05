export type LeadSource = 'bdr'

export interface Lead {
  email: string
  domain: string
  name: string | null
  sfUrl: string | null
  date: string | null
  receivedAt: string | null
  source: LeadSource
  repSlackId: string | null  // Slack user ID of assigned BDR e.g. U098PSETPJ4 (null for historical leads)
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
  const explicit = text.match(/(?:Lead Created Date|Last IB Date):\s*(\d{4}-\d{2}-\d{2})/)
  if (explicit) return explicit[1]
  return new Date(parseFloat(ts) * 1000).toISOString().split('T')[0]
}

function parseRepSlackId(text: string): string | null {
  // Matches <@U098PSETPJ4|Jonathan> or <@U098PSETPJ4>
  const match = text.match(/<@([A-Z0-9]+)(?:\|[^>]*)?>/)
  return match ? match[1] : null
}

export async function fetchLeads(): Promise<Lead[]> {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) throw new Error('SLACK_BOT_TOKEN is not set')

  const messages = await fetchMessages(token, BDR_CHANNEL)

  const seen = new Map<string, Lead>()

  for (const msg of messages) {
    const email = parseEmail(msg.text)
    if (!email || shouldSkip(email)) continue
    if (seen.has(email)) continue

    seen.set(email, {
      email,
      domain: email.split('@')[1] || '',
      name: null,
      sfUrl: parseSfUrl(msg.text),
      date: parseDate(msg.text, msg.ts),
      receivedAt: new Date(parseFloat(msg.ts) * 1000).toISOString(),
      source: 'bdr',
      repSlackId: parseRepSlackId(msg.text),
    })
  }

  const leads = Array.from(seen.values())

  leads.sort((a, b) => {
    if (a.sfUrl && !b.sfUrl) return -1
    if (!a.sfUrl && b.sfUrl) return 1
    if (!a.date) return 1
    if (!b.date) return -1
    return b.date.localeCompare(a.date)
  })

  return leads
}
