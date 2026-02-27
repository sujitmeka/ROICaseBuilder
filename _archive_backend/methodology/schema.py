"""Pydantic models for methodology configuration validation."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator


class BenchmarkRanges(BaseModel):
    """Scenario-specific benchmark values for a KPI."""

    conservative: float = Field(ge=0, description="Lower-bound benchmark multiplier")
    moderate: float = Field(ge=0, description="Median benchmark multiplier")
    aggressive: float = Field(ge=0, description="Upper-bound benchmark multiplier")

    @model_validator(mode="after")
    def conservative_le_moderate_le_aggressive(self) -> BenchmarkRanges:
        if not (self.conservative <= self.moderate <= self.aggressive):
            raise ValueError(
                f"Benchmark ranges must be ordered: conservative ({self.conservative}) "
                f"<= moderate ({self.moderate}) <= aggressive ({self.aggressive})"
            )
        return self


class KPIConfig(BaseModel):
    """Configuration for a single KPI within a methodology."""

    id: str = Field(description="Must match a registered KPI in the library")
    label: Optional[str] = Field(default=None, description="Display label override")
    weight: float = Field(ge=0, le=1.0, description="Relative weight (0-1)")
    formula: str = Field(description="Human-readable formula description")
    inputs: list[str] = Field(description="CompanyData field names required")
    benchmark_ranges: BenchmarkRanges
    benchmark_source: str = Field(description="Citation for the benchmark data")
    benchmark_source_url: Optional[str] = None
    enabled: bool = True

    @field_validator("id")
    @classmethod
    def id_must_be_registered(cls, v: str) -> str:
        # Import formulas to ensure registration has happened
        import backend.kpi_library.formulas  # noqa: F401
        from backend.kpi_library.registry import get_kpi

        if get_kpi(v) is None:
            raise ValueError(f"KPI '{v}' is not registered in the KPI library")
        return v


class ConfidenceDiscounts(BaseModel):
    """Multipliers applied based on data source quality tier."""

    company_reported: float = Field(default=1.0, ge=0, le=1.0)
    industry_benchmark: float = Field(default=0.8, ge=0, le=1.0)
    cross_industry: float = Field(default=0.6, ge=0, le=1.0)
    estimated: float = Field(default=0.4, ge=0, le=1.0)

    def get_discount(self, tier_value: str) -> float:
        return getattr(self, tier_value)


class MethodologyConfig(BaseModel):
    """Top-level methodology configuration."""

    id: str
    name: str
    version: str
    applicable_industries: list[str]
    service_type: str
    kpis: list[KPIConfig] = Field(min_length=1)
    realization_curve: list[float] = Field(
        min_length=1,
        description="Year-over-year realization percentages",
    )
    confidence_discounts: ConfidenceDiscounts = Field(
        default_factory=ConfidenceDiscounts
    )
    enabled: bool = True

    @field_validator("realization_curve")
    @classmethod
    def curve_values_valid(cls, v: list[float]) -> list[float]:
        for i, pct in enumerate(v):
            if not (0 < pct <= 1.0):
                raise ValueError(
                    f"realization_curve[{i}] must be between 0 (exclusive) and 1.0, got {pct}"
                )
        for i in range(1, len(v)):
            if v[i] < v[i - 1]:
                raise ValueError(
                    f"realization_curve must be non-decreasing: "
                    f"year {i} ({v[i-1]}) > year {i+1} ({v[i]})"
                )
        return v

    @model_validator(mode="after")
    def kpi_weights_sum_to_one(self) -> MethodologyConfig:
        enabled_kpis = [k for k in self.kpis if k.enabled]
        total_weight = sum(k.weight for k in enabled_kpis)
        if enabled_kpis and abs(total_weight - 1.0) > 0.01:
            raise ValueError(
                f"Enabled KPI weights must sum to ~1.0, got {total_weight:.3f}"
            )
        return self

    def enabled_kpis(self) -> list[KPIConfig]:
        return [k for k in self.kpis if k.enabled]

    def total_weight(self) -> float:
        return sum(k.weight for k in self.enabled_kpis())

    def required_inputs(self) -> set[str]:
        """Return all CompanyData fields required by enabled KPIs."""
        inputs: set[str] = set()
        for kpi in self.enabled_kpis():
            inputs.update(kpi.inputs)
        return inputs
