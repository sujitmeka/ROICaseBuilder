"""Classify whether a company is public, private, or unknown."""

from __future__ import annotations

from backend.models.enums import CompanyType

# Well-known public companies (case-insensitive match).
_PUBLIC_COMPANIES = {
    "apple", "microsoft", "google", "alphabet", "amazon", "meta",
    "facebook", "nvidia", "tesla", "netflix", "nike", "walmart",
    "target", "costco", "starbucks", "disney", "coca-cola", "pepsi",
    "pepsico", "johnson & johnson", "procter & gamble", "intel",
    "amd", "ibm", "oracle", "salesforce", "adobe", "spotify",
    "uber", "lyft", "airbnb", "doordash", "paypal", "visa",
    "mastercard", "jpmorgan", "goldman sachs", "bank of america",
    "wells fargo", "citigroup", "morgan stanley", "boeing",
    "lockheed martin", "general motors", "ford", "toyota",
    "honda", "samsung", "sony", "qualcomm", "broadcom",
    "home depot", "lowes", "best buy", "macy's", "nordstrom",
    "gap", "ralph lauren", "under armour", "lululemon",
}

# Suffixes that strongly suggest a public company.
_PUBLIC_SUFFIXES = ("inc.", "inc", "corp.", "corp", "corporation", "plc", "ltd")

# Patterns that suggest a public listing.
_PUBLIC_PATTERNS = ("nyse", "nasdaq", "s&p 500", "dow jones", "listed on")


def classify_company(name: str) -> CompanyType:
    """Classify a company as PUBLIC, PRIVATE, or UNKNOWN.

    Uses a heuristic approach:
    1. Known public companies -> PUBLIC
    2. Corporate suffixes (Inc., Corp.) -> PUBLIC
    3. Unknown -> PRIVATE (default assumption for unlisted companies)
    """
    lower = name.lower().strip()

    # Check known public companies
    for known in _PUBLIC_COMPANIES:
        if known in lower or lower in known:
            return CompanyType.PUBLIC

    # Check suffixes
    for suffix in _PUBLIC_SUFFIXES:
        if lower.endswith(suffix):
            return CompanyType.PUBLIC

    # Check patterns in name
    for pattern in _PUBLIC_PATTERNS:
        if pattern in lower:
            return CompanyType.PUBLIC

    # Default: private for unknown companies
    return CompanyType.PRIVATE
