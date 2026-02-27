# CPROI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Client Partner ROI Calculator that takes company name + industry + service type, pulls financial data (Valyu/Firecrawl), applies methodology-driven benchmarks, runs 3-scenario ROI calculations, and streams a narrative with full audit trail to a Next.js frontend.

**Architecture:** Single Python orchestrator (Claude Agents SDK) dispatches to 3 subagents: Financial Data (Valyu + Firecrawl), Benchmark Research (Claude WebSearch), ROI Calculation + Narrative. SSE streams progress to a Next.js 15+ frontend. Methodology configs (JSON) drive KPI selection, data gathering, and calculations. Every number traces to a source via a 3-layer audit trail.

**Tech Stack:** Python 3.12+ (backend), Claude Agents SDK (local via Claude Max), Valyu.ai, Firecrawl, Supabase (PostgreSQL), Next.js 15+ (App Router), shadcn/ui + Tremor, Zustand, React Hook Form + Zod, @react-pdf/renderer, pptxgenjs

**Prerequisites:**
- `VALYU_API_KEY` and `FIRECRAWL_API_KEY` must be set in `/Users/sujit/projects/CPROI/.env` before Data Integration Agent runs integration tests
- `SUPABASE_URL` and `SUPABASE_KEY` needed before Narrative + Audit Agent runs DB tests
- No `ANTHROPIC_API_KEY` needed — Agents SDK runs locally via Claude Max subscription

---

## Agent Team Overview

```
                  ┌─────────────────┐
                  │  1. Scaffolding  │
                  │     Agent        │
                  └────────┬────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
     ┌────────────┐ ┌───────────┐ ┌──────────┐
     │ 2. Method- │ │ 3. Data   │ │ 4. Strea-│
     │    ology   │ │ Integra-  │ │   ming + │
     │   Engine   │ │   tion    │ │   API    │
     └─────┬──────┘ └─────┬─────┘ └────┬─────┘
           │              │             │
           ▼              ▼             ▼
     ┌───────────┐ ┌───────────┐ ┌───────────┐
     │ 5. Narra- │ │ 6. Orche- │ │ 7. Front- │
     │ tive +    │ │  strator  │ │   end     │
     │ Audit     │ │           │ │           │
     └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
           │              │             │
           └──────────────┼─────────────┘
                          ▼
                  ┌───────────────┐
                  │   8. QC Agent │
                  └───────────────┘
```

**Parallelism:** Agents 2, 3, 4 run in parallel after Agent 1. Agents 5, 6, 7 run in parallel after their dependencies. Agent 8 runs last.

---

## Agent 1: Scaffolding Agent

**Scope:** Project setup — shared models, enums, config, dependencies. Everything other agents import from.

**Files to create:**
- `pyproject.toml`
- `.env.example`
- `.gitignore`
- `backend/__init__.py`
- `backend/models/__init__.py`
- `backend/models/enums.py` — Industry, ServiceType, Scenario, DataSourceTier, DataSourceType, CompanyType, DataFreshness, FramingType
- `backend/models/audit.py` — SourceAttribution, DataPoint (with `confidence_multiplier` property)
- `backend/models/company_data.py` — CompanyData (with `get()`, `available_fields()`, `completeness_score()`)
- `backend/config/__init__.py`
- `backend/config/settings.py` — Pydantic Settings loading from `.env`
- `tests/__init__.py`
- `tests/conftest.py` — shared fixtures (`retailer_500m`, `minimal_company_data`)
- `tests/test_models.py`

**Success criteria:**
- `pip install -e ".[dev]"` installs cleanly
- `pytest tests/test_models.py -v` passes all tests
- All other agents can `from backend.models.enums import ...` etc.

**Tests it must pass:**

```python
# tests/test_models.py
class TestDataPoint:
    def test_confidence_multiplier_company_reported → 1.0
    def test_confidence_multiplier_industry_benchmark → 0.8
    def test_confidence_multiplier_cross_industry → 0.6
    def test_confidence_multiplier_estimated → 0.4

class TestCompanyData:
    def test_completeness_score_empty → 0.0
    def test_completeness_score_partial → > 0.0
    def test_available_fields_empty → []
    def test_available_fields_partial → contains "annual_revenue"
    def test_get_existing_field → returns DataPoint
    def test_get_missing_field → None
```

