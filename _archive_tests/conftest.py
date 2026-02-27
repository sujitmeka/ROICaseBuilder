"""Shared test fixtures for the CPROI test suite."""

import pytest

from backend.models.company_data import CompanyData
from backend.models.audit import DataPoint, SourceAttribution
from backend.models.enums import DataSourceTier, DataSourceType


def make_dp(value, tier=DataSourceTier.COMPANY_REPORTED, score=0.95):
    """Helper to create a DataPoint with minimal boilerplate."""
    return DataPoint(
        value=value,
        confidence_tier=tier,
        confidence_score=score,
        source=SourceAttribution(source_type=DataSourceType.VALYU_SEC_FILING),
    )


@pytest.fixture
def retailer_500m() -> CompanyData:
    """$500M retailer — the reference calculation from KPI research.

    All values match the worked example in:
    research/roi-methodology-kpi-research.md lines 339-433
    """
    return CompanyData(
        company_name="Acme Retail Corp",
        industry="retail",
        annual_revenue=make_dp(500_000_000),
        online_revenue=make_dp(200_000_000),
        current_conversion_rate=make_dp(0.025, DataSourceTier.INDUSTRY_BENCHMARK, 0.80),
        current_aov=make_dp(160.0, DataSourceTier.ESTIMATED, 0.50),
        order_volume=make_dp(1_250_000, DataSourceTier.ESTIMATED, 0.50),
        current_churn_rate=make_dp(0.25, DataSourceTier.INDUSTRY_BENCHMARK, 0.75),
        customer_count=make_dp(1_250_000, DataSourceTier.ESTIMATED, 0.50),
        revenue_per_customer=make_dp(400.0, DataSourceTier.ESTIMATED, 0.50),
        current_support_contacts=make_dp(2_000_000, DataSourceTier.ESTIMATED, 0.40),
        cost_per_contact=make_dp(8.0, DataSourceTier.INDUSTRY_BENCHMARK, 0.75),
        current_nps=make_dp(55, DataSourceTier.INDUSTRY_BENCHMARK, 0.75),
        engagement_cost=make_dp(2_000_000),
    )


@pytest.fixture
def nike_data() -> CompanyData:
    """Nike-like inputs for regression testing."""
    return CompanyData(
        company_name="Nike",
        industry="retail",
        annual_revenue=make_dp(51_200_000_000),
        online_revenue=make_dp(21_500_000_000),
        current_conversion_rate=make_dp(0.025, DataSourceTier.INDUSTRY_BENCHMARK, 0.80),
        current_aov=make_dp(160, DataSourceTier.ESTIMATED, 0.50),
        order_volume=make_dp(50_000_000, DataSourceTier.ESTIMATED, 0.50),
        current_churn_rate=make_dp(0.25, DataSourceTier.INDUSTRY_BENCHMARK, 0.75),
        customer_count=make_dp(1_250_000, DataSourceTier.ESTIMATED, 0.50),
        revenue_per_customer=make_dp(400, DataSourceTier.ESTIMATED, 0.50),
        current_support_contacts=make_dp(2_000_000, DataSourceTier.ESTIMATED, 0.40),
        cost_per_contact=make_dp(8, DataSourceTier.INDUSTRY_BENCHMARK, 0.75),
        current_nps=make_dp(55, DataSourceTier.INDUSTRY_BENCHMARK, 0.75),
        engagement_cost=make_dp(2_000_000),
    )


@pytest.fixture
def minimal_company_data() -> CompanyData:
    """Company data with only revenue — most KPIs will be skipped."""
    return CompanyData(
        company_name="Minimal Corp",
        industry="saas",
        annual_revenue=make_dp(50_000_000, DataSourceTier.ESTIMATED, 0.40),
    )
