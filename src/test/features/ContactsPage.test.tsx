import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContactsPage } from "@/features/contacts/pages/ContactsPage";
import { useContacts } from "@/features/contacts/hooks/useContacts";

vi.mock("@/features/contacts/hooks/useContacts", () => ({ useContacts: vi.fn() }));

describe("ContactsPage", () => {
  it("searches cards, switches to the table, and confirms archive", () => {
    const archive = vi.fn();
    vi.mocked(useContacts).mockReturnValue({
      contacts: [
        {
          id: "1",
          name: "Ali",
          phone: "03001234567",
          phone2: null,
          address: "Quetta",
          notes: null,
          created_at: "2026-10-01",
          updated_at: "2026-10-01",
          archived: 0,
          custom: "{}",
        },
        {
          id: "2",
          name: "Bilal",
          phone: null,
          phone2: null,
          address: null,
          notes: null,
          created_at: "2026-10-02",
          updated_at: "2026-10-02",
          archived: 0,
          custom: "{}",
        },
      ],
      isLoading: false,
      error: null,
      addContact: vi.fn(),
      editContact: vi.fn(),
      archive,
      refresh: vi.fn(),
    });
    render(<ContactsPage />);
    expect(screen.getByRole("heading", { name: "Ali" })).toBeInTheDocument();
    const filters = screen.getByText("More filters").closest("details");
    expect(filters).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("More filters"));
    expect(filters).toHaveAttribute("open");
    fireEvent.change(screen.getByRole("textbox", { name: "Search contacts" }), {
      target: { value: "Ali" },
    });
    expect(screen.queryByRole("heading", { name: "Bilal" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search contacts" }), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cards" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive Ali" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Archive contact" }));
    expect(archive).toHaveBeenCalledWith("1");
  });
});
