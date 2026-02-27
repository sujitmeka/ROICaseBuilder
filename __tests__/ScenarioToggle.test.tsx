import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScenarioToggle } from "@/components/results/ScenarioToggle";
import { useCaseStore } from "@/stores/case-store";
import { describe, it, expect, beforeEach } from "vitest";

describe("ScenarioToggle", () => {
  beforeEach(() => {
    useCaseStore.setState({ activeScenario: "moderate" });
  });

  it("renders all three scenario options", () => {
    render(<ScenarioToggle />);
    expect(screen.getByText("Conservative")).toBeInTheDocument();
    expect(screen.getByText("Moderate")).toBeInTheDocument();
    expect(screen.getByText("Aggressive")).toBeInTheDocument();
  });

  it("marks active scenario as checked", () => {
    render(<ScenarioToggle />);
    expect(
      screen.getByText("Moderate").closest("button")
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByText("Conservative").closest("button")
    ).toHaveAttribute("aria-checked", "false");
  });

  it("updates store on click", async () => {
    render(<ScenarioToggle />);
    await userEvent.click(screen.getByText("Conservative"));
    expect(useCaseStore.getState().activeScenario).toBe("conservative");
  });
});
