export type LeadSource = 'bdr'
export type LeadType = 'inbound' | 'outbound'

export interface Lead {
  email: string
  domain: string
  name: string | null
  sfUrl: string | null
  date: string | null
  receivedAt: string | null  // ISO timestamp of Slack message — used for response time indicator
  source: LeadSource
  leadType?: LeadType
  sfdcContactId?: string | null
  lastInboundDate?: string | null
  messageTs?: string  // Slack message_ts for idempotent backfill dedup
}

const SLACK_API  = 'https://slack.com/api'
const BDR_CHANNEL = 'C0AQ9UFMT3Q' // #bdr-routed-leads

const SKIP = ['qawolf', 'LeadGen', 'acme.com', 'thispagedoesnotexist', 'gmail.com']
function shouldSkip(email: string) {
  return SKIP.some(s => email.toLowerCase().includes(s.toLowerCase()))
}

interface SlackBlock {
  type: string
  text?: { type: string; text: string }
  elements?: any[]
}

interface SlackAttachment {
  blocks?: SlackBlock[]
  fallback?: string
}

interface SlackMessage {
  text: string
  bot_id?: string
  subtype?: string
  ts: string
  blocks?: SlackBlock[]
  attachments?: SlackAttachment[]
}

// ── Extract full text from Slack message (text + blocks + attachments) ────────
// Rattle puts lead data in blocks[].text.text, not in msg.text.
// Merge all text sources so the parser can find Email/CreatedDate/etc.
function extractFullText(msg: SlackMessage): string {
  const parts: string[] = []
  if (msg.text) parts.push(msg.text)
  if (msg.blocks) {
    for (const block of msg.blocks) {
      if (block.text?.text) parts.push(block.text.text)
    }
  }
  if (msg.attachments) {
    for (const att of msg.attachments) {
      if (att.blocks) {
        for (const block of att.blocks) {
          if (block.text?.text) parts.push(block.text.text)
          // Also extract URLs from button elements in action blocks
          if (block.elements) {
            for (const el of block.elements) {
              if (el.url) parts.push(el.url)
            }
          }
        }
      }
      if (att.fallback) parts.push(att.fallback)
    }
  }
  return parts.join('\n')
}

// ── Normalize Slack text ─────────────────────────────────────────────────────
// Slack API returns HTML entities in message text: &gt; &lt; &amp;
// Normalize these so our detectors and parsers work on clean text.
function normalizeSlackText(raw: string): string {
  return raw
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
}

// ── Message shape detection ──────────────────────────────────────────────────

function isRattleInbound(text: string): boolean {
  // Rattle / legacy Zapier: has blockquote >*Email:* and >*Created Date:*
  return text.includes('>*Email:*') && text.includes('>*Created Date:*')
}

function isLonescaleOutbound(text: string): boolean {
  // Lonescale: "New contact assigned to you" + "Last IB Date:" + "Link to record:"
  return text.includes('New contact assigned to you') &&
    text.includes('Last IB Date:') &&
    text.includes('Link to record:')
}

// ── Parsers ──────────────────────────────────────────────────────────────────

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

