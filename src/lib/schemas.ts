import { z } from "zod";

export const INDUSTRY_VERTICALS = [
  "ecommerce-retail",
  "saas-tech",
  "financial-services",
  "healthcare",
  "travel-hospitality",
  "telecom",
  "insurance",
  "media",
  "cpg",
  "automotive",
  "edtech",
  "manufacturing",
  "energy",
  "government",
] as const;

export const INDUSTRY_LABELS: Record<
  (typeof INDUSTRY_VERTICALS)[number],
  string
> = {
  "ecommerce-retail": "E-commerce & Retail",
  "saas-tech": "SaaS & Tech",
  "financial-services": "Financial Services",
  healthcare: "Healthcare",
  "travel-hospitality": "Travel & Hospitality",
  telecom: "Telecom",
  insurance: "Insurance",
  media: "Media",
  cpg: "CPG",
  automotive: "Automotive",
  edtech: "EdTech",
  manufacturing: "Manufacturing",
  energy: "Energy",
  government: "Government",
};

export const SERVICE_TYPES = ["experience-transformation-design"] as const;

export const SERVICE_TYPE_LABELS: Record<
  (typeof SERVICE_TYPES)[number],
  string
> = {
  "experience-transformation-design": "Experience Transformation & Design",
};

export const COMPANY_TYPES = ["public", "private"] as const;

export const COMPANY_TYPE_LABELS: Record<
  (typeof COMPANY_TYPES)[number],
  string
> = {
  public: "Public",
  private: "Private",
};

export const caseInputSchema = z.object({
  companyName: z
    .string()
    .min(1, "Company name is required")
    .max(200, "Company name is too long"),
  industryVertical: z.enum(INDUSTRY_VERTICALS, {
    message: "Please select an industry vertical",
  }),
  companyType: z.enum(COMPANY_TYPES, {
    message: "Please select whether the company is public or private",
  }),
  estimatedProjectCost: z
    .number({ message: "Please enter the estimated project cost" })
    .positive("Project cost must be greater than zero"),
  serviceType: z.enum(SERVICE_TYPES),
});

export type CaseInput = z.infer<typeof caseInputSchema>;
