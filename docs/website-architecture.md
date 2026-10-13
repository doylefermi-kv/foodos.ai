# FoodOS.ai marketing website: architecture (CTO decision)

**Status:** decided by the CTO, 2026-10-13. Change it only through the CTO.

## Goal
A fast, cheap, static marketing site whose single conversion is **Book a demo**. Leads land somewhere the team can see right away (a Google Sheet). The design must let us swap the lead store later without touching the frontend.

## Stack
| Layer | Choice |
|---|---|
| Site | React + TypeScript + Vite, built to static files. Port of design **C — Bazaar** (`design/website/v3-bazaar/`, final revision from FOO-1). |
| Hosting | **Cloudflare Pages** (static assets + preview deploy per branch/PR). |
| API | **Cloudflare Pages Functions**: one endpoint, `POST /api/demo-requests`. |
| Lead store | **Google Sheet**, written via the Sheets API using a **Google service account** (the sheet is shared with the service-account email). Credentials live only in Cloudflare secrets, never in the browser or the repo. |
| Spam protection | **Cloudflare Turnstile** (verified server-side) + a honeypot field + basic per-IP rate limiting. |
| Visit analytics | **Cloudflare Web Analytics** (cookieless). The Sheet stores leads only, not page views. |
| Attribution | The site captures `utm_*`, `referrer` and `landingPath` on first visit (sessionStorage) and sends them with the form. |

## Repo layout (inside `foodos/`)
```
website/
  src/                 # React app (Frontend Engineer)
  public/              # static assets, logo, favicons (Frontend)
  functions/api/       # Pages Functions (Backend Engineer)
  shared/contract.ts   # request/response types + validation schema (Backend owns; Frontend imports)
  package.json, vite.config.ts, tsconfig.json   # Frontend scaffolds; DevOps owns scripts/CI wiring
.github/workflows/     # CI (DevOps)
docs/runbooks/         # setup runbooks (DevOps)
```

## API contract: `POST /api/demo-requests`
Request JSON:
```ts
{
  name: string;            // required, 2–80 chars
  phone: string;           // required, Indian mobile, normalised to +91XXXXXXXXXX
  email?: string;          // optional, valid email
  restaurantName: string;  // required, 2–120
  city: string;            // required
  outlets: "1" | "2-5" | "6-20" | "20+";
  restaurantType?: "qsr" | "cafe" | "cloud_kitchen" | "casual_dining" | "fine_dining" | "bar" | "other";
  preferredLanguage?: string;   // e.g. "en", "hi", "ml", "ta", "te"
  message?: string;        // max 1000
  consent: true;           // must be true
  attribution: { utmSource?, utmMedium?, utmCampaign?, utmTerm?, utmContent?, referrer?, landingPath? };
  turnstileToken: string;
  website?: string;        // honeypot; must be empty
}
```
Responses: `201 { id }` · `400 { error: "validation", fields: {…} }` · `403 { error: "bot" }` · `429 { error: "rate_limited" }` · `502 { error: "upstream" }` (sheet write failed: log it and never lose the lead silently).

Sheet row columns (in this order): `id, receivedAt (ISO, IST), name, phone, email, restaurantName, city, outlets, restaurantType, preferredLanguage, message, utmSource, utmMedium, utmCampaign, utmTerm, utmContent, referrer, landingPath, userAgent, status` (`status` defaults to `new`, for the sales team to update).

## Design for scale
- The function writes through a `LeadSink` interface (`GoogleSheetSink`, `ConsoleSink` for local dev/tests). Moving to Postgres or a CRM later means adding a new sink, with no frontend change.
- Google Sheets API quotas (~60 writes/min per user, 10M cells/sheet) are far beyond demo-request volume. Revisit at around 50k rows.
- On a sink failure, return 502 and log the full payload so no lead is lost.

## Ground rules
- No accounts get created, nothing gets deployed and no secrets get added without the CTO. Build everything so it runs locally (`wrangler pages dev`) with `ConsoleSink`.
- Keep dependencies minimal and justify each one in the issue comment.