**Depends on:** Nothing. Runs first.

**Reference code:** Agent 1 output (`/tmp/agent1_data_integration.md` lines 109-317), Agent 2 output (`/tmp/agent2_methodology.md` lines 82-184)

---

## Agent 2: Methodology Engine Agent

**Scope:** KPI library, methodology config schema, calculation engine. The math brain of CPROI.

**Files to create:**
- `backend/kpi_library/__init__.py`
- `backend/kpi_library/registry.py` — `@register_kpi` decorator, `KPIDefinition`, `get_kpi()`, `get_all_kpis()`
- `backend/kpi_library/formulas.py` — 5 V1 formulas: `calc_conversion_rate_lift`, `calc_aov_increase`, `calc_churn_reduction`, `calc_support_cost_savings`, `calc_nps_referral_revenue`
- `backend/methodology/__init__.py`
- `backend/methodology/schema.py` — Pydantic: `BenchmarkRanges`, `KPIConfig`, `MethodologyConfig` (with `enabled_kpis()`, `total_weight()`)
- `backend/methodology/loader.py` — `load_methodology()`, `get_default_methodology()`
- `backend/methodology/configs/__init__.py`
- `backend/methodology/configs/experience_transformation_design_v1.json` — V1 config with 5 KPIs, realization curve [0.40, 0.70, 0.90], confidence discounts
- `backend/engine/__init__.py`
- `backend/engine/result.py` — `KPIAuditEntry`, `ScenarioResult`, `CalculationResult`
- `backend/engine/calculator.py` — `CalculationEngine.calculate(company_data, methodology_config)` → 3 scenarios with audit trail
- `tests/test_registry.py`
- `tests/test_formulas.py`
- `tests/test_methodology_schema.py`
- `tests/test_loader.py`
- `tests/test_calculator.py`
- `tests/test_edge_cases.py`

**Success criteria:**
- All 5 KPI formulas produce correct results for the $500M retailer example (from `research/roi-methodology-kpi-research.md` lines 339-433)
- V1 JSON config validates and loads
- CalculationEngine produces 3 scenarios where Conservative < Moderate < Aggressive
- Every KPI produces an audit trail entry per scenario
- Realization curve correctly applied (year1 = total * 0.40, year2 = total * 0.70, year3 = total * 0.90)
- Missing inputs gracefully skip KPIs (no crashes)
- Estimated data applies 0.4x confidence discount
- `pytest tests/test_registry.py tests/test_formulas.py tests/test_methodology_schema.py tests/test_loader.py tests/test_calculator.py tests/test_edge_cases.py -v` all pass

**Tests it must pass (59 tests):**

