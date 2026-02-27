from __future__ import annotations

from dataclasses import dataclass, fields
from typing import Optional

from .audit import DataPoint


@dataclass
class CompanyData:
    """Unified data object flowing through the entire CPROI pipeline.

    Every field that holds a value uses DataPoint, which includes
    confidence scoring and full source attribution.
    """

    company_name: str
    industry: str

    # Revenue & financials
    annual_revenue: Optional[DataPoint] = None
    online_revenue: Optional[DataPoint] = None
    revenue_growth_yoy: Optional[DataPoint] = None
    gross_margin: Optional[DataPoint] = None
    operating_margin: Optional[DataPoint] = None
    net_income: Optional[DataPoint] = None

    # Customer & experience metrics
    current_conversion_rate: Optional[DataPoint] = None
    current_aov: Optional[DataPoint] = None
    order_volume: Optional[DataPoint] = None
    current_churn_rate: Optional[DataPoint] = None
    customer_count: Optional[DataPoint] = None
    revenue_per_customer: Optional[DataPoint] = None
    current_support_contacts: Optional[DataPoint] = None
    cost_per_contact: Optional[DataPoint] = None
    current_nps: Optional[DataPoint] = None
    customer_lifetime_value: Optional[DataPoint] = None

    # Engagement cost
    engagement_cost: Optional[DataPoint] = None

    # Private company specifics
    total_funding: Optional[DataPoint] = None
    estimated_valuation: Optional[DataPoint] = None

    _NON_DATA_FIELDS = {"company_name", "industry"}

    def get(self, field_name: str) -> Optional[DataPoint]:
        """Retrieve a DataPoint by field name, returning None if missing."""
        return getattr(self, field_name, None)

    def available_fields(self) -> list[str]:
        """Return names of all fields that have non-None DataPoints."""
        return [
            f.name
            for f in fields(self)
            if f.name not in self._NON_DATA_FIELDS and getattr(self, f.name) is not None
        ]

    def completeness_score(self) -> float:
        """Returns 0.0-1.0 indicating how many data fields are populated."""
        data_fields = [f for f in fields(self) if f.name not in self._NON_DATA_FIELDS]
        if not data_fields:
            return 0.0
        filled = sum(1 for f in data_fields if getattr(self, f.name) is not None)
        return filled / len(data_fields)
