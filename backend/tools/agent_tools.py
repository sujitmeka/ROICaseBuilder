"""Custom tools for the CPROI agent — registered with Claude Agent SDK.

Each tool returns MCP-compatible response format:
{"content": [{"type": "text", "text": "<json_string>"}]}
"""

from __future__ import annotations

import json
import logging
from dataclasses import fields as dataclass_fields
from typing import Any

from claude_agent_sdk import tool

from backend.engine.calculator import CalculationEngine
from backend.engine.result import CalculationResult
from backend.methodology.loader import get_default_methodology
from backend.methodology.schema import MethodologyConfig
from backend.models.audit import DataPoint, SourceAttribution
from backend.models.company_data import CompanyData
from backend.models.enums import DataSourceTier, DataSourceType
from backend.providers.valyu_provider import ValyuProvider
from backend.providers.firecrawl_provider import FirecrawlProvider

logger = logging.getLogger(__name__)


def _text_response(data: Any) -> dict:
    """Wrap data in MCP tool response format."""
    return {"content": [{"type": "text", "text": json.dumps(data, default=str)}]}


@tool(
    "fetch_financials",
    "Fetch company financial data from SEC filings (public) or Crunchbase (private). "
    "Returns populated fields with values and a list of data gaps.",
    {"company_name": str, "industry": str},
)
async def fetch_financials(args: dict) -> dict:
    company_name = args["company_name"]
    industry = args["industry"]

    # Try Valyu first (public companies / SEC filings)
    provider = ValyuProvider()
    try:
        company_data = await provider.fetch(company_name, industry)
    except Exception as e:
        logger.warning(f"Valyu failed for {company_name}, trying Firecrawl: {e}")
        # Fall back to Firecrawl for private companies
        provider = FirecrawlProvider()
        try:
            company_data = await provider.fetch(company_name, industry)
        except Exception as e2:
            logger.error(f"Both providers failed for {company_name}: {e2}")
            return _text_response({
                "company_name": company_name,
                "industry": industry,
                "fields": {},
                "gaps": ["all_fields"],
                "error": f"Could not fetch financial data: {e2}",
            })

    result = _company_data_to_dict(company_data)
    result["gaps"] = getattr(company_data, "_data_gaps", [])
    return _text_response(result)


@tool(
    "scrape_company",
    "Scrape private company data from Crunchbase/PitchBook via Firecrawl. "
    "Use this when fetch_financials returns no data for a private company.",
    {"company_name": str, "industry": str},
)
async def scrape_company(args: dict) -> dict:
    company_name = args["company_name"]
    industry = args["industry"]

    provider = FirecrawlProvider()
    try:
        company_data = await provider.fetch(company_name, industry)
    except Exception as e:
        return _text_response({
            "company_name": company_name,
            "fields": {},
            "gaps": ["all_fields"],
            "error": str(e),
        })

    result = _company_data_to_dict(company_data)
    result["gaps"] = getattr(company_data, "_data_gaps", [])
    return _text_response(result)


@tool(
    "run_calculation",
    "Run ROI calculation against company data using the methodology engine. "
    "Returns 3 scenarios (conservative/moderate/aggressive) with full audit trail. "
    "The company_data should include all available fields gathered from financial "
    "data and benchmark research.",
    {"company_data": dict, "service_type": str},
)
async def run_calculation(args: dict) -> dict:
    company_data = _dict_to_company_data(args["company_data"])
    methodology = get_default_methodology()
    engine = CalculationEngine()
    result = engine.calculate(company_data, methodology)
    return _text_response(_calculation_result_to_dict(result))


@tool(
    "load_methodology",
    "Load the methodology configuration for a service type. Returns the full "
    "methodology config including KPI definitions, required inputs, benchmark "
    "ranges, weights, and realization curve. Use this FIRST to understand what "
    "data fields you need to gather.",
    {"service_type": str},
)
async def load_methodology(args: dict) -> dict:
    methodology = get_default_methodology()
    # Return a simplified view focused on what the agent needs
    kpis = []
    all_inputs: set[str] = set()
    for kpi in methodology.enabled_kpis():
        kpi_info = {
            "id": kpi.id,
            "label": kpi.label,
            "weight": kpi.weight,
            "formula": kpi.formula,
            "inputs": kpi.inputs,
            "benchmark_ranges": {
                "conservative": kpi.benchmark_ranges.conservative,
                "moderate": kpi.benchmark_ranges.moderate,
                "aggressive": kpi.benchmark_ranges.aggressive,
            },
            "benchmark_source": kpi.benchmark_source,
        }
        kpis.append(kpi_info)
        all_inputs.update(kpi.inputs)

    return _text_response({
        "id": methodology.id,
        "name": methodology.name,
        "version": methodology.version,
        "kpis": kpis,
        "required_inputs": sorted(all_inputs),
        "realization_curve": methodology.realization_curve,
        "confidence_discounts": methodology.confidence_discounts.model_dump(),
    })


