import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ContactDialog } from "@/features/contacts/components/ContactDialog";

describe("ContactDialog component", () => {
  it("renders Add Contact dialog with required fields", () => {
    render(
      <ContactDialog
        open={true}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Add Contact" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Phone$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Address/i)).toBeInTheDocument();
  });

  it("submits the form when valid name is entered", async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);
    const handleOpenChange = vi.fn();

    render(
      <ContactDialog
        open={true}
        onOpenChange={handleOpenChange}
        onSubmit={handleSubmit}
      />,
    );

    const nameInput = screen.getByLabelText(/Name/i);
    const phoneInput = screen.getByLabelText(/^Phone$/i);
    const submitBtn = screen.getByRole("button", { name: /Add Contact/i });

    fireEvent.change(nameInput, { target: { value: "Jan Baloch" } });
    fireEvent.change(phoneInput, { target: { value: "03001122334" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Jan Baloch",
          phone: "03001122334",
        }),
      );
    });
  });

  it("shows validation error and prevents submission when name is blank", async () => {
    const handleSubmit = vi.fn();

    render(
      <ContactDialog
        open={true}
        onOpenChange={vi.fn()}
        onSubmit={handleSubmit}
      />,
    );

    const submitBtn = screen.getByRole("button", { name: /Add Contact/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Name is required")).toBeInTheDocument();
    });
    expect(handleSubmit).not.toHaveBeenCalled();
  });
});
