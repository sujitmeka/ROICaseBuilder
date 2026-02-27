# Valyu.ai Research

> Research completed 2026-02-27. Reference notes — not a final plan.

## What Is Valyu.ai?

- London-based startup (founded 2022, ~7 employees)
- Unified search API for AI agents and LLMs
- 36+ proprietary data sources + web search in one API
- Notable clients: Morgan Stanley, Gov.UK, MIT, Cambridge University, Lockheed Martin
- SOC2 compliant, zero data retention, SSO

## Core APIs (4 endpoints)

| API | Purpose | Use for CPROI |
|-----|---------|--------------|
| **Search API** (`/v1/search`) | Query web + proprietary sources | Company financials, benchmark research |
| **Contents API** (`/v1/contents`) | Extract structured content from URLs | Source verification, audit trail |
| **Answer API** (`/v1/answer`) | AI-generated answers grounded in search | Narrative generation support |
| **DeepResearch API** (`/v1/deepresearch`) | Async multi-step research tasks | Deep benchmark/industry research |

### Search Parameters
- `search_type`: "all", "web", or "proprietary"
- `included_sources` / `excluded_sources`: target specific datasets
- `relevance_threshold`: 0-1 quality filter
- `max_price`: cost cap per query
- `start_date` / `end_date`: temporal filtering
- `country_code`, `category`, `fast_mode`, `max_num_results` (1-20)

## Data Sources Relevant to CPROI

### Financial Data (9 sources, US public companies only)
1. **Earnings Insights** — quarterly/annual EPS, revenue, net income (real-time updates)
2. **Key Financial Metrics** — P/E, ROE, debt-to-equity ratios (real-time)
3. **Balance Sheet Breakdown** — assets, liabilities, equity (quarterly)
4. **Income Statement Analysis** — revenue, COGS, SG&A, operating/net income (quarterly)
5. **Cash Flow Visibility** — operating, investing, financing activities (quarterly)
6. **Dividend Histories** — amounts, yields, declaration dates (daily)
7. **Insider Transaction Logs** — executive buys/sells, filterable by officer (daily)
8. **Market Movers** — top gainers, losers, volume leaders (real-time)
9. **SEC Filings** — full-text 10-Ks, 10-Qs, 8-Ks (updates within 5-10 min of EDGAR)

### Market Data Coverage
- 200K+ stocks across 75 global exchanges
- 200+ cryptocurrencies
- 180+ forex pairs
- 25K+ ETFs, 10K+ mutual funds, 60+ commodity futures

### Research/Academic Data
- PubMed: 37M+ biomedical papers
- arXiv: 2.5M+ preprints
- SEC filings: 3M+ documents
- US Patents: 8M+
- Clinical trials: 500K+ studies
- ChEMBL: 2.5M+ bioactive molecules

## Pricing

### Search API (per 1,000 retrievals)
| Source Type | Cost per 1K |
|------------|------------|
| Open Databases | $0.50 |
| Web Search | $1.50 |
| Financial & Market Data | $8.00 |
| Proprietary Databases | $30-50 |

### Other APIs
- **Contents API**: $0.001/URL base + $0.001/URL for AI processing
- **Answer API**: Search costs + $12/M tokens for AI; ~$0.039/basic query
- **DeepResearch API** (fixed per task):
  - Fast: $0.10 (~5 min)
  - Standard: $0.50 (~10-20 min)
  - Heavy: $2.50 (~90 min)
  - Max: $15.00 (~180 min)

### Getting Started
- $10 free credits on signup (1000+ free queries)
- Python: `pip install valyu`
- JavaScript: `npm install valyu-js`
- Auth: `x-api-key` header or `VALYU_API_KEY` env var

## Benchmark Performance

| Benchmark | Valyu | Parallel | Exa | Google |
|-----------|-------|----------|-----|--------|
| FreshQA | **79%** | — | — | 24-52% |
| SimpleQA | **94%** | — | — | — |
| Finance | **73%** | 67% | 63% | 55% |
| Economics | **73%** | — | — | — |

## SEC Filings Integration (Key Advantage)

- Natural language querying (e.g., "Risk factors from 10-K Pfizer FY2021")
- Filings delivered as clean JSON with semantic segmentation
- Specific sections retrievable: MD&A, Risk Factors, Financial Statements
- Updates within 5-10 minutes of EDGAR publication
- Eliminates HTML scraping and regex parsing of raw EDGAR
- 3-line integration code
- Supports LangChain, Vercel AI SDK, LlamaIndex, Claude Agent SDK

## SDK & Integrations

- SDKs: Python, TypeScript, Rust
- AI frameworks: Claude Agent SDK, LangChain, LlamaIndex, Vercel AI SDK
- Platforms: OpenAI, Google Gemini, AWS Bedrock, n8n, MCP servers

## Critical Limitations

1. **No private company data** — cannot replace Crunchbase/PitchBook for startups, funding, revenue estimates
2. **US-only for company fundamentals** — international filing support in development
3. **73% financial accuracy** — good but not perfect; needs validation layer
4. **Small startup** (7 employees) — vendor risk for critical dependency
5. **No revenue estimates or forward-looking projections** — forecasting requires other sources
6. **Rate limits not publicly documented**

## CPROI Impact Assessment

### What Valyu Could Replace
| Current Plan | Valyu Replacement | Savings |
|-------------|-------------------|---------|
| FMP ($99/mo) | Valyu financial data sources | ~$99/mo |
| SEC EDGAR (free but complex) | Valyu SEC filings (NL queries, structured JSON) | Dev time |
| sec-api.io ($49/mo) | Valyu SEC filings | ~$49/mo |
| Exa.ai ($5/1K searches) | Valyu proprietary search | Variable |

### What Valyu Cannot Replace
- **Perplexity Sonar** — still best for benchmark/industry research with inline citations
- **Private company data** — still need Crunchbase, browser automation, or alternatives (Global Database, Zephira.ai)

### Recommended Stack with Valyu
1. **Valyu** — public company financials, SEC filings, academic research ($8/1K financial queries)
2. **Perplexity Sonar Pro** — CX/UX benchmark research with cited sources (~$1-5/M tokens)
3. **Browser automation or Perplexity** — private company data (defer to post-MVP)

### Cost Comparison
- **Without Valyu**: FMP $99 + sec-api.io $49 + Exa ~$50 + Perplexity ~$50 = ~$248/mo
- **With Valyu**: Valyu ~$80-150 (usage-based) + Perplexity ~$50 = ~$130-200/mo
- **Estimated savings**: $50-120/mo + significantly simpler integration (one SDK vs. four)