```python
# tests/test_registry.py (4 tests)
class TestKPIRegistry:
    def test_register_kpi_adds_to_registry
    def test_get_kpi_returns_definition
    def test_get_kpi_returns_none_for_missing
    def test_registered_formula_is_callable

# tests/test_formulas.py (17 tests)
class TestConversionRateLift:
    def test_basic_calculation → $200M * 0.20 = $40M
    def test_conservative_scenario → $200M * 0.10 = $20M
    def test_aggressive_scenario → $200M * 0.35 = $70M
    def test_zero_revenue → 0.0
    def test_zero_lift → 0.0
    def test_negative_revenue_raises → ValueError
    def test_lift_over_100pct_raises → ValueError

class TestAOVIncrease:
    def test_basic_calculation → 1.25M * $160 * 0.10 = $20M
    def test_zero_orders → 0.0

class TestChurnReduction:
    def test_basic_calculation → 0.25 * 1M * $200 * 0.15 = $7.5M
    def test_zero_churn → 0.0
    def test_invalid_churn_rate_raises → ValueError

class TestSupportCostSavings:
    def test_basic_calculation → 1M * $10 * 0.30 = $3M

class TestNPSReferralRevenue:
    def test_basic_calculation → $500M * (7/7) * 0.01 = $5M
    def test_zero_improvement → 0.0

class TestAllKPIsRegistered:
    def test_five_kpis_registered
    def test_expected_ids_present

# tests/test_methodology_schema.py (4 tests)
class TestMethodologySchema:
    def test_valid_config_parses
    def test_weights_sum_to_1
    def test_realization_curve_must_have_3_values → raises
    def test_enabled_kpis_filters_correctly

# tests/test_loader.py (5 tests)
class TestMethodologyLoader:
    def test_load_v1_config → isinstance MethodologyConfig
    def test_v1_has_5_kpis
    def test_v1_kpi_ids_match_registry
    def test_get_default_methodology
    def test_realization_curve_is_040_070_090

# tests/test_calculator.py (8 tests)
class TestCalculationEngine:
    def test_produces_three_scenarios
    def test_conservative_less_than_moderate
    def test_moderate_less_than_aggressive
    def test_audit_trail_has_entry_per_kpi
    def test_realization_curve_applied → year1 = total * 0.40
    def test_cumulative_3yr_is_sum → year1 + year2 + year3
    def test_no_nan_in_results
    def test_moderate_nike_in_expected_range → >$1B, <30% of $51B

# tests/test_edge_cases.py (3 tests)
class TestEdgeCases:
    def test_zero_revenue_produces_zero_impact
    def test_missing_inputs_skips_kpi → at least 1 KPI runs, skipped_kpis >= 1
    def test_estimated_data_applies_discount → estimated < company_reported
```

**Depends on:** Agent 1 (Scaffolding)

**Reference code:** Agent 2 output (`/tmp/agent2_methodology.md`, 2836 lines — complete Python code for all components)

---

## Agent 3: Data Integration Agent

**Scope:** Valyu, Firecrawl, and WebSearch providers + data orchestrator with merge/conflict resolution. The data gathering layer.

**Files to create:**
- `backend/providers/__init__.py`
- `backend/providers/base.py` — `ProviderBase` abstract class (`fetch()`, `health_check()`)
- `backend/providers/valyu_provider.py` — `ValyuProvider` with `FIELD_QUERY_MAP`, `_parse_numeric()`, SEC filing queries
- `backend/providers/firecrawl_provider.py` — `FirecrawlProvider` with Pydantic schema extraction from Crunchbase/PitchBook
- `backend/providers/websearch_provider.py` — `WebSearchProvider` wrapping Claude's built-in WebSearch + WebFetch
- `backend/orchestrator/__init__.py`
- `backend/orchestrator/data_orchestrator.py` — routes public companies to Valyu, private to Firecrawl, benchmarks to WebSearch
- `backend/orchestrator/company_classifier.py` — determines if company is public or private
- `backend/orchestrator/merge.py` — multi-source merge with conflict detection and resolution
- `tests/test_valyu_provider.py` (mocked)
- `tests/test_firecrawl_provider.py` (mocked)
- `tests/test_websearch_provider.py` (mocked)
- `tests/test_company_classifier.py`
- `tests/test_merge.py`
- `tests/test_orchestrator.py`
- `tests/integration/test_valyu_live.py` (NEEDS `VALYU_API_KEY`)
- `tests/integration/test_firecrawl_live.py` (NEEDS `FIRECRAWL_API_KEY`)

**Success criteria:**
- Valyu provider parses "$51.2 billion" → 51,200,000,000.0; "45.3%" → 0.453; "N/A" → None
- Valyu provider populates CompanyData with annual_revenue, net_income, gross_margin from mocked SEC filings
- Firecrawl provider extracts funding, revenue estimates from mocked Crunchbase HTML
- WebSearch provider returns benchmark DataPoints with `INDUSTRY_BENCHMARK` confidence tier
- Orchestrator routes Apple (public) to Valyu, routes "Startup XYZ" (private) to Firecrawl
- Merge resolves conflicts: SEC filing beats news article; >10% discrepancy flagged to CP; <10% logged but not flagged
- Integration tests with real APIs return actual financial data for Apple/Nike
- `pytest tests/test_valyu_provider.py tests/test_firecrawl_provider.py tests/test_websearch_provider.py tests/test_merge.py tests/test_orchestrator.py -v` all pass (unit tests, no API keys needed)
- `pytest tests/integration/ -v -m integration` passes (requires API keys)

