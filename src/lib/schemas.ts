import { z } from "zod";

export const SERVICE_TYPES = ["experience-transformation-design"] as const;

export const SERVICE_TYPE_LABELS: Record<
  (typeof SERVICE_TYPES)[number],
  string
> = {
  "experience-transformation-design": "Experience Transformation & Design",
};

export const caseInputSchema = z.object({
  companyName: z
    .string()
    .min(1, "Company name is required")
    .max(200, "Company name is too long"),
  estimatedProjectCost: z
    .number({ message: "Please enter the estimated project cost" })
    .positive("Project cost must be greater than zero"),
  serviceType: z.enum(SERVICE_TYPES),
  projectContext: z
    .string()
    .min(1, "Project context is required")
    .max(5000, "Project context must be 5000 characters or fewer"),
  documentContent: z.string().optional(),
});

export type CaseInput = z.infer<typeof caseInputSchema>;
