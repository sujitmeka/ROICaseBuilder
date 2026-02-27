"""Tool functions that wrap existing providers and engine for agent use.

Each function accepts and returns plain dicts (JSON-serializable) so they
can be called by the Claude Agents SDK.
"""

from __future__ import annotations

from dataclasses import fields as dataclass_fields
from typing import Any

from backend.engine.calculator import CalculationEngine
from backend.engine.result import CalculationResult
from backend.methodology.loader import load_methodology, get_default_methodology
from backend.methodology.schema import MethodologyConfig
from backend.models.audit import DataPoint, SourceAttribution
from backend.models.company_data import CompanyData
from backend.models.enums import DataSourceTier, DataSourceType, Scenario
from backend.providers.firecrawl_provider import FirecrawlProvider
from backend.providers.valyu_provider import ValyuProvider
from backend.providers.websearch_provider import WebSearchProvider


async def fetch_public_financials(company_name: str, industry: str) -> dict:
    """Fetch public company financials via ValyuProvider.

    Returns a dict of field_name -> value for populated fields.
    """
    provider = ValyuProvider()
    company_data = await provider.fetch(company_name, industry)
    return _company_data_to_dict(company_data)


async def scrape_private_company(company_name: str, industry: str) -> dict:
    """Scrape private company data via FirecrawlProvider.

    Returns a dict of field_name -> value for populated fields.
    """
    provider = FirecrawlProvider()
    company_data = await provider.fetch(company_name, industry)
    return _company_data_to_dict(company_data)


async def search_benchmarks(industry: str, fields: list[str] | None = None) -> dict:
    """Search for industry benchmark data via WebSearchProvider.

    Returns a dict of field_name -> value for benchmark fields found.
    """
    provider = WebSearchProvider()
    # WebSearchProvider.fetch requires company_name but uses industry for benchmarks
    company_data = await provider.fetch(company_name="", industry=industry)
    result = _company_data_to_dict(company_data)
    if fields:
        result["fields"] = {k: result["fields"][k] for k in fields if k in result["fields"]}
    return result


def run_roi_calculation(company_data_dict: dict, service_type: str) -> dict:
    """Run ROI calculation using CalculationEngine.

    Args:
        company_data_dict: Dict with company_name, industry, and fields.
        service_type: Service type to load methodology config for.

    Returns:
        Dict with scenarios, data_completeness, missing_inputs, etc.
    """
    company_data = _dict_to_company_data(company_data_dict)
    methodology = _load_methodology_for_service(service_type)
    engine = CalculationEngine()
    result = engine.calculate(company_data, methodology)
    return _calculation_result_to_dict(result)


def generate_narrative(calculation_result_dict: dict, company_data_dict: dict) -> str:
    """Generate an SCR narrative from calculation results.

    Placeholder implementation — returns a template narrative.
    Full implementation will use Claude to generate the narrative.
    """
    company_name = company_data_dict.get("company_name", "the company")
    scenarios = calculation_result_dict.get("scenarios", {})

    moderate = scenarios.get("moderate", {})
    total_impact = moderate.get("total_annual_impact", 0)
    roi_pct = moderate.get("roi_percentage")

    roi_line = f" ({roi_pct:.0f}% ROI)" if roi_pct else ""

    return (
        f"## ROI Analysis for {company_name}\n\n"
        f"**Situation**: {company_name} operates in a competitive market where "
        f"customer experience is a key differentiator.\n\n"
        f"**Complication**: Without investment in experience transformation, "
        f"the company risks losing market share and revenue.\n\n"
        f"**Resolution**: Our analysis projects a moderate-scenario annual impact "
        f"of ${total_impact:,.0f}{roi_line} through targeted experience improvements."
    )


def store_case(case_id: str, result: dict) -> dict:
    """Store a case result to persistent storage.

    Placeholder — will be replaced with Supabase integration.
    """
    return {
        "case_id": case_id,
        "status": "stored",
        "stored": True,
    }


def load_methodology_config(service_type: str) -> dict:
    """Load methodology configuration for a given service type.

    Returns the methodology config as a serializable dict.
    """
    methodology = _load_methodology_for_service(service_type)
    return methodology.model_dump()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _load_methodology_for_service(service_type: str) -> MethodologyConfig:
    """Load the methodology config matching a service type."""
    # Currently only one methodology; extend with a lookup when more are added
    return get_default_methodology()


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
                    source_label="Reconstructed from agent tool dict",
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
