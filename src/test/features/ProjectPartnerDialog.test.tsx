import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectPartnerDialog } from "@/features/projects/components/ProjectPartnerDialog";

describe("ProjectPartnerDialog payment methods", () => {
  it("shows transfer fields for a first payment and saves receipt details", async () => {
    const onAddPartner = vi.fn().mockResolvedValue(undefined);
    render(<ProjectPartnerDialog projectId="11111111-1111-4111-8111-111111111111"
      onOpenChange={vi.fn()} onAddPartner={onAddPartner} />);
    fireEvent.change(screen.getByLabelText("Partner name *"), { target: { value: "Ali" } });
    fireEvent.change(screen.getByLabelText("Mobile number *"), { target: { value: "03001234567" } });
    fireEvent.change(screen.getByLabelText("Project share (%) *"), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText("Amount received (Rs)"), { target: { value: "100000" } });
    fireEvent.change(screen.getByLabelText("Payment method"), { target: { value: "bank" } });
    expect(screen.getByLabelText("Sender bank *")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cheque number *")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Transfer reference / transaction ID *"), { target: { value: "TRX-9" } });
    fireEvent.change(screen.getByLabelText("Sender bank *"), { target: { value: "HBL" } });
    fireEvent.change(screen.getByLabelText("Sender account name *"), { target: { value: "Ali" } });
    fireEvent.change(screen.getByLabelText("Receiving bank *"), { target: { value: "Meezan" } });
    fireEvent.change(screen.getByLabelText("Receiving account name *"), { target: { value: "Project" } });
    fireEvent.change(screen.getByLabelText("Receipt number"), { target: { value: "R-9" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Partner" }));
    await waitFor(() => expect(onAddPartner).toHaveBeenCalledWith(expect.objectContaining({
      initial_method: "bank", initial_reference: "TRX-9",
      initial_payment_details: expect.objectContaining({ receipt_no: "R-9", from_bank: "HBL", to_bank: "Meezan" }),
    })));
  });

  it("shows cheque fields after cheque is selected", () => {
    render(<ProjectPartnerDialog projectId="11111111-1111-4111-8111-111111111111"
      onOpenChange={vi.fn()} partner={{ partnership_id: "a", partner_id: "b", contact_id: "c", name: "Ali",
        phone: "0300", phone2: null, address: null, notes: null, share_bp: 2500,
        agreed_contribution: null, contributed: 0 }} />);
    fireEvent.change(screen.getByLabelText("Payment method"), { target: { value: "cheque" } });
    expect(screen.getByLabelText("Cheque number *")).toBeInTheDocument();
    expect(screen.getByLabelText("Cheque date *")).toBeInTheDocument();
    expect(screen.getByLabelText("Payable to *")).toBeInTheDocument();
    expect(screen.queryByLabelText("Sender bank *")).not.toBeInTheDocument();
  });
});
