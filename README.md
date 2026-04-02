# MQL Live Dashboard · QA Wolf

Live MQL lead dashboard reading directly from `#bdr-routed-leads` via Slack bot token. Every page load fetches fresh data.

## Local setup

```bash
npm install
cp .env.example .env.local
# paste your SLACK_BOT_TOKEN into .env.local
npm run dev
```

Open http://localhost:3000

## Deploy to Vercel

1. Push this repo to GitHub
2. Go to vercel.com → Add New Project → import repo
3. Add environment variable: `SLACK_BOT_TOKEN` = your `xoxb-...` token
4. Deploy — done

## Slack bot scopes needed
- `groups:history` (read private channel #bdr-routed-leads)
- `channels:history` (read public channels)
- `channels:read`
- `groups:read`
