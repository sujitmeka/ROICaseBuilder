# Engineering & Data Infrastructure Research

> Research completed 2026-02-26. Reference notes — not a final plan.

## Claude Agents SDK

- Python + TypeScript SDKs, same agent loop as Claude Code
- Built-in tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch
- Custom tools via `@tool` decorator — run as in-process MCP servers (no subprocess overhead)
- Hooks system: PreToolUse, PostToolUse, Stop, SessionStart — ideal for audit logging
- Subagents via Task tool — each gets own context window, instructions, tool set
- Sessions persist across exchanges; can resume/fork by session ID

### Recommended Architecture
Single orchestrator agent dispatching to 3 specialized subagents:
1. **Financial Data Agent** — Valyu API for public companies, Firecrawl for private company scraping
2. **Benchmark Research Agent** — Claude's built-in WebSearch + WebFetch (no external search API needed for MVP; Perplexity Sonar as optional upgrade if quality insufficient)
3. **ROI Calculation + Narrative Agent** — custom Python tools for math + narrative gen

## Financial Data APIs

### Financial Modeling Prep (FMP)
- 70,000+ securities, 46 countries, 30+ years historical
- 100+ endpoints: income statement, balance sheet, cash flow, ratios, key metrics, earnings transcripts
- REST API (JSON), WebSocket, Bulk Download
- Free: 250 req/day, 5 years annual, US only
- Paid: ~$99/mo starter
- Already a Perplexity Finance data partner

### SEC EDGAR (Official, Free)
- RESTful JSON APIs, no auth required
- XBRL data from 10-Q, 10-K, 8-K filings
- Company Facts API + XBRL Frame API for structured financials
- 10 req/s rate limit
- Free

### sec-api.io (Third-Party SEC Wrapper)
- XBRL-to-JSON conversion, 18M+ filings searchable
- Extracts income statements, balance sheets as structured JSON
- $49/mo personal tier

### Alpha Vantage
- 200K+ tickers, 50+ technical indicators
- Free: 25 req/day; Paid: $49.99/mo
- Stronger for market/technical data than fundamentals

### Crunchbase API
- Private company data: funding rounds, acquisitions, key personnel, investors
- 200 calls/min; Business tier ~$199/mo for API access

### PitchBook API
- Enterprise-only, separate contract, ~$10K+/year
- Richest private company data but prohibitive for MVP

### Other Notable APIs
- **Polygon.io**: Real-time US market + fundamentals from SEC, ~$249/mo
- **Finnhub**: 60 calls/min free tier (most generous), fundamentals + earnings
- **Intrinio**: Enterprise-grade, ~$200/mo+
- **Quartr**: Earnings call transcripts + audio, custom pricing

## Search/Research APIs (for benchmarks)

### Perplexity Sonar API
- Models: sonar, sonar-pro, sonar-deep-research
- Returns answers WITH citations (every claim traceable to source URL)
- Pricing: $1-$15/M tokens depending on model
- F-score 0.858 for factuality

### Exa.ai
- Transformer-based neural/semantic search
- $5/1K searches, $5/1K page retrievals
- Finds niche research that keyword search misses

### Tavily
- Purpose-built for AI agents/RAG
- $0.008/credit, 1000 free/month
- Native LangChain/LlamaIndex integration

## Persistence Recommendation
- **Supabase (PostgreSQL)**: Free tier, built-in auth, real-time, 150-line SQL audit solution
- Schema: roi_cases, data_fetches, benchmarks_used, calculations, narratives, overrides tables

## MVP Data Stack Decision (Updated 2026-02-27)

### Simplified to 2 external dependencies:
| Dependency | Purpose | Replaces |
|-----------|---------|----------|
| **Valyu.ai** | Public company financials + SEC filings | FMP ($99/mo) + sec-api.io ($49/mo) + raw EDGAR |
| **Firecrawl** | Private company data via Crunchbase/PitchBook scraping | Crunchbase API ($199/mo) |

### Handled by Claude Agents SDK (no external API):
- **Industry/CX benchmarks** — WebSearch + WebFetch built-in tools
- **ROI calculations** — custom Python tools
- **Narrative generation** — Claude native capability

### Why not Perplexity Sonar for benchmarks?
Claude's built-in WebSearch can find and cite the same Forrester/McKinsey/Baymard stats. Perplexity Sonar adds structured citation metadata but is an unnecessary dependency for MVP. Can add later if Claude's research quality proves insufficient.

### Why Firecrawl over Crunchbase API?
- Crunchbase API: $199/mo, structured but limited to their data model
- Firecrawl: pay-per-use, AI-powered extraction, natural language schema definition, no brittle selectors
- Reference: https://www.firecrawl.dev/blog/crunchbase-scraping-with-firecrawl-claude
- Caveat: Crunchbase TOS may restrict scraping; fine for low-volume MVP usage

## Estimated MVP Cost
~$50-150/mo (Valyu usage-based + Firecrawl usage-based) + Claude API usage (~$0.15-0.60 per ROI case)
Savings vs. original estimate: ~$200-250/mo
