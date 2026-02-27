import { render, screen } from "@testing-library/react";
import { AuditSidebar } from "@/components/results/AuditSidebar";
import { describe, it, expect } from "vitest";
import type { AuditEntry } from "@/stores/case-store";

describe("AuditSidebar", () => {
  const mockEntries: AuditEntry[] = [
    {
      id: "e1",
      kpiId: "conversion_rate_lift",
      label: "Conversion Rate Lift",
      value: 0.2,
      formattedValue: "20%",
      source: "Baymard Institute 2025",
      confidenceLevel: "medium",
      dataClass: "benchmark",
      citationIndex: 1,
      narrativeSectionId: "the-opportunity",
    },
    {
      id: "e2",
      kpiId: "revenue",
      label: "Annual Revenue",
      value: 51217000000,
      formattedValue: "$51.2B",
      source: "SEC 10-K Filing",
      confidenceLevel: "high",
      dataClass: "company",
      citationIndex: 2,
      narrativeSectionId: "the-context",
    },
  ];

  it("renders all audit entries", () => {
    render(
      <AuditSidebar
        entries={mockEntries}
        activeSectionId={null}
        scenario="moderate"
      />
    );
    expect(screen.getByText("Conversion Rate Lift")).toBeInTheDocument();
    expect(screen.getByText("Annual Revenue")).toBeInTheDocument();
  });

  it("highlights entries matching active section", () => {
    render(
      <AuditSidebar
        entries={mockEntries}
        activeSectionId="the-opportunity"
        scenario="moderate"
      />
    );
    const entry = document.getElementById("audit-entry-e1");
    expect(entry?.className).toContain("ring-1");
  });
});
