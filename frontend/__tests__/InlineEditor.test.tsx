import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InlineEditor } from "@/components/overrides/InlineEditor";
import { useOverrideStore } from "@/stores/override-store";
import { describe, it, expect, beforeEach } from "vitest";

describe("InlineEditor", () => {
  beforeEach(() => {
    useOverrideStore.setState({ overrides: {} });
  });

  const defaultProps = {
    entryId: "entry-1",
    currentValue: 0.2,
    formattedValue: "20%",
    isOverridden: false,
  };

  it("displays formatted value when not editing", () => {
    render(<InlineEditor {...defaultProps} />);
    expect(screen.getByText("20%")).toBeInTheDocument();
  });

  it("enters edit mode when clicked", async () => {
    render(<InlineEditor {...defaultProps} />);
    await userEvent.click(
      screen.getByRole("button", { name: /click to edit/i })
    );
    expect(screen.getByRole("spinbutton")).toBeInTheDocument();
  });

  it("confirms override on Enter", async () => {
    render(<InlineEditor {...defaultProps} />);
    await userEvent.click(
      screen.getByRole("button", { name: /click to edit/i })
    );
    const input = screen.getByRole("spinbutton");
    await userEvent.clear(input);
    await userEvent.type(input, "0.35");
    await userEvent.keyboard("{Enter}");

    expect(useOverrideStore.getState().overrides["entry-1"]).toBeDefined();
    expect(useOverrideStore.getState().overrides["entry-1"].override).toBe(
      0.35
    );
  });

  it("cancels editing on Escape", async () => {
    render(<InlineEditor {...defaultProps} />);
    await userEvent.click(
      screen.getByRole("button", { name: /click to edit/i })
    );
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument();
  });
});