**Tests it must pass:**

```python
# tests/test_valyu_provider.py (10 tests)
class TestValyuProviderParsing:
    def test_parse_billion_dollar_amount → 51_200_000_000
    def test_parse_million_dollar_amount → 340_500_000
    def test_parse_percentage → 0.025
    def test_parse_plain_number → 51_200_000_000
    def test_parse_returns_none_for_garbage → None
    def test_parse_negative_percentage → -0.052
    def test_parse_trillion → 2_800_000_000_000

class TestValyuProviderFetch:
    def test_successful_fetch → annual_revenue populated, COMPANY_REPORTED tier
    def test_api_failure_records_gap → annual_revenue None, "annual_revenue" in data_gaps
    def test_no_results_records_gap → annual_revenue None, data_gaps populated

# tests/test_firecrawl_provider.py (3 tests)
class TestFirecrawlProvider:
    def test_extracts_funding_data → annual_revenue populated
    def test_handles_missing_fields_gracefully → annual_revenue None
    def test_sets_estimated_confidence_tier → DataSourceTier.ESTIMATED

# tests/test_company_classifier.py (4 tests)
class TestCompanyClassifier:
    def test_apple_is_public
    def test_nike_is_public
    def test_unknown_startup_is_private
    def test_ambiguous_returns_unknown

# tests/test_merge.py (5 tests)
class TestMerge:
    def test_sec_filing_beats_news_article → Valyu value wins
    def test_10pct_discrepancy_flagged → flagged_for_cp = True
    def test_sub_10pct_discrepancy_not_flagged → flagged_for_cp = False
    def test_conflict_audit_trail_complete → has both values, sources, reason
    def test_three_way_conflict_resolved → highest confidence wins

# tests/test_orchestrator.py (4 tests)
class TestDataOrchestrator:
    def test_public_company_routes_to_valyu
    def test_private_company_routes_to_firecrawl
    def test_missing_fields_filled_by_websearch
    def test_returns_populated_company_data

# tests/integration/test_valyu_live.py (2 tests, @pytest.mark.integration)
class TestValyuLive:
    def test_fetch_apple_revenue → value > 300_000_000_000
    def test_fetch_nike_revenue → value > 40_000_000_000

# tests/integration/test_firecrawl_live.py (1 test, @pytest.mark.integration)
class TestFirecrawlLive:
    def test_scrape_crunchbase_company → at least one field populated
```

**Depends on:** Agent 1 (Scaffolding). Integration tests depend on API keys in `.env`.

**Reference code:** Agent 1 output (`/tmp/agent1_data_integration.md`, 3455 lines), Agent 5 output (conflict resolution tests)

---

## Agent 4: Streaming + API Agent

**Scope:** SSE event protocol, StreamManager, FastAPI app with REST + SSE endpoints. The communication layer between backend agents and frontend.

**Files to create:**
- `backend/streaming/__init__.py`
- `backend/streaming/events.py` — `PipelineEventType` enum (20+ event types), `SSEEvent` with `to_sse_string()`
- `backend/streaming/manager.py` — `StreamManager` with `subscribe()`, `emit()`, `event_generator()`, reconnect replay
- `backend/hooks/__init__.py`
- `backend/hooks/progress_hooks.py` — PostToolUse hook mapping tool names to SSE events + human-readable messages
- `backend/hooks/audit_hooks.py` — PostToolUse audit logging
- `backend/main.py` — FastAPI app: `POST /api/cases`, `GET /api/cases/{caseId}/stream` (SSE), `GET /api/cases/{caseId}`, CORS
- `tests/test_events.py`
- `tests/test_stream_manager.py`
- `tests/test_api.py`

