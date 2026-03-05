import type { DriverCategory } from "./types";

export interface KPIDefinition {
  id: string;
  label: string;
  requiredInputs: string[];
  benchmarkInput: string;
  formula: (inputs: Record<string, number>) => number;
  category: string;
  driverCategory: DriverCategory;
}

/** Industry-specific referral rates for the NPS referral-economics model */
export const INDUSTRY_REFERRAL_DEFAULTS: Record<string, number> = {
  "ecommerce-retail": 0.15,
  "travel-hospitality": 0.08,
  "saas-tech": 0.12,
  "financial-services": 0.10,
  healthcare: 0.06,
  telecom: 0.07,
  insurance: 0.06,
  media: 0.10,
  cpg: 0.12,
  automotive: 0.08,
  edtech: 0.10,
  manufacturing: 0.05,
  energy: 0.04,
  government: 0.03,
};

export const DEFAULT_REFERRAL_CONVERSION_RATE = 0.10;

export const KPI_REGISTRY: Record<string, KPIDefinition> = {
  conversion_rate_lift: {
    id: "conversion_rate_lift",
    label: "Conversion Rate Improvement",
    requiredInputs: ["online_revenue"],
    benchmarkInput: "lift_percentage",
    formula: ({ online_revenue, lift_percentage }) => online_revenue * lift_percentage,
    category: "revenue",
    driverCategory: "offensive",
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
    driverCategory: "offensive",
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
    driverCategory: "defensive",
  },
  support_cost_savings: {
    id: "support_cost_savings",
    label: "Support Cost Savings",
    requiredInputs: ["current_support_contacts", "cost_per_contact"],
    benchmarkInput: "reduction_percentage",
    formula: ({ current_support_contacts, cost_per_contact, reduction_percentage }) =>
      current_support_contacts * reduction_percentage * cost_per_contact,
    category: "cost_savings",
    driverCategory: "efficiency",
  },
  nps_referral_revenue: {
    id: "nps_referral_revenue",
    label: "NPS-Linked Referral Revenue",
    requiredInputs: ["customer_count", "revenue_per_customer"],
    benchmarkInput: "nps_point_improvement",
    formula: ({ customer_count, revenue_per_customer, nps_point_improvement,
                referral_rate, referral_conversion_rate }) => {
      const rate = referral_rate ?? 0.12;
      const convRate = referral_conversion_rate ?? 0.10;
      return customer_count * rate * (nps_point_improvement / 10)
             * revenue_per_customer * 0.8 * convRate;
    },
    category: "revenue",
    driverCategory: "offensive",
  },
  repeat_purchase_uplift: {
    id: "repeat_purchase_uplift",
    label: "Repeat Purchase / Visit Frequency Uplift",
    requiredInputs: ["customer_count", "revenue_per_customer", "repeat_purchase_rate"],
    benchmarkInput: "frequency_lift_percentage",
    formula: ({ customer_count, revenue_per_customer, repeat_purchase_rate, frequency_lift_percentage }) => {
      // Additional revenue from increased purchase frequency
      // current repeat revenue = customer_count * revenue_per_customer * repeat_purchase_rate
      // lift = that base * frequency_lift_percentage
      return customer_count * revenue_per_customer * repeat_purchase_rate * frequency_lift_percentage;
    },
    category: "revenue",
    driverCategory: "offensive",
  },
};
