from enum import Enum


class Industry(str, Enum):
    ECOMMERCE = "ecommerce"
    RETAIL = "retail"
    SAAS = "saas"
    FINANCIAL_SERVICES = "financial_services"
    HEALTHCARE = "healthcare"
    TRAVEL_HOSPITALITY = "travel_hospitality"
    TELECOM = "telecom"
    INSURANCE = "insurance"
    MEDIA = "media"
    CPG = "cpg"


class ServiceType(str, Enum):
    EXPERIENCE_TRANSFORMATION_DESIGN = "experience-transformation-design"


class Scenario(str, Enum):
    CONSERVATIVE = "conservative"
    MODERATE = "moderate"
    AGGRESSIVE = "aggressive"


class DataSourceTier(str, Enum):
    COMPANY_REPORTED = "company_reported"
    INDUSTRY_BENCHMARK = "industry_benchmark"
    CROSS_INDUSTRY = "cross_industry"
    ESTIMATED = "estimated"


class DataSourceType(str, Enum):
    VALYU_SEC_FILING = "valyu_sec_filing"
    VALYU_FINANCIAL_METRICS = "valyu_financial_metrics"
    VALYU_EARNINGS = "valyu_earnings"
    VALYU_INCOME_STATEMENT = "valyu_income_statement"
    VALYU_BALANCE_SHEET = "valyu_balance_sheet"
    FIRECRAWL_CRUNCHBASE = "firecrawl_crunchbase"
    FIRECRAWL_PITCHBOOK = "firecrawl_pitchbook"
    WEBSEARCH_BENCHMARK = "websearch_benchmark"
    WEBSEARCH_INDUSTRY_REPORT = "websearch_industry_report"
    MANUAL_OVERRIDE = "manual_override"


class CompanyType(str, Enum):
    PUBLIC = "public"
    PRIVATE = "private"
    UNKNOWN = "unknown"


class DataFreshness(str, Enum):
    GREEN = "green"
    YELLOW = "yellow"
    RED = "red"


class FramingType(str, Enum):
    REVENUE_AT_RISK = "revenue_at_risk"
    REVENUE_OPPORTUNITY = "revenue_opportunity"