**Success criteria:**
- SSEEvent serializes to valid SSE wire protocol (`event: <type>\ndata: <json>\nid: <seq>\n\n`)
- All 20+ PipelineEventType values are defined
- StreamManager broadcasts to multiple subscribers
- StreamManager replays missed events on reconnect (Last-Event-ID)
- `POST /api/cases` returns `{ case_id, status: "started" }`
- `GET /api/cases/{caseId}/stream` returns `text/event-stream` content type
- Progress hooks map tool names to human-readable messages ("Fetching company financial data...", "Searching for industry benchmarks...")
- `pytest tests/test_events.py tests/test_stream_manager.py tests/test_api.py -v` all pass

**Tests it must pass:**

```python
# tests/test_events.py (3 tests)
class TestSSEEvent:
    def test_serializes_to_sse_format → contains "event:", "data:", "id:"
    def test_all_event_types_defined → 20+ event types exist
    def test_event_payload_is_valid_json

# tests/test_stream_manager.py (5 tests)
class TestStreamManager:
    def test_subscribe_returns_queue
    def test_emit_delivers_to_subscriber
    def test_emit_delivers_to_multiple_subscribers
    def test_unsubscribe_stops_delivery
    def test_replay_missed_events_on_reconnect → events with seq > last_event_id replayed

# tests/test_api.py (4 tests)
class TestAPI:
    def test_create_case_returns_case_id
    def test_stream_endpoint_returns_event_stream_content_type
    def test_cors_allows_localhost_3000
    def test_health_check_endpoint

# tests/test_hooks.py (2 tests)
class TestProgressHooks:
    def test_tool_name_maps_to_human_message → "mcp__cproi-tools__fetch_public_financials" → "Fetching company financial data..."
    def test_unknown_tool_gets_generic_message
```

**Depends on:** Agent 1 (Scaffolding)

**Reference code:** Agent 5 output (events.py, manager.py, main.py, progress_hooks.py — complete implementations)

---

## Agent 5: Narrative + Audit Trail Agent

**Scope:** Confidence scoring engine, SCR narrative generation prompts, source attribution, override system, Supabase schema. The trust and storytelling layer.

**Files to create:**
- `backend/engine/confidence.py` — `compute_confidence_score()`, `compute_recency_score()`, `confidence_tier_from_score()`, `confidence_to_discount()`
- `backend/prompts/__init__.py`
- `backend/prompts/narrative_system.py` — SCR narrative prompt for Claude (Situation → Complication → Resolution)
- `backend/prompts/narrative_cfo.py` — CFO framing: "Revenue at Risk"
- `backend/db/__init__.py`
- `backend/db/schema.sql` — Complete Supabase schema: `roi_cases`, `data_sources`, `data_points`, `calculations`, `narratives`, `overrides` tables with RLS and triggers
- `tests/test_confidence.py`
- `tests/test_narrative_quality.py`

**Success criteria:**
- Confidence scores compute correctly: SEC filing + current year + company-specific → ~1.0; estimated + 5yr old + cross-industry → ~0.36
- Recency scoring: current year → 1.0; 1yr old → 0.85; 3yr old → 0.50; 6+yr → 0.20; unknown → 0.30
- Confidence weights sum to 1.0 (source_quality: 0.40, recency: 0.25, specificity: 0.20, sample_size: 0.15)
- Discount multipliers: company_reported → 1.0, industry_benchmark → 0.8, cross_industry → 0.6, estimated → 0.4
- Narrative prompt produces SCR structure with inline [n] citations and confidence badges
- Supabase schema creates without errors
- `pytest tests/test_confidence.py tests/test_narrative_quality.py -v` all pass

**Tests it must pass:**