// Paginated fetch for backfill — fetches ALL messages in a time range
export async function fetchMessagesPaginated(
  token: string,
  channelId: string,
  oldest: string,  // unix timestamp
  latest: string,  // unix timestamp
): Promise<SlackMessage[]> {
  const all: SlackMessage[] = []
  let cursor: string | undefined
  let page = 0
  const maxPages = 50 // safety cap

  do {
    const params = new URLSearchParams({
      channel: channelId,
      limit: '200',
      oldest,
      latest,
    })
    if (cursor) params.set('cursor', cursor)

    const res = await fetch(`${SLACK_API}/conversations.history?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()

    if (!data.ok) {
      if (data.error === 'ratelimited') {
        const retryAfter = parseInt(data.headers?.['retry-after'] || '5', 10)
        await new Promise(r => setTimeout(r, retryAfter * 1000))
        continue
      }
      throw new Error(`Slack API error: ${data.error}`)
    }

    const msgs = (data.messages as SlackMessage[]).filter(
      m => m.bot_id || m.subtype === 'bot_message'
    )
    all.push(...msgs)

    cursor = data.response_metadata?.next_cursor
    page++
  } while (cursor && page < maxPages)

  return all
}

function parseEmail(text: string): string | null {
  // Handle Slack's <mailto:email|email> format
  const mailto = text.match(/<mailto:([^|>]+)[|>]/)
  if (mailto) return mailto[1].toLowerCase()
  const plain = text.match(/[\w.+%-]+@[\w-]+\.[\w.]+/)
  return plain ? plain[0].toLowerCase() : null
}

function parseSfUrl(text: string): string | null {
  // Handle both raw URLs and Slack's <url> or <url|label> wrapping
  const slackLink = text.match(/<(https:\/\/qawolf1\.[^\s>|]+)(?:\|[^>]*)?>/)
  if (slackLink) return slackLink[1]
  const raw = text.match(/https:\/\/qawolf1\.(lightning\.force|my\.salesforce)\.com\/[^\s>|)]+/)
  return raw ? raw[0] : null
}

function parseSfdcContactId(text: string): string | null {
  const match = text.match(/Contact\/(003[A-Za-z0-9]{15,18})/)
  return match ? match[1] : null
}

function parseDateFlex(text: string, ts: string): string {
  // Try "Lead Created Date: YYYY-MM-DD" or "Last IB Date: YYYY-MM-DD"
  const explicit = text.match(/(?:Lead Created Date|Last IB Date):\s*(\d{4}-\d{2}-\d{2})/)
  if (explicit) return explicit[1]

  // Rattle format: "Created Date:* 22nd Apr 2026, 07:16 AM" (ordinal + month name)
  const rattleDate = text.match(/Created Date:\*?\s*(\d{1,2})(?:st|nd|rd|th)\s+(\w+)\s+(\d{4})/)
  if (rattleDate) {
    const d = new Date(`${rattleDate[2]} ${rattleDate[1]}, ${rattleDate[3]}`)
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  }

  // Fall back to message timestamp
  return new Date(parseFloat(ts) * 1000).toISOString().split('T')[0]
}

function parseLastIbDate(text: string): string | null {
  const match = text.match(/Last IB Date:\s*(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

// ── Lead construction ────────────────────────────────────────────────────────

export function parseMessage(msg: SlackMessage): Lead | null {
  // Extract text from all sources (text + blocks + attachments) then normalize
  const text = normalizeSlackText(extractFullText(msg))

  // ── Inbound (Rattle / legacy Zapier) ──
  if (isRattleInbound(text)) {
    const email = parseEmail(text)
    if (!email || shouldSkip(email)) return null
    return {
      email,
      domain: email.split('@')[1] || '',
      name: null,
      sfUrl: parseSfUrl(text),
      date: parseDateFlex(text, msg.ts),
      receivedAt: new Date(parseFloat(msg.ts) * 1000).toISOString(),
      source: 'bdr',
      leadType: 'inbound',
      messageTs: msg.ts,
    }
  }

  // ── Outbound (Lonescale intent pings) ──
  if (isLonescaleOutbound(text)) {
    const email = parseEmail(text)
    if (email && shouldSkip(email)) return null
    const sfdcContactId = parseSfdcContactId(text)
    const sfUrl = parseSfUrl(text)
    return {
      email: email || (sfdcContactId ? `sfdc_${sfdcContactId}@lonescale.placeholder` : ''),
      domain: email ? (email.split('@')[1] || '') : 'lonescale.intent',
      name: null,
      sfUrl,
      date: parseLastIbDate(text) || parseDateFlex(text, msg.ts),
      receivedAt: new Date(parseFloat(msg.ts) * 1000).toISOString(),
      source: 'bdr',
      leadType: 'outbound',
      sfdcContactId: sfdcContactId || null,
      lastInboundDate: parseLastIbDate(text),
      messageTs: msg.ts,
    }
  }

  // ── Legacy Zapier inbound (no blockquote but has email) — back-compat ──
  const email = parseEmail(text)
  if (email && !shouldSkip(email)) {
    return {
      email,
      domain: email.split('@')[1] || '',
      name: null,
      sfUrl: parseSfUrl(text),
      date: parseDateFlex(text, msg.ts),
      receivedAt: new Date(parseFloat(msg.ts) * 1000).toISOString(),
      source: 'bdr',
      leadType: 'inbound',
      messageTs: msg.ts,
    }
  }

  // Unknown shape — skip with warning
  console.warn('[slack parser] Unknown message shape, skipping:', text.slice(0, 200))
  return null
}

// ── Public API ───────────────────────────────────────────────────────────────

async function fetchMessagesMultiPage(token: string, channelId: string, maxPages = 4): Promise<SlackMessage[]> {
  const all: SlackMessage[] = []
  let cursor: string | undefined
  let page = 0
  do {
    const params = new URLSearchParams({ channel: channelId, limit: '200' })
    if (cursor) params.set('cursor', cursor)
    const res = await fetch(`${SLACK_API}/conversations.history?${params}`, {
      headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 0 },
    })
    const data = await res.json()
    if (!data.ok) throw new Error(`Slack API error: ${data.error}`)
    const msgs = (data.messages as SlackMessage[]).filter(m => m.bot_id || m.subtype === 'bot_message')
    all.push(...msgs)
    cursor = data.response_metadata?.next_cursor
    page++
  } while (cursor && page < maxPages)
  return all
}

export async function fetchLeads(): Promise<Lead[]> {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) throw new Error('SLACK_BOT_TOKEN is not set')

  // Fetch last ~800 messages (4 pages × 200) for fast live load
  const messages = await fetchMessagesMultiPage(token, BDR_CHANNEL, 4)

  // Dedup: by email when present, else by sfdc: + contactId, also by messageTs
  const seen = new Map<string, Lead>()
  const seenTs = new Set<string>()

  for (const msg of messages) {
    if (seenTs.has(msg.ts)) continue
    const lead = parseMessage(msg)
    if (!lead) continue

    const dedupKey = lead.email || (lead.sfdcContactId ? `sfdc:${lead.sfdcContactId}` : null)
    if (!dedupKey) continue
    if (seen.has(dedupKey)) continue

    seenTs.add(msg.ts)
    seen.set(dedupKey, lead)
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

export { BDR_CHANNEL }
