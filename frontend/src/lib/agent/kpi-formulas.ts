export interface KPIDefinition {
  id: string;
  label: string;
  requiredInputs: string[];
  benchmarkInput: string;
  formula: (inputs: Record<string, number>) => number;
  category: string;
}

export const KPI_REGISTRY: Record<string, KPIDefinition> = {
  conversion_rate_lift: {
    id: "conversion_rate_lift",
    label: "Conversion Rate Improvement",
    requiredInputs: ["online_revenue"],
    benchmarkInput: "lift_percentage",
    formula: ({ online_revenue, lift_percentage }) => online_revenue * lift_percentage,
    category: "revenue",
  },
  aov_increase: {
    id: "aov_increase",
    label: "Average Order Value Increase",
    requiredInputs: ["order_volume", "current_aov"],
    benchmarkInput: "lift_percentage",
    formula: ({ order_volume, current_aov, lift_percentage }) => {
      const newAov = current_aov * (1 + lift_percentage);
      return order_volume * (newAov - current_aov);
    },
    category: "revenue",
  },
  churn_reduction: {
    id: "churn_reduction",
    label: "Revenue Saved from Churn Reduction",
    requiredInputs: ["current_churn_rate", "customer_count", "revenue_per_customer"],
    benchmarkInput: "reduction_percentage",
    formula: ({ current_churn_rate, customer_count, revenue_per_customer, reduction_percentage }) => {
      const customersAtRisk = current_churn_rate * customer_count;
      const customersSaved = customersAtRisk * reduction_percentage;
      return customersSaved * revenue_per_customer;
    },
    category: "retention",
  },
  support_cost_savings: {
    id: "support_cost_savings",
    label: "Support Cost Savings",
    requiredInputs: ["current_support_contacts", "cost_per_contact"],
    benchmarkInput: "reduction_percentage",
    formula: ({ current_support_contacts, cost_per_contact, reduction_percentage }) =>
      current_support_contacts * reduction_percentage * cost_per_contact,
    category: "cost_savings",
  },
  nps_referral_revenue: {
    id: "nps_referral_revenue",
    label: "NPS-Linked Referral Revenue",
    requiredInputs: ["annual_revenue"],
    benchmarkInput: "nps_point_improvement",
    formula: ({ annual_revenue, nps_point_improvement }) =>
      annual_revenue * (nps_point_improvement / 7.0) * 0.01,
    category: "revenue",
  },
};
