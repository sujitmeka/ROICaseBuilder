# Benchmark Data & Industry Intelligence Research

> Research completed 2026-02-26. Reference notes — not a final plan.

## Key CX Impact Numbers (Sourced)

### Conversion Rates by Industry
- Financial Services: 8.4% median (Ruler Analytics 2025)
- E-commerce: 1.58-2.58% avg (Smart Insights 2025)
- SaaS website: 1.1-1.2% (RockingWeb 2025)
- Cross-industry average: 3.3% (ElectroIQ 2025)
- **UX impact**: Checkout usability fix = +35.26% conversion (Baymard); good UI = +200%, good UX = +400% (Forrester)

### CX ROI Multipliers
- CX-obsessed companies: 41% faster revenue, 49% faster profit (Forrester 2024)
- CX leaders: 2x revenue growth vs. laggards (McKinsey 2023)
- Every $1 in UX: $100 return / 9,900% ROI (Forrester)
- 1pt CX Index improvement: >$1B revenue for mass-market auto (Forrester 2024)
- Human-centered design: 32% revenue growth, 56% higher shareholder return (McKinsey)
- Personalization excellence: 40% more revenue (McKinsey)
- CX leaders stock: +22.5% cumulative vs. laggards -46.3% (Forrester)

### NPS Benchmarks
- Technology & Services: 66 | Hotels: 44 | Banking: 41 | Automotive: 41
- Airlines: 33 | Insurance: 23 | Median all industries: 42
- Scoring: >0 good, >20 favorable, >60 world class

### Churn Rates
- B2B SaaS: 3.5% | Consumer SaaS: 6.5-8% | Telecom: 21.5%
- Healthcare SaaS: 7.5% | EdTech: 9.6% | Energy/Utilities B2B: ~11%

### CLV Patterns
- E-commerce general: $100-300 | Fashion: $180-340 | Subscription (premium): $480-680
- 5% retention improvement = 25-95% profit increase
- Omnichannel CLV: 30% higher than single-channel

### Cart Abandonment
- Global average: 70.19% (Baymard, 49 studies)
- Luxury: 82.84% | Beauty: 80.92% | Fashion: 78.53% | Food: 63.62%
- Root causes: 48% unexpected costs, 26% forced account creation

### Support Cost Reduction
- Help desk cost per ticket: $15.56 avg ($2.93-$46.69)
- UX optimization: up to 40% expense reduction
- Clear user journeys: 30% support cost reduction

### CSAT by Industry
- Hotels: 82% | E-commerce: 82 | Healthcare: 81 | Banking: 79%
- Cross-industry average: 78% (Salesforce)

### AOV by Industry
- Luxury: $436 | Home: $162 | Global avg: $150-154 | Fashion: $97 | Beauty: $71

## Source Rankings (Tier 1 = Gold Standard)
1. Forrester CX Index (10/10) — paywalled, ~$30K+/yr
2. McKinsey CX Studies (9/10) — free articles, deep reports behind engagement
3. Qualtrics XM Institute (9/10) — gated, free registration for some
4. Baymard Institute (9/10 for e-commerce) — freemium, Premium ~$2,988/yr
5. Nielsen Norman Group (9/10 for UX) — mixed free/paid
6. PwC (8/10) — free PDF
7. Deloitte Digital (8/10) — gated
8. Contentsquare (8/10) — free annual report

**Critical finding**: No major CX benchmark provider offers a public API.

## Recommended 14 Industry Verticals
P0: E-commerce & Retail, SaaS & Tech, Financial Services, Healthcare
P1: Travel & Hospitality, Telecom, Insurance, Media, CPG
P2: Automotive, EdTech, Manufacturing, Energy, Government

## Database Architecture: Hybrid Approach
- **Static base**: Curated ~200+ data points from this research, manually verified
- **Dynamic enrichment**: AI search (Exa/Perplexity) at query time for fresh or niche data
- **CP override layer**: Manual adjustments stored alongside originals

## Confidence Scoring (0.00 - 1.00)
```
confidence = (source_quality * 0.40) + (recency * 0.25) + (specificity * 0.20) + (sample_size * 0.15)
```
- Tier 1 analyst firm: 0.95 source weight
- Current year data: 1.00 recency weight
- 6+ year old data: 0.20 recency weight

## Data Freshness Rules
- Green (< 2yr): Use as-is
- Yellow (2-4yr): Use with warning
- Red (> 4yr): Use only if nothing newer; trigger dynamic search
