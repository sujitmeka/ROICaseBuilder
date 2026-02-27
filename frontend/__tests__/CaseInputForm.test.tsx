import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CaseInputForm } from "@/components/input-form/CaseInputForm";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("CaseInputForm", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it("renders all three input fields", () => {
    render(<CaseInputForm />);
    expect(screen.getByLabelText(/company name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/industry vertical/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/service type/i)).toBeInTheDocument();
  });

  it("shows validation error when company name is empty on submit", async () => {
    render(<CaseInputForm />);
    await userEvent.click(screen.getByRole("button", { name: /generate/i }));
    await waitFor(() => {
      expect(screen.getByText(/company name is required/i)).toBeInTheDocument();
    });
  });

  it("shows validation error when industry is not selected", async () => {
    render(<CaseInputForm />);
    // Fill in company name using fireEvent to bypass controlled-input timing
    const input = screen.getByPlaceholderText(/nike/i);
    fireEvent.change(input, { target: { value: "Nike" } });
    // Submit without selecting industry
    await userEvent.click(screen.getByRole("button", { name: /generate/i }));
    await waitFor(
      () => {
        expect(
          screen.getByText(/please select an industry/i)
        ).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it("disables submit button while submitting", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {})
    );
    render(<CaseInputForm />);
    const button = screen.getByRole("button", { name: /generate/i });
    expect(button).not.toBeDisabled();
  });

  it("defaults service type to Experience Transformation & Design", () => {
    render(<CaseInputForm />);
    expect(
      screen.getByText(/experience transformation/i)
    ).toBeInTheDocument();
  });
});
