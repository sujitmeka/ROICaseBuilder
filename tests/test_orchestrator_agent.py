"""Tests for orchestrator agent wiring, subagent definitions, and custom tools."""

import json
import pytest

from claude_agent_sdk import AgentDefinition, SdkMcpTool

from backend.orchestrator.system_prompt import ORCHESTRATOR_SYSTEM_PROMPT
from backend.orchestrator.subagents import (
    FINANCIAL_DATA_AGENT,
    BENCHMARK_RESEARCH_AGENT,
    CALC_NARRATIVE_AGENT,
    get_agent_definitions,
)
from backend.tools.agent_tools import run_calculation, load_methodology


class TestOrchestratorAgent:
    def test_system_prompt_references_methodology(self):
        """ORCHESTRATOR_SYSTEM_PROMPT contains 'methodology' (case-insensitive)."""
        assert "methodology" in ORCHESTRATOR_SYSTEM_PROMPT.lower()

    def test_system_prompt_references_tools(self):
        """System prompt should mention the SDK tools."""
        assert "load_methodology" in ORCHESTRATOR_SYSTEM_PROMPT
        assert "fetch_financials" in ORCHESTRATOR_SYSTEM_PROMPT
        assert "WebSearch" in ORCHESTRATOR_SYSTEM_PROMPT
        assert "run_calculation" in ORCHESTRATOR_SYSTEM_PROMPT

    def test_three_agent_definitions(self):
        """get_agent_definitions() returns dict of 3 AgentDefinition objects."""
        defs = get_agent_definitions()
        assert isinstance(defs, dict)
        assert len(defs) == 3
        for name, agent_def in defs.items():
            assert isinstance(agent_def, AgentDefinition)

    def test_financial_agent_has_fetch_tools(self):
        """Financial agent's tools list contains MCP tool names."""
        assert "mcp__cproi__fetch_financials" in FINANCIAL_DATA_AGENT.tools
        assert "mcp__cproi__scrape_company" in FINANCIAL_DATA_AGENT.tools

    def test_benchmark_agent_has_websearch_tools(self):
        """Benchmark agent's tools list contains WebSearch/WebFetch."""
        assert "WebSearch" in BENCHMARK_RESEARCH_AGENT.tools
        assert "WebFetch" in BENCHMARK_RESEARCH_AGENT.tools

    def test_calc_agent_has_calculation_tools(self):
        """Calc agent's tools list contains run_calculation."""
        assert "mcp__cproi__run_calculation" in CALC_NARRATIVE_AGENT.tools

    def test_custom_tools_are_sdk_mcp_tools(self):
        """Tools should be SdkMcpTool instances."""
        assert isinstance(run_calculation, SdkMcpTool)
        assert isinstance(load_methodology, SdkMcpTool)

    @pytest.mark.asyncio
    async def test_load_methodology_returns_valid_config(self):
        """load_methodology returns dict with kpis list."""
        result = await load_methodology.handler({
            "service_type": "experience-transformation-design",
        })
        assert "content" in result
        payload = json.loads(result["content"][0]["text"])
        assert isinstance(payload, dict)
        assert "id" in payload
        assert "kpis" in payload

    @pytest.mark.asyncio
    async def test_run_calculation_returns_scenarios(self):
        """run_calculation returns dict with 3 scenarios."""
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
        result = await run_calculation.handler({
            "company_data": company_data_dict,
            "service_type": "experience-transformation-design",
        })
        assert "content" in result
        payload = json.loads(result["content"][0]["text"])
        assert isinstance(payload, dict)
        assert "scenarios" in payload
        assert "conservative" in payload["scenarios"]
        assert "moderate" in payload["scenarios"]
        assert "aggressive" in payload["scenarios"]
