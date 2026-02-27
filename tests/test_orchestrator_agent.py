"""Tests for orchestrator agent wiring, subagent definitions, and custom tools."""

import pytest

from backend.orchestrator.system_prompt import ORCHESTRATOR_SYSTEM_PROMPT
from backend.orchestrator.subagents import (
    FINANCIAL_DATA_SUBAGENT,
    BENCHMARK_RESEARCH_SUBAGENT,
    CALC_NARRATIVE_SUBAGENT,
    get_subagent_definitions,
)
from backend.tools.agent_tools import load_methodology_config, run_roi_calculation
from tests.conftest import make_dp


class TestOrchestratorAgent:
    def test_system_prompt_references_methodology(self):
        """ORCHESTRATOR_SYSTEM_PROMPT contains 'methodology' (case-insensitive)."""
        assert "methodology" in ORCHESTRATOR_SYSTEM_PROMPT.lower()

    def test_three_subagents_defined(self):
        """get_subagent_definitions() returns list of 3."""
        defs = get_subagent_definitions()
        assert isinstance(defs, list)
        assert len(defs) == 3

    def test_financial_subagent_has_valyu_tools(self):
        """Financial subagent's tools list contains 'fetch_public_financials'."""
        assert "fetch_public_financials" in FINANCIAL_DATA_SUBAGENT["tools"]

    def test_benchmark_subagent_has_websearch_tools(self):
        """Benchmark subagent's tools list contains 'search_benchmarks'."""
        assert "search_benchmarks" in BENCHMARK_RESEARCH_SUBAGENT["tools"]

    def test_calc_subagent_has_calculation_tools(self):
        """Calc subagent's tools list contains 'run_roi_calculation'."""
        assert "run_roi_calculation" in CALC_NARRATIVE_SUBAGENT["tools"]

    def test_custom_tools_return_correct_types(self):
        """load_methodology_config returns dict; run_roi_calculation returns dict with 'scenarios'."""
        # Test load_methodology_config
        config = load_methodology_config("experience-transformation-design")
        assert isinstance(config, dict)
        assert "id" in config
        assert "kpis" in config

        # Test run_roi_calculation with mocked data
        from backend.models.enums import DataSourceTier

        company_data_dict = {
            "company_name": "Test Corp",
            "industry": "retail",
            "fields": {
                "annual_revenue": {
                    "value": 500_000_000,
                    "confidence_tier": "company_reported",
                    "confidence_score": 0.95,
                },
                "online_revenue": {
                    "value": 200_000_000,
                    "confidence_tier": "company_reported",
                    "confidence_score": 0.95,
                },
                "current_conversion_rate": {
                    "value": 0.025,
                    "confidence_tier": "industry_benchmark",
                    "confidence_score": 0.80,
                },
                "current_aov": {
                    "value": 160.0,
                    "confidence_tier": "estimated",
                    "confidence_score": 0.50,
                },
                "order_volume": {
                    "value": 1_250_000,
                    "confidence_tier": "estimated",
                    "confidence_score": 0.50,
                },
                "current_churn_rate": {
                    "value": 0.25,
                    "confidence_tier": "industry_benchmark",
                    "confidence_score": 0.75,
                },
                "customer_count": {
                    "value": 1_250_000,
                    "confidence_tier": "estimated",
                    "confidence_score": 0.50,
                },
                "revenue_per_customer": {
                    "value": 400.0,
                    "confidence_tier": "estimated",
                    "confidence_score": 0.50,
                },
                "current_support_contacts": {
                    "value": 2_000_000,
                    "confidence_tier": "estimated",
                    "confidence_score": 0.40,
                },
                "cost_per_contact": {
                    "value": 8.0,
                    "confidence_tier": "industry_benchmark",
                    "confidence_score": 0.75,
                },
                "current_nps": {
                    "value": 55,
                    "confidence_tier": "industry_benchmark",
                    "confidence_score": 0.75,
                },
                "engagement_cost": {
                    "value": 2_000_000,
                    "confidence_tier": "company_reported",
                    "confidence_score": 0.95,
                },
            },
        }
        result = run_roi_calculation(company_data_dict, "experience-transformation-design")
        assert isinstance(result, dict)
        assert "scenarios" in result
        assert "conservative" in result["scenarios"]
        assert "moderate" in result["scenarios"]
        assert "aggressive" in result["scenarios"]
