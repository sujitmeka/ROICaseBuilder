import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompanyAutocomplete } from "@/components/input-form/CompanyAutocomplete";
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("CompanyAutocomplete", () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders input with placeholder", () => {
    render(<CompanyAutocomplete value="" onChange={mockOnChange} />);
    expect(screen.getByPlaceholderText(/nike/i)).toBeInTheDocument();
  });

  it("does not show dropdown for < 2 chars", () => {
    render(<CompanyAutocomplete value="N" onChange={mockOnChange} />);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows suggestions after debounce for 2+ chars", async () => {
    const { rerender } = render(
      <CompanyAutocomplete value="" onChange={mockOnChange} />
    );
    rerender(<CompanyAutocomplete value="Ni" onChange={mockOnChange} />);
    await waitFor(
      () => {
        expect(screen.getByText("Nike")).toBeInTheDocument();
      },
      { timeout: 500 }
    );
  });

  it("has correct ARIA combobox attributes", () => {
    render(<CompanyAutocomplete value="" onChange={mockOnChange} />);
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-haspopup", "listbox");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
  });
});
