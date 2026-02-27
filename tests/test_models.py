"""Tests for DataPoint, SourceAttribution, and CompanyData models."""

import pytest
from backend.models.audit import DataPoint, SourceAttribution
from backend.models.company_data import CompanyData
from backend.models.enums import DataSourceTier, DataSourceType


class TestDataPoint:
    def test_confidence_multiplier_company_reported(self):
        dp = DataPoint(
            value=51_200_000_000,
            confidence_tier=DataSourceTier.COMPANY_REPORTED,
            confidence_score=0.95,
            source=SourceAttribution(source_type=DataSourceType.VALYU_SEC_FILING),
        )
        assert dp.confidence_multiplier == 1.0

    def test_confidence_multiplier_industry_benchmark(self):
        dp = DataPoint(
            value=0.025,
            confidence_tier=DataSourceTier.INDUSTRY_BENCHMARK,
            confidence_score=0.80,
            source=SourceAttribution(source_type=DataSourceType.WEBSEARCH_BENCHMARK),
        )
        assert dp.confidence_multiplier == 0.8

    def test_confidence_multiplier_cross_industry(self):
        dp = DataPoint(
            value=0.15,
            confidence_tier=DataSourceTier.CROSS_INDUSTRY,
            confidence_score=0.60,
            source=SourceAttribution(source_type=DataSourceType.WEBSEARCH_INDUSTRY_REPORT),
        )
        assert dp.confidence_multiplier == 0.6

    def test_confidence_multiplier_estimated(self):
        dp = DataPoint(
            value=200_000,
            confidence_tier=DataSourceTier.ESTIMATED,
            confidence_score=0.40,
            source=SourceAttribution(source_type=DataSourceType.FIRECRAWL_CRUNCHBASE),
        )
        assert dp.confidence_multiplier == 0.4


class TestCompanyData:
    def test_completeness_score_empty(self):
        cd = CompanyData(company_name="Test Corp", industry="retail")
        assert cd.completeness_score() == 0.0

    def test_completeness_score_partial(self):
        cd = CompanyData(
            company_name="Test Corp",
            industry="retail",
            annual_revenue=DataPoint(
                value=1_000_000,
                confidence_tier=DataSourceTier.COMPANY_REPORTED,
                confidence_score=0.95,
                source=SourceAttribution(source_type=DataSourceType.VALYU_SEC_FILING),
            ),
        )
        assert cd.completeness_score() > 0.0

    def test_available_fields_empty(self):
        cd = CompanyData(company_name="Test", industry="retail")
        assert cd.available_fields() == []

    def test_available_fields_partial(self):
        cd = CompanyData(
            company_name="Test",
            industry="retail",
            annual_revenue=DataPoint(
                value=1_000_000,
                confidence_tier=DataSourceTier.COMPANY_REPORTED,
                confidence_score=0.95,
                source=SourceAttribution(source_type=DataSourceType.VALYU_SEC_FILING),
            ),
        )
        assert "annual_revenue" in cd.available_fields()

    def test_get_existing_field(self):
        dp = DataPoint(
            value=1_000_000,
            confidence_tier=DataSourceTier.COMPANY_REPORTED,
            confidence_score=0.95,
            source=SourceAttribution(source_type=DataSourceType.VALYU_SEC_FILING),
        )
        cd = CompanyData(company_name="Test", industry="retail", annual_revenue=dp)
        assert cd.get("annual_revenue") == dp

    def test_get_missing_field(self):
        cd = CompanyData(company_name="Test", industry="retail")
        assert cd.get("annual_revenue") is None
