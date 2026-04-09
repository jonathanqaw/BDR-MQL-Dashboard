# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical Rules

- **NEVER remove or overwrite the `LIVE_SF_LINKS` constant or any `sfUrl` values in `HISTORICAL_LEADS`.** Always carry them forward into every version of `page.tsx`.
- Always run `npm run build` after any edit to verify it compiles before committing.
- Always `git add . && git commit && git push` after a successful build.
- Production URL: https://bdr-mql-dashboard.vercel.app — never use preview deployment URLs.

## Commands

- `npm run dev` — start Next.js dev server at http://localhost:3000
- `npm run build` — production build (run after every edit)
- `npm run start` — start production server

No test runner or linter is configured.

## Deploy Workflow

Edit files → `npm run build` → `git add . && git commit -m "description" && git push`. Vercel auto-deploys from main branch.

## Environment

Requires `SLACK_BOT_TOKEN` in `.env.local` (see `.env.example`). The Slack bot needs scopes: `groups:history`, `channels:history`, `channels:read`, `groups:read`.

## Architecture

**Stack:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Vercel Blob for storage. Single-page app deployed on Vercel.

### Data Flow

1. **Slack → API** — `lib/slack.ts` fetches messages from Slack channel `C0AQ9UFMT3Q` (`#bdr-routed-leads`), parses emails/Salesforce URLs/dates, filters blacklisted domains, deduplicates, and sorts.
2. **API → Client** — `/api/leads` (force-dynamic) calls `fetchLeads()` and returns fresh leads on every request.
3. **Client** — `app/page.tsx` is a large `'use client'` component (~2900 lines) containing all dashboard logic: authentication, pipeline management, analytics, and reporting.

### Persistence

- **localStorage + Edge Config** — Per-rep data (statuses, details, names, manual leads, deleted leads). Edge Config can overwrite localStorage on page load for manager view — be careful with load/sync logic.
- **Vercel Blob** — Enriched contacts via `/api/enrich-contact`, per-rep data via `/api/rep-data`.
- **Manual leads** stored in localStorage key `mql-manual`.

### Key Files

- **`app/page.tsx`** — Monolithic client component with the entire dashboard: auth (manager/rep roles), lead pipeline with 8 statuses (`new`, `contacted`, `inprogress`, `booked`, `nurture`, `lost`, `na`, `dq`, `closedwon`), three views (`pipeline`, `analytics`, `reporting`), historical leads, filtering, and analytics. Contains hardcoded constants including `HISTORICAL_LEADS`, `LIVE_SF_LINKS`, `LIVE_PROSPECT_NAMES`, and `MANAGER_PASSCODE`.
- **`lib/slack.ts`** — Slack message fetching and lead parsing. Exports `Lead` interface and `fetchLeads()`.
- **`app/api/leads/route.ts`** — GET endpoint returning live leads from Slack.
- **`app/api/rep-data/route.ts`** — GET/POST for per-rep persistent data (`rep-data/{repId}.json`). GET supports aliased field names for backwards compatibility (`mql-st`/`statuses`, `mql-dt`/`details`, etc.).
- **`app/api/enrich-contact/route.ts`** — GET/POST for enriched contact storage in Vercel Blob (`contacts.json`).
- **`app/contacts/page.tsx`** — Server component displaying captured Salesforce contacts from `contact-log.json`.
- **`app/components/SalesforceWidget.tsx`** — Client widget showing recent enriched contacts.

### Authentication

Two roles: **manager** (passcode: `johnnywolfpack2026`) and **rep** (access via `?rep=jonathan` URL param, no passcode). Rep registry is defined in `DEFAULT_REPS` inside `page.tsx`.

### Key People

- Jonathan Kim — BDR manager (Slack ID: `U098PSETPJ4`)
- Leon Tang — RevOps (Slack ID: `U07B999U1ME`) — built Zapier/Slack routing

### Data Sources

- `#bdr-routed-leads` Slack channel (`C0AQ9UFMT3Q`) for live leads
- Historical leads baked into `HISTORICAL_LEADS` constant in `page.tsx`
- Manual leads stored in localStorage key `mql-manual`
