# IMPLEMENTATION PLAN — Perffeco

**Date:** 2026-03-06

---

## Phase 1 — Must Fix Before Charging (This Session)

These are features that are either promised and missing, or have dishonest copy. They must be resolved before the product can honestly sell Pro subscriptions.

### 1.1 Fix Pricing Copy to Match Reality
**Priority:** CRITICAL
**Effort:** 30 min
**Files:** `index.html` (pricing section + section headers)
**Changes:**
- "60+ models" → "10+ models" (or the actual OpenRouter count)
- "8 providers" → "6 providers"
- "25+ models" in benchmarks → "10+ models"
- "1,300+ GPU prices, 15+ providers" → "GPU pricing across 7+ providers"
- "Weekly data updates" → "Live LLM pricing via API"
- "Daily data updates" → "Live pricing via API"
- Section stat headers to match real numbers

### 1.2 Implement CSV Export
**Priority:** CRITICAL (promised in Pro, zero code exists)
**Effort:** 1 hour
**Files:** `index.html` (JS + button HTML)
**Implementation:**
- Add "Export CSV" buttons to LLM pricing table, GPU pricing table, benchmark table
- Client-side CSV generation from existing JS data arrays
- Gate to Pro plan (check `currentProfile.plan`)
- Download as file via Blob URL

### 1.3 Fix Plan Gating Gaps
**Priority:** HIGH
**Effort:** 30 min
**Files:** `index.html` (JS)
**Changes:**
- Gate `fetchLiveLLMPricing()` to Pro+ users (currently runs for everyone)
- Free users see hardcoded fallback data, Pro+ get live OpenRouter data
- Ensure price/perf rankings stay accessible in Free LLM section (it's fine there)

### 1.4 Expand LLM Model Data via OpenRouter
**Priority:** HIGH
**Effort:** 1 hour
**Files:** `index.html` (JS)
**Changes:**
- Expand OpenRouter model mapping to include 30+ models
- Show all fetched models in the table (not just the 11 hardcoded ones)
- This lets us honestly say "30+ models" and growing
- Only for Pro users (free gets the hardcoded set)

---

## Phase 2 — Team Tier Foundations (Next 1-2 Weeks)

### 2.1 Team/Org Data Model
**Effort:** 2-3 days
**Files:** New migration, new functions, index.html
**Implementation:**
- `teams` table (id, name, owner_id, plan, max_seats, created_at)
- `team_members` table (team_id, user_id, role, invited_at, joined_at)
- Add `team_id` to profiles
- Team creation flow in account page
- Invite by email flow

### 2.2 Basic Public API
**Effort:** 2-3 days
**Files:** New Netlify functions, new migration
**Implementation:**
- `api_keys` table (id, user_id, team_id, key_hash, name, calls_today, calls_date)
- `/api/v1/models` — returns LLM pricing data (JSON)
- `/api/v1/gpus` — returns GPU pricing data (JSON)
- `/api/v1/benchmarks` — returns benchmark data (JSON)
- API key auth middleware
- Rate limit: 10K calls/mo for Team, unlimited for Enterprise

### 2.3 Custom Alerts Delivery
**Effort:** 1-2 days
**Files:** New Netlify scheduled function, groq-agent.ts
**Implementation:**
- Scheduled function (daily) checks price_alerts against current prices
- Sends alerts via Telegram (for linked users) or stores in-app
- Alert management UI in account page
- Gate to Team+

### 2.4 Team Analytics & Shared Dashboards
**Effort:** 3-5 days
**Implementation:**
- Team usage dashboard (aggregate chat usage, exports, API calls)
- Saved dashboard configurations (persisted to DB)
- Share link generation for team members

---

## Phase 3 — Enterprise Readiness (Weeks 3-6)

### 3.1 SSO & SAML
- Supabase supports SSO via SAML out of the box on Pro plan
- Configure SSO providers per tenant
- Enterprise-only feature gate

### 3.2 Custom Dashboards & Reports
- Dashboard builder (save chart configs, data filters)
- Scheduled report generation (PDF/CSV email)
- White-label report headers

### 3.3 White-Label Foundations
- Tenant config table (branding colors, logo URL, custom domain)
- Middleware to apply tenant branding
- Custom domain mapping via Netlify

### 3.4 Real-Time API
- WebSocket or SSE endpoint for live price changes
- Push updates when OpenRouter data refreshes
- Unlimited rate limit for Enterprise keys

---

## Dependencies

```
Phase 1 (no dependencies, can start now)
  ├── 1.1 Fix copy
  ├── 1.2 CSV export
  ├── 1.3 Fix gating
  └── 1.4 Expand models

Phase 2 (depends on Phase 1 completion)
  ├── 2.1 Team model (required by 2.2, 2.3, 2.4)
  ├── 2.2 API (requires 2.1 for team API keys)
  ├── 2.3 Alerts (independent, uses existing DB)
  └── 2.4 Analytics (requires 2.1 for team aggregation)

Phase 3 (depends on Phase 2)
  ├── 3.1 SSO (requires team model)
  ├── 3.2 Custom dashboards (requires 2.4)
  ├── 3.3 White-label (requires team model)
  └── 3.4 Real-time API (requires 2.2)
```

---

## Recommended Pricing Page Until Phase 2

**Free:** Keep all features (with honest numbers)
**Pro:** Keep all features (after CSV export + gating fixes)
**Team:** Change to "Coming Q2 2026 — Contact us for early access"
**Enterprise:** Keep as "Custom — Contact Sales"
