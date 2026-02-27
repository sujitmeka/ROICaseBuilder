import { render, screen } from "@testing-library/react";
import { PipelineStep } from "@/components/streaming/PipelineStep";
import { describe, it, expect } from "vitest";

describe("PipelineStep", () => {
  const baseStep = {
    id: "identify-company",
    label: "Identifying company",
    status: "pending" as const,
  };

  it("renders step label", () => {
    render(<PipelineStep step={baseStep} isLast={false} />);
    expect(screen.getByText("Identifying company")).toBeInTheDocument();
  });

  it("shows muted text for pending steps", () => {
    render(<PipelineStep step={baseStep} isLast={false} />);
    const label = screen.getByText("Identifying company");
    expect(label.className).toContain("muted");
  });

  it("shows spinner for active steps", () => {
    const activeStep = { ...baseStep, status: "active" as const };
    render(<PipelineStep step={activeStep} isLast={false} />);
    const stepElement = screen.getByRole("listitem");
    expect(stepElement.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows check icon for completed steps", () => {
    const completeStep = { ...baseStep, status: "completed" as const };
    render(<PipelineStep step={completeStep} isLast={false} />);
    const stepElement = screen.getByRole("listitem");
    expect(stepElement.querySelector(".text-green-600")).toBeInTheDocument();
  });

  it("shows error message for error steps", () => {
    const errorStep = {
      ...baseStep,
      status: "error" as const,
      message: "Failed to fetch financial data",
    };
    render(<PipelineStep step={errorStep} isLast={false} />);
    expect(
      screen.getByText("Failed to fetch financial data")
    ).toBeInTheDocument();
  });
});
