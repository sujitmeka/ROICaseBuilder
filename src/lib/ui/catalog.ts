import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

export const catalog = defineCatalog(schema, {
  actions: {},
  components: {
    ROIStatement: {
      props: z.object({
        companyName: z.string(),
        serviceType: z.string(),
        investment: z.string(),
        annualImpact: z.string(),
        roiMultiple: z.string(),
        threeYearCumulative: z.string(),
      }),
      slots: [],
      description:
        "The hero ROI statement. Always exactly one at the top. Shows the key investment-to-return sentence.",
    },

    MetricCard: {
      props: z.object({
        label: z.string(),
        impactValue: z.string(),
        currentValue: z.nullable(z.string()),
        targetValue: z.nullable(z.string()),
        source: z.string(),
        sourceUrl: z.nullable(z.string()),
        confidence: z.enum(["high", "medium", "low"]),
        weight: z.string(),
        dataClass: z.enum(["company", "benchmark", "estimated"]),
      }),
      slots: [],
      description:
        "A single KPI impact card showing the metric name, dollar impact, source, confidence level, and data classification.",
    },

    NarrativeBlock: {
      props: z.object({
        heading: z.string(),
        body: z.string(),
      }),
      slots: [],
      description:
        "A brief narrative text block. Use for executive summary or contextual framing. Keep body to 2-3 sentences maximum.",
    },

    ProjectionRow: {
      props: z.object({
        year: z.number(),
        impact: z.string(),
        cumulative: z.string(),
        realizationPercent: z.string(),
      }),
      slots: [],
      description:
        "A single year projection entry. Generate exactly 3, one for each year of the 3-year outlook.",
    },

    ConfidenceNote: {
      props: z.object({
        message: z.string(),
        severity: z.enum(["info", "warning"]),
      }),
      slots: [],
      description:
        "A callout noting data quality or confidence issues. Use for medium/low confidence data points.",
    },

    SkippedKPI: {
      props: z.object({
        label: z.string(),
        reason: z.string(),
      }),
      slots: [],
      description:
        "A dimmed entry for KPIs that were skipped due to insufficient data.",
    },
  },
});
