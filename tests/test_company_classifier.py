"""Tests for company_classifier."""

from backend.models.enums import CompanyType
from backend.orchestrator.company_classifier import classify_company


class TestCompanyClassifier:

    def test_apple_is_public(self):
        assert classify_company("Apple") == CompanyType.PUBLIC

    def test_nike_is_public(self):
        assert classify_company("Nike") == CompanyType.PUBLIC

    def test_unknown_startup_is_private(self):
        assert classify_company("RandomStartupXYZ") == CompanyType.PRIVATE

    def test_ambiguous_returns_unknown(self):
        # "Smith Consulting" has no public indicators -> PRIVATE or UNKNOWN
        result = classify_company("Smith Consulting")
        assert result in (CompanyType.PRIVATE, CompanyType.UNKNOWN)