# ---------------------------------------------------------------------------
# Helpers (same logic as before, just moved to support new tool format)
# ---------------------------------------------------------------------------

def _company_data_to_dict(company_data: CompanyData) -> dict:
    """Convert CompanyData to a serializable dict."""
    result: dict[str, Any] = {
        "company_name": company_data.company_name,
        "industry": company_data.industry,
        "fields": {},
    }
    for f in dataclass_fields(company_data):
        if f.name in CompanyData._NON_DATA_FIELDS:
            continue
        dp = getattr(company_data, f.name)
        if dp is not None and isinstance(dp, DataPoint):
            result["fields"][f.name] = {
                "value": dp.value,
                "confidence_tier": dp.confidence_tier.value,
                "confidence_score": dp.confidence_score,
            }
    return result


def _dict_to_company_data(d: dict) -> CompanyData:
    """Reconstruct a CompanyData from a serialized dict."""
    company_data = CompanyData(
        company_name=d.get("company_name", "Unknown"),
        industry=d.get("industry", "unknown"),
    )
    fields_dict = d.get("fields", {})
    for field_name, field_data in fields_dict.items():
        if hasattr(company_data, field_name):
            tier_value = field_data.get("confidence_tier", "estimated")
            dp = DataPoint(
                value=field_data["value"],
                confidence_tier=DataSourceTier(tier_value),
                confidence_score=field_data.get("confidence_score", 0.5),
                source=SourceAttribution(
                    source_type=DataSourceType.MANUAL_OVERRIDE,
                    source_label="Reconstructed from agent tool response",
                ),
            )
            setattr(company_data, field_name, dp)
    return company_data


def _calculation_result_to_dict(result: CalculationResult) -> dict:
    """Convert CalculationResult to a serializable dict."""
    scenarios: dict[str, Any] = {}
    for scenario, sr in result.scenarios.items():
        kpi_results = []
        for entry in sr.kpi_results:
            kpi_results.append({
                "kpi_id": entry.kpi_id,
                "kpi_label": entry.kpi_label,
                "formula_description": entry.formula_description,
                "inputs_used": entry.inputs_used,
                "raw_impact": entry.raw_impact,
                "adjusted_impact": entry.adjusted_impact,
                "weighted_impact": entry.weighted_impact,
                "weight": entry.weight,
                "confidence_discount": entry.confidence_discount,
                "category": entry.category,
                "skipped": entry.skipped,
                "skip_reason": entry.skip_reason,
            })

        year_projections = [
            {
                "year": yp.year,
                "realization_percentage": yp.realization_percentage,
                "projected_impact": yp.projected_impact,
                "cumulative_impact": yp.cumulative_impact,
            }
            for yp in sr.year_projections
        ]

        scenarios[scenario.value] = {
            "scenario": scenario.value,
            "total_annual_impact": sr.total_annual_impact,
            "total_annual_impact_unweighted": sr.total_annual_impact_unweighted,
            "impact_by_category": sr.impact_by_category,
            "year_projections": year_projections,
            "cumulative_3yr_impact": sr.cumulative_3yr_impact,
            "roi_percentage": sr.roi_percentage,
            "roi_multiple": sr.roi_multiple,
            "engagement_cost": sr.engagement_cost,
            "kpi_results": kpi_results,
            "skipped_kpis": sr.skipped_kpis,
        }

    return {
        "company_name": result.company_name,
        "industry": result.industry,
        "methodology_id": result.methodology_id,
        "methodology_version": result.methodology_version,
        "scenarios": scenarios,
        "data_completeness": result.data_completeness,
        "missing_inputs": result.missing_inputs,
        "available_inputs": result.available_inputs,
        "warnings": result.warnings,
    }
