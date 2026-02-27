import { render, screen } from "@testing-library/react";
import { HeroMetricBar } from "@/components/results/HeroMetricBar";
import { describe, it, expect } from "vitest";

describe("HeroMetricBar", () => {
  const defaultProps = {
    totalImpact: 89900000,
    roi: 4395,
    roiMultiple: 44.0,
    threeYearCumulative: 179800000,
    scenario: "moderate" as const,
  };

  it("renders all four metric cards", () => {
    render(<HeroMetricBar {...defaultProps} />);
    expect(screen.getByText("Annual Impact")).toBeInTheDocument();
    expect(screen.getByText("ROI")).toBeInTheDocument();
    expect(screen.getByText("ROI Multiple")).toBeInTheDocument();
    expect(screen.getByText("3-Year Cumulative")).toBeInTheDocument();
  });

  it("formats large currency values correctly", () => {
    render(<HeroMetricBar {...defaultProps} />);
    expect(screen.getByText("$89.9M")).toBeInTheDocument();
    expect(screen.getByText("44.0x")).toBeInTheDocument();
  });

  it("has aria-label for screen readers", () => {
    render(<HeroMetricBar {...defaultProps} />);
    expect(screen.getByRole("region")).toHaveAttribute(
      "aria-label",
      "Key ROI metrics"
    );
  });
});
