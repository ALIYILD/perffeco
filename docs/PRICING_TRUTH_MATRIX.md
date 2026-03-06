# PRICING TRUTH MATRIX — Perffeco

**Date:** 2026-03-06

## What We Can Honestly Sell RIGHT NOW

### FREE — Safe to publish as-is (with copy fixes)

| Feature | Honest Copy | Notes |
|---------|------------|-------|
| Frontier Model Economics dashboard | Keep as-is | Working interactive bubble chart, 6 axes, 12 models |
| CIS methodology & rankings | Keep as-is | Formula, sidebar rankings, 10 models |
| Intelligence / Dollar rankings | Keep as-is | Sidebar panel (top 4) + chart axis |
| Intelligence / Token rankings | Keep as-is | Sidebar panel (top 4) + chart axis |
| Energy efficiency rankings | Keep as-is | Sidebar panel (top 4, kWh/token values) |
| LLM API pricing table | **CHANGE: "10+ models, 6 providers"** | Currently says "60+ models, 8 providers" — dishonest |
| Cost per task estimates (6 task types) | Keep as-is | 6 informational cards |
| Price deflation trends | Keep as-is | Historical bar chart |
| Benchmark leaderboard | **CHANGE: "10+ models, 6 benchmarks"** | Currently says "25+ models" — dishonest |
| Arena Elo / SWE-bench / MATH views | Keep as-is | Working sub-tabs |
| Benchmark guide | Keep as-is | Informational content |
| Basic GPU pricing | Keep as-is | 10 entries from top providers |
| Weekly data updates | **CHANGE: "LLM prices update live via API; benchmark & GPU data curated"** | No weekly update mechanism exists |

### PRO — Safe to sell (with copy fixes)

| Feature | Honest Copy | Notes |
|---------|------------|-------|
| Full GPU economics | **CHANGE: "GPU pricing across 7 providers"** | "1,300+ prices, 15+ providers" is false. Have 10 entries, 7 providers. |
| GPU provider compare | Keep as-is | 8-provider H100 comparison exists |
| GPU price trends | Keep as-is | Historical data exists (curated) |
| GPU hidden cost analysis | Keep as-is | Informational content |
| AI Agent economics (all 4 sub-features) | Keep as-is | Informational content — this IS the product |
| FinOps suite (all 4 sub-features) | Keep as-is | Informational content — this IS the product |
| All calculators | Keep as-is | All 4 calculators work correctly |
| LLM price/performance rankings | Keep as-is | Bar chart exists |
| Live data via OpenRouter API | Keep as-is (but gate it) | Works but currently ungated |
| Daily data updates | **CHANGE: "Live pricing via API"** | No daily mechanism — but live is better |
| CSV export | **MUST IMPLEMENT or REMOVE** | Zero code exists |

### TEAM — NOT safe to sell yet

| Feature | Status | Action |
|---------|--------|--------|
| Up to 10 seats | NOT IMPLEMENTED | Must build or remove |
| Shared dashboards | NOT IMPLEMENTED | Must build or remove |
| Team cost analytics | NOT IMPLEMENTED | Must build or remove |
| Priority support | Operational — can enable via email tagging | Add "Priority" tag to support emails from Team users |
| API access (10K calls/mo) | NOT IMPLEMENTED | Must build or remove |
| Custom alerts | Schema exists, no delivery | Must complete or remove |

### ENTERPRISE — NOT safe to sell yet

| Feature | Status | Action |
|---------|--------|--------|
| Unlimited seats | NOT IMPLEMENTED | Remove until Team tier works |
| Real-time API | NOT IMPLEMENTED | Remove until basic API works |
| Custom dashboards & reports | NOT IMPLEMENTED | Remove |
| SSO & SAML | NOT IMPLEMENTED | Remove |
| Dedicated account manager | Operational promise | Keep — requires hiring plan |
| SLA guarantee | Operational promise | Keep — draft SLA document |
| White-label option | NOT IMPLEMENTED | Remove |

---

## Recommended Pricing Page State

### Immediately safe to keep (after copy fixes):
- **Free tier** — fully deliverable with honest numbers
- **Pro tier** — deliverable after implementing CSV export and gating OpenRouter

### Must downgrade or remove:
- **Team tier** — remove specific feature claims, replace with "Coming soon" or "Contact us"
- **Enterprise tier** — keep as "Contact us" with operational promises only

### Specific copy changes required:

1. Free tier: "60+ models" → "10+ models" (or expand data to match)
2. Free tier: "8 providers" → "6 providers"
3. Free tier: "25+ models" in benchmarks → "10+ models"
4. Free tier: "Weekly data updates" → "Live LLM pricing via API"
5. Pro tier: "1,300+ prices, 15+ providers" → "GPU pricing across 7+ providers"
6. Pro tier: "Daily data updates" → "Live pricing via API"
7. Team tier: Either implement core features or change to "Contact us for early access"
8. Enterprise tier: Keep "Custom" pricing and "Contact us" — don't list unbuilt features

---

## Risk Assessment

### HIGH RISK (could be considered misleading):
- Charging $29/mo for "CSV export" that doesn't exist
- Claiming "60+ models" when there are 11
- Claiming "1,300+ GPU prices" when there are 10
- Selling Team plan ($79/user/mo) with zero team functionality

### MEDIUM RISK:
- "Daily data updates" — no mechanism, but live API is arguably better
- "Custom alerts" — DB schema exists but no delivery

### LOW RISK:
- GPU/Agents/FinOps content being "UI only" — this IS curated research content, which is the product
- Rankings showing top 4 instead of full tables — still provides value