```python
# tests/test_confidence.py (13 tests)
class TestRecencyScore:
    def test_current_year_data_scores_1
    def test_one_year_old_data → 0.85
    def test_three_year_old_data → 0.50
    def test_six_plus_year_old_data → 0.20
    def test_unknown_date_scores_030
    def test_future_date_scores_1

class TestCompositeConfidence:
    def test_perfect_score → ~1.0
    def test_tier1_benchmark_recent → ~0.88
    def test_estimated_cross_industry_old → ~0.36
    def test_weights_sum_to_1
    def test_score_clamped_to_unit_interval → 0.0-1.0

class TestConfidenceDiscount:
    def test_company_reported_no_discount → 1.0
    def test_estimated_60pct_discount → 0.4

# tests/test_narrative_quality.py (8 tests)
class TestNarrativeStructure:
    def test_scr_sections_present → Situation, Complication, Resolution
    def test_headline_present → "$[X]M experience opportunity"
    def test_inline_citations_present → at least 3 [n] citations
    def test_confidence_badges_present → at least 2 of [Company Data], [Benchmark], [Estimated]
    def test_three_scenarios_present
    def test_conservative_scenario_presented_first
    def test_dollar_amounts_with_percentages → at least 5 dollar figures
    def test_sources_section_present
```

**Depends on:** Agent 2 (Methodology Engine — needs CalculationResult to generate narratives), Agent 3 (Data Integration — needs source attribution types)

**Reference code:** Agent 3 output (`/tmp/agent3_narrative.md`, 4023 lines — Supabase schema, confidence engine, narrative prompts, override system)

---

## Agent 6: Orchestrator Agent

**Scope:** Claude Agents SDK wiring — system prompts, subagent definitions, custom `@tool` functions, main orchestration loop. Wires everything together.

**Files to create:**
- `backend/orchestrator/agent.py` — `CPROIOrchestrator` class using Claude Agents SDK `query()`
- `backend/orchestrator/system_prompt.py` — instructs orchestrator to use methodology config to drive data gathering
- `backend/orchestrator/subagents.py` — 3 subagent definitions: Financial Data, Benchmark Research, ROI Calc + Narrative
- `backend/tools/__init__.py`
- `backend/tools/agent_tools.py` — `@tool` decorated: `fetch_public_financials`, `scrape_private_company`, `search_benchmarks`, `run_roi_calculation`, `generate_narrative`, `store_case`, `load_methodology_config`
- `tests/test_orchestrator_agent.py`

**Success criteria:**
- System prompt correctly references methodology config to determine data needs
- 3 subagent definitions have appropriate tool access (Financial gets Valyu/Firecrawl tools, Benchmark gets WebSearch, Calc gets calculation tools)
- Custom tools are properly decorated and return correct types
- Orchestrator emits SSE events at each pipeline step via hooks
- Mock end-to-end: orchestrator receives "Nike + retail + experience-transformation-design" → dispatches subagents → returns CalculationResult + narrative
- `pytest tests/test_orchestrator_agent.py -v` passes

**Tests it must pass:**

```python
# tests/test_orchestrator_agent.py (6 tests)
class TestOrchestratorAgent:
    def test_system_prompt_references_methodology
    def test_three_subagents_defined
    def test_financial_subagent_has_valyu_tools
    def test_benchmark_subagent_has_websearch_tools
    def test_calc_subagent_has_calculation_tools
    def test_custom_tools_return_correct_types
```

**Depends on:** Agent 2 (Methodology Engine), Agent 3 (Data Integration), Agent 4 (Streaming + API)

**Reference code:** Agent 1 output (agent tools), Agent 5 output (orchestrator, hooks, subagent definitions)

---

## Agent 7: Frontend Agent

**Scope:** Next.js 15+ app — input form, progressive streaming view, 3-panel results layout, override system, methodology browser, export.

