# UX & Interface Design Research

> Research completed 2026-02-26. Reference notes — not a final plan.

## Competitive Landscape

### Key Competitors
- **Ecosystems.io** — Most relevant. Co-authored business cases, AI value engineer, CRM integration. Enterprise-heavy.
- **DecisionLink ValueCloud** — Self-service value engines, CRM integration. Focused on ongoing value tracking.
- **Cuvama** — Guided discovery + collaborative business case. Persona-aware outputs.
- **Shark Finesse** — 200+ benefit calculators, Word/PPT/Excel export. Template-heavy, not AI-driven.
- **Mediafly** — Dynamic presentations + ROI calculators. $30-80K/year. Content platform with calculators bolted on.
- **LeveragePoint** — Real-time value proposition customization during live conversations.
- **ValueCore** — ROI data to visuals, automated QBR decks.

### CPROI's Competitive Moat (What No One Else Does)
1. Automated data pull from just "company name + vertical"
2. Experience-design-specific KPI/benchmark library
3. Bloomberg-grade source attribution audit trail
4. AI-generated persuasive narrative with citations
5. Lightweight single-user workflow vs. enterprise suite

### Borrow From Competitors
- Co-editing/override pattern (Ecosystems)
- Guided discovery flow (Cuvama)
- Multi-format export (Shark Finesse)

## Audit Trail UX Patterns

### Financial Tool Patterns
- **Bloomberg**: Progressive disclosure — main view clean, source details one click away. Every data point has provenance chain.
- **S&P Capital IQ**: Data "much cleaner and better organized." Mini-card per metric showing source, date, confidence.

### AI Citation Patterns
- **Perplexity**: Inline [n] references, source metadata (title, favicon, domain). Known issue: citation overreach.
- **Elicit**: Sentence-level citations, drill into source quotes by clicking cells. Low-confidence answers subtly flagged.

### Recommended 3-Layer Audit Trail
| Layer | Shows | Access Method |
|-------|-------|--------------|
| Layer 1: Narrative | Clean story with inline [n] citations + confidence badges | Primary view |
| Layer 2: Calculation | Formula breakdown, inputs, outputs, scenario assumptions | Expandable accordion or side panel |
| Layer 3: Source | Raw source URL, date, API used, confidence score | Click-through from Layer 2 |

### Visual Data Class Language
| Data Class | Badge | Color |
|-----------|-------|-------|
| Company-specific (verified) | "Company Data" | Blue/teal solid |
| Company-specific (estimated) | "Estimated" | Blue/teal dashed |
| Industry benchmark | "Benchmark" | Purple solid |
| CP Override | "Manual Override" | Amber/gold |

## Interface Design

### Results Layout (3-Panel)
- **Top**: Hero metric bar with scenario toggle (Conservative / Moderate / Aggressive)
- **Left 60%**: Narrative document (SCR structure)
- **Right 40%**: Synced audit sidebar — updates contextually as CP scrolls

### Override Flow
1. CP clicks benchmark value in audit panel
2. Value becomes editable inline
3. Badge changes to "Manual Override" (amber)
4. Calculations update live
5. Audit trail records original → override with reason
6. "Reset to benchmark" link remains

### Export Formats
- **Primary**: Branded PDF (non-negotiable baseline)
- **Secondary**: Interactive shareable web link (differentiator)
- **Tertiary**: PPTX/Google Slides (3-5 slides for proposal decks)

## Consulting Firm Presentation Patterns
- **McKinsey Pyramid Principle**: Lead with the answer, not the data
- **SCR Framework**: Situation → Complication → Resolution
- **Action Title Slides**: Insight statements, not category labels
- **Appendix Pattern**: Main deck tells story; appendix = full evidence (maps to narrative + audit trail)

## Credibility vs. Salesy
**DO**: Ranges over point estimates, specific cited sources, acknowledge limitations, conservative framing by default
**DON'T**: Single-point precision on uncertain data, hide assumptions, superlatives, cherry-picked benchmarks

## Frontend Tech Stack Recommendation
- **Framework**: Next.js 15+ (App Router, RSC, Server Actions)
- **UI**: shadcn/ui (base) + Tremor (data viz)
- **Charts**: Recharts (via Tremor)
- **State**: Zustand
- **Forms**: React Hook Form + Zod
- **PDF**: @react-pdf/renderer
- **PPTX**: pptxgenjs
- **Auth**: NextAuth.js or Clerk
- **Deploy**: Vercel
