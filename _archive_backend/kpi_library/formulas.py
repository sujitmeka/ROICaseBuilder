"""V1 KPI formula implementations for Experience Transformation & Design.

Each function is a pure calculation with no side effects. All monetary
values are in the same currency as the input (typically USD).
"""

from backend.kpi_library.registry import register_kpi


@register_kpi(
    kpi_id="conversion_rate_lift",
    label="Conversion Rate Improvement",
    description=(
        "Incremental revenue from higher conversion rates after UX/CX redesign. "
        "Formula: current_online_revenue * lift_percentage."
    ),
    required_inputs=["online_revenue"],
    benchmark_input="lift_percentage",
    unit="currency",
    category="revenue",
)
def calc_conversion_rate_lift(
    online_revenue: float,
    lift_percentage: float,
) -> float:
    """Conv_Revenue_Lift = Current_Online_Revenue x Conversion_Lift_%"""
    if online_revenue < 0:
        raise ValueError("online_revenue cannot be negative")
    if not (0 <= lift_percentage <= 1.0):
        raise ValueError(f"lift_percentage must be 0-1.0, got {lift_percentage}")
    return online_revenue * lift_percentage


@register_kpi(
    kpi_id="aov_increase",
    label="Average Order Value Increase",
    description=(
        "Revenue gained from higher average order values through improved "
        "product discovery, recommendations, and checkout UX. "
        "Formula: order_volume * current_aov * lift_percentage."
    ),
    required_inputs=["order_volume", "current_aov"],
    benchmark_input="lift_percentage",
    unit="currency",
    category="revenue",
)
def calc_aov_increase(
    order_volume: float,
    current_aov: float,
    lift_percentage: float,
) -> float:
    """AOV_Revenue_Lift = order_volume * current_aov * lift_percentage"""
    if order_volume < 0:
        raise ValueError("order_volume cannot be negative")
    if current_aov < 0:
        raise ValueError("current_aov cannot be negative")
    if not (0 <= lift_percentage <= 1.0):
        raise ValueError(f"lift_percentage must be 0-1.0, got {lift_percentage}")
    new_aov = current_aov * (1 + lift_percentage)
    return order_volume * (new_aov - current_aov)


@register_kpi(
    kpi_id="churn_reduction",
    label="Revenue Saved from Churn Reduction",
    description=(
        "Revenue retained by reducing customer churn through improved experience. "
        "Formula: churn_rate * reduction_% * customer_count * revenue_per_customer."
    ),
    required_inputs=["current_churn_rate", "customer_count", "revenue_per_customer"],
    benchmark_input="reduction_percentage",
    unit="currency",
    category="retention",
)
def calc_churn_reduction(
    current_churn_rate: float,
    customer_count: float,
    revenue_per_customer: float,
    reduction_percentage: float,
) -> float:
    """Retention_Revenue = churn_rate * reduction_% * customer_count * rev_per_customer"""
    if current_churn_rate < 0 or current_churn_rate > 1.0:
        raise ValueError(f"current_churn_rate must be 0-1.0, got {current_churn_rate}")
    if customer_count < 0:
        raise ValueError("customer_count cannot be negative")
    if revenue_per_customer < 0:
        raise ValueError("revenue_per_customer cannot be negative")
    if not (0 <= reduction_percentage <= 1.0):
        raise ValueError(
            f"reduction_percentage must be 0-1.0, got {reduction_percentage}"
        )
    customers_at_risk = current_churn_rate * customer_count
    customers_saved = customers_at_risk * reduction_percentage
    return customers_saved * revenue_per_customer


@register_kpi(
    kpi_id="support_cost_savings",
    label="Support Cost Savings",
    description=(
        "Cost savings from reduced support ticket volume after UX improvements. "
        "Formula: support_contacts * ticket_reduction_% * cost_per_contact."
    ),
    required_inputs=["current_support_contacts", "cost_per_contact"],
    benchmark_input="reduction_percentage",
    unit="currency",
    category="cost_savings",
)
def calc_support_cost_savings(
    current_support_contacts: float,
    cost_per_contact: float,
    reduction_percentage: float,
) -> float:
    """Support_Savings = contacts * reduction_% * cost_per_contact"""
    if current_support_contacts < 0:
        raise ValueError("current_support_contacts cannot be negative")
    if cost_per_contact < 0:
        raise ValueError("cost_per_contact cannot be negative")
    if not (0 <= reduction_percentage <= 1.0):
        raise ValueError(
            f"reduction_percentage must be 0-1.0, got {reduction_percentage}"
        )
    return current_support_contacts * reduction_percentage * cost_per_contact


@register_kpi(
    kpi_id="nps_referral_revenue",
    label="NPS-Linked Referral Revenue",
    description=(
        "Revenue growth attributable to NPS improvement via increased referrals. "
        "Formula: company_revenue * (nps_improvement / 7) * 0.01."
    ),
    required_inputs=["annual_revenue"],
    benchmark_input="nps_point_improvement",
    unit="currency",
    category="revenue",
)
def calc_nps_referral_revenue(
    annual_revenue: float,
    nps_point_improvement: float,
) -> float:
    """NPS_Revenue = Company_Revenue x (NPS_Point_Improvement / 7) x 0.01"""
    if annual_revenue < 0:
        raise ValueError("annual_revenue cannot be negative")
    if nps_point_improvement < 0:
        raise ValueError("nps_point_improvement cannot be negative")
    return annual_revenue * (nps_point_improvement / 7.0) * 0.01
