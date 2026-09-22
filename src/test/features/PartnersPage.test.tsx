import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PartnersPage } from "@/features/partners/pages/PartnersPage";
import { listAllPartnerContributions, listAllProjectPartners } from "@/data/repositories/projectPartnersRepository";

vi.mock("@/data/repositories/projectPartnersRepository", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/data/repositories/projectPartnersRepository")>(),
  listAllProjectPartners: vi.fn(), listAllPartnerContributions: vi.fn(),
}));

const projectId = "11111111-1111-4111-8111-111111111111";
const partnerId = "22222222-2222-4222-8222-222222222222";

describe("PartnersPage", () => {
  beforeEach(() => {
    vi.mocked(listAllProjectPartners).mockResolvedValue([{
      partnership_id: "link-1", project_id: projectId, project_name: "Baloch Residency",
      project_code: "BR-01", project_location: "Quetta", project_status: "planning",
      partner_id: partnerId, contact_id: "contact-1", name: "Ali Khan", phone: "03001234567",
      phone2: null, address: "Satellite Town", notes: "Founding partner", share_bp: 2500,
      agreed_contribution: 1_000_000, contributed: 200_000, partner_status: "active",
      partnership_status: "active", created_at: "2026-09-22",
    }]);
    vi.mocked(listAllPartnerContributions).mockResolvedValue([{
      id: "payment-1", project_id: projectId, partner_id: partnerId, contact_id: "contact-1",
      date: "2026-09-22", amount: 200_000, direction: "in", type: "partner_contribution",
      method: "bank", reference: "TRX-9", description: "Initial partner contribution",
      land_id: null, receipt_document_id: null, archived: 0, created_at: "2026-09-22",
      updated_at: "2026-09-22", custom: JSON.stringify({ payment_details: {
        receipt_no: "R-9", from_bank: "HBL", from_account_name: "Ali Khan", from_account_no: "",
        to_bank: "Meezan", to_account_name: "Project", to_account_no: "", cheque_no: "",
        cheque_date: "", cheque_payee: "", received_by: "",
      } }),
    }]);
  });

  it("shows partner contact, project, share, totals and payment details", async () => {
    render(<MemoryRouter initialEntries={["/partners"]}>
      <Routes><Route path="/partners" element={<PartnersPage />} /></Routes>
    </MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Ali Khan" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Baloch Residency/ })).toHaveAttribute("href", `/projects/${projectId}`);
    expect(screen.getByText("25.00% share")).toBeInTheDocument();
    expect(screen.getByText("03001234567")).toBeInTheDocument();
    expect(screen.getByText("Satellite Town")).toBeInTheDocument();
    expect(screen.getByText("TRX-9", { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Payment details"));
    expect(screen.getByText("R-9")).toBeInTheDocument();
    expect(screen.getByText("HBL")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search partners"), { target: { value: "different" } });
    await waitFor(() => expect(screen.getByText("No partners match your search.")).toBeInTheDocument());
  });
});