**Files to create:**
- `frontend/` — full Next.js project (create-next-app + shadcn/ui + Tremor + Zustand)
- `frontend/src/app/page.tsx` — Input form page
- `frontend/src/app/cases/[caseId]/page.tsx` — Results page (streaming + final)
- `frontend/src/app/methodologies/page.tsx` — Methodology browser
- `frontend/src/app/api/cases/route.ts` — POST: create case
- `frontend/src/app/api/cases/[caseId]/stream/route.ts` — GET: SSE proxy
- `frontend/src/lib/sse-client.ts` — EventSource wrapper
- `frontend/src/hooks/use-event-stream.ts` — React hook for SSE
- `frontend/src/stores/stream-store.ts` — pipeline steps, connection status
- `frontend/src/stores/case-store.ts` — calculation results, narrative, audit trail
- `frontend/src/stores/override-store.ts` — pending and applied overrides
- `frontend/src/components/input-form/` — CaseInputForm, CompanyAutocomplete, IndustrySelect, ServiceTypeSelect
- `frontend/src/components/streaming/` — StreamingView, PipelineTimeline, PipelineStep, NarrativeStream
- `frontend/src/components/results/` — ResultsLayout (3-panel), HeroMetricBar, ScenarioToggle, NarrativePanel, AuditSidebar, AuditEntry, DataBadge, CitationMarker, ImpactBreakdownChart
- `frontend/src/components/overrides/` — InlineEditor, OverrideBadge, ResetLink
- `frontend/src/components/methodologies/` — MethodologyList, MethodologyCard, MethodologyDetail, KpiRow
- `frontend/src/components/export/` — ExportMenu, PdfDocument, PptxGenerator
- `frontend/__tests__/` — component tests

**Success criteria:**
- Input form has 3 fields (company name autocomplete, industry dropdown, service type dropdown defaulting to "Experience Transformation & Design")
- Form validates with Zod (company name required, industry required)
- SSE client connects to backend stream and routes events to Zustand stores
- Streaming view shows vertical timeline of agent steps (pending → active → complete)
- Results layout: hero bar (top) + narrative 60% (left) + audit sidebar 40% (right)
- Scenario toggle switches between Conservative / Moderate / Aggressive
- Data badges render correctly: blue "Company Data", purple "Benchmark", amber "Manual Override"
- Inline editor: click → edit → badge changes → live recalc → reset link
- Methodology browser shows KPIs, weights, benchmark ranges (read-only)
- PDF and PPTX export render without errors
- `npm run build` succeeds with no type errors
- `npx vitest run` passes all component tests

**Tests it must pass (via Vitest + React Testing Library):**

```typescript
// CaseInputForm.test.tsx (5 tests)
it("renders all three input fields")
it("shows validation error when company name is empty on submit")
it("shows validation error when industry is not selected")
it("disables submit button while submitting")
it("defaults service type to Experience Transformation & Design")

// CompanyAutocomplete.test.tsx (4 tests)
it("renders input with placeholder")
it("does not show dropdown for < 2 chars")
it("shows suggestions after debounce for 2+ chars")
it("has correct ARIA combobox attributes")

// PipelineStep.test.tsx (5 tests)
it("renders step label")
it("shows muted text for pending steps")
it("shows spinner for active steps")
it("shows check icon for completed steps")
it("shows error message for error steps")

// HeroMetricBar.test.tsx (3 tests)
it("renders all four metric cards")
it("formats large currency values correctly")
it("has aria-label for screen readers")

// ScenarioToggle.test.tsx (3 tests)
it("renders all three scenario options")
it("marks active scenario as checked")
it("updates store on click")

// InlineEditor.test.tsx (4 tests)
it("displays formatted value when not editing")
it("enters edit mode when clicked")
it("confirms override on Enter")
it("cancels editing on Escape")

// AuditSidebar.test.tsx (2 tests)
it("renders all audit entries")
it("highlights entries matching active section")
```

**Depends on:** Agent 4 (Streaming + API — needs SSE event format to build client)

**Reference code:** Agent 4 output (`/tmp/agent4_frontend.md`, 4496 lines — complete component code, stores, tests)

---

## Agent 8: QC Agent

**Scope:** Cross-cutting quality assurance — audit trail completeness, conflict resolution policy, error resilience, narrative quality, regression baselines. Runs AFTER all other agents.

**Files to create:**
- `tests/qc/__init__.py`
- `tests/qc/test_audit_trail_completeness.py`
- `tests/qc/test_data_conflict_resolution.py`
- `tests/qc/test_error_resilience.py`
- `tests/regression/__init__.py`
- `tests/regression/test_nike_retail.py`
- `tests/integration/__init__.py`
- `tests/integration/test_full_pipeline.py`

**Success criteria:**
- Every enabled KPI produces exactly one audit entry per scenario
- Sum of individual KPI impacts equals total_annual_impact (within 1%)
- cumulative_3yr = year1 + year2 + year3
- No NaN or negative impacts anywhere
- SEC data beats WebSearch data in conflict resolution
- >10% discrepancy flagged to CP, <10% not flagged
- Valyu timeout doesn't crash pipeline (graceful fallback)
- Firecrawl empty response produces warnings, not errors
- Nike regression baseline: moderate >$1B, <30% of revenue, conservative < moderate < aggressive
- Full pipeline end-to-end produces complete CalculationResult + narrative
- `pytest tests/qc/ tests/regression/ -v` all pass

**Tests it must pass:**

```python
# tests/qc/test_audit_trail_completeness.py (5 tests)
class TestAuditTrailCompleteness:
    def test_every_kpi_has_audit_entry
    def test_audit_entry_has_required_fields → kpi_id, formula, inputs, benchmark_value, raw_impact, adjusted_impact, confidence_tier
    def test_impact_breakdown_matches_audit_sum → sum == total_annual_impact
    def test_cumulative_3yr_matches_realization_curve → year1 + year2 + year3
    def test_no_nan_or_negative_impacts

# tests/qc/test_data_conflict_resolution.py (5 tests)
class TestConflictResolutionPolicy:
    def test_sec_filing_beats_news_article
    def test_10pct_discrepancy_flagged
    def test_sub_10pct_discrepancy_not_flagged
    def test_conflict_audit_trail_complete → has both values, sources, resolution reason
    def test_three_way_conflict_resolved → highest confidence wins

# tests/qc/test_error_resilience.py (3 tests)
class TestErrorResilience:
    def test_valyu_timeout_doesnt_crash_pipeline
    def test_firecrawl_empty_response_graceful
    def test_pipeline_uses_defaults_when_no_benchmarks

# tests/regression/test_nike_retail.py (5 tests)
class TestNikeRetailRegression:
    def test_moderate_total_in_expected_range → >$1B, <$15B
    def test_conservative_less_than_moderate
    def test_aggressive_greater_than_moderate
    def test_roi_percentage_positive → >100% for $2M engagement
    def test_conversion_lift_is_largest_component

# tests/integration/test_full_pipeline.py (3 tests)
class TestFullPipeline:
    def test_pipeline_produces_calculation_result
    def test_pipeline_produces_narrative_with_scr_structure
    def test_override_applies_and_recalculates
```

**Depends on:** ALL other agents (2-7 must be complete)

**Reference code:** Agent 5 output (complete QC test suite, regression tests, conflict resolution tests)

---

## Execution Plan

**Wave 1 (runs first):**
- Agent 1: Scaffolding — ~10 min

**Wave 2 (runs in parallel after Wave 1):**
- Agent 2: Methodology Engine — ~30 min
- Agent 3: Data Integration — ~30 min
- Agent 4: Streaming + API — ~20 min

**Wave 3 (runs in parallel after Wave 2):**
- Agent 5: Narrative + Audit — ~25 min (needs Agents 2, 3)
- Agent 6: Orchestrator — ~25 min (needs Agents 2, 3, 4)
- Agent 7: Frontend — ~40 min (needs Agent 4)

**Wave 4 (runs last):**
- Agent 8: QC — ~15 min (needs ALL)

**Total test count:** ~162 tests across 8 agents

**Detailed agent output references (complete code):**
- Agent 1 (Data Integration architecture): `/tmp/agent1_data_integration.md` (3455 lines)
- Agent 2 (Methodology Engine): `/tmp/agent2_methodology.md` (2836 lines)
- Agent 3 (Narrative + Audit Trail): `/tmp/agent3_narrative.md` (4023 lines)
- Agent 4 (Frontend UX): `/tmp/agent4_frontend.md` (4496 lines)
- Agent 5 (Orchestrator + QC): Task output `a80c4ef22cd7fbd3f` (100K+ tokens)
