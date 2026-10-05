import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { ProjectPartnerDialog } from "@/features/projects/components/ProjectPartnerDialog";

describe("ProjectPartnerDialog payment methods", () => {
  it("shows transfer fields for a first payment and saves receipt details", async () => {
    const user = userEvent.setup();
    const onAddPartner = vi.fn().mockResolvedValue(undefined);
    render(
      <ProjectPartnerDialog
        projectId="11111111-1111-4111-8111-111111111111"
        onOpenChange={vi.fn()}
        onAddPartner={onAddPartner}
      />,
    );
    fireEvent.change(screen.getByLabelText("Partner name *"), { target: { value: "Ali" } });
    fireEvent.change(screen.getByLabelText("Mobile number *"), {
      target: { value: "03001234567" },
    });
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onAddPartner).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Project share (%) *"), { target: { value: "25" } });
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onAddPartner).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Amount received (Rs)"), {
      target: { value: "100000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Bank transfer", exact: true }));
    expect(screen.getByLabelText("Sender bank *")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cheque number *")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Transfer reference / transaction ID *"), {
      target: { value: "TRX-9" },
    });
    fireEvent.change(screen.getByLabelText("Sender bank *"), { target: { value: "HBL" } });
    fireEvent.change(screen.getByLabelText("Sender account name *"), { target: { value: "Ali" } });
    fireEvent.change(screen.getByLabelText("Receiving bank *"), { target: { value: "Meezan" } });
    fireEvent.change(screen.getByLabelText("Receiving account name *"), {
      target: { value: "Project" },
    });
    fireEvent.change(screen.getByLabelText("Receipt number"), { target: { value: "R-9" } });
    for (const account of screen.queryAllByRole("radio", { name: "Builder Account" }))
      fireEvent.click(account);
    fireEvent.click(screen.getByRole("button", { name: "Add Partner" }));
    await waitFor(() =>
      expect(onAddPartner).toHaveBeenCalledWith(
        expect.objectContaining({
          initial_method: "bank",
          initial_reference: "TRX-9",
          initial_payment_details: expect.objectContaining({
            receipt_no: "R-9",
            from_bank: "HBL",
            to_bank: "Meezan",
          }),
        }),
      ),
    );
  });

  it("requires a receiving account and records digital first payments", async () => {
    const onAddPartner = vi.fn().mockResolvedValue(undefined);
    render(
      <ProjectPartnerDialog
        projectId="11111111-1111-4111-8111-111111111111"
        onOpenChange={vi.fn()}
        onAddPartner={onAddPartner}
      />,
    );
    fireEvent.change(screen.getByLabelText("Partner name *"), { target: { value: "Bilal" } });
    fireEvent.change(screen.getByLabelText("Mobile number *"), {
      target: { value: "03001234567" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Project share (%) *"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Amount received (Rs)"), { target: { value: "15000" } });
    fireEvent.click(screen.getByRole("radio", { name: "Builder Account" }));
    fireEvent.click(screen.getByRole("button", { name: "Digital wallet", exact: true }));
    fireEvent.change(screen.getByLabelText("Transfer reference / transaction ID *"), {
      target: { value: "TX-8" },
    });
    fireEvent.change(screen.getByLabelText("Wallet or service"), {
      target: { value: "Easypaisa" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Partner" }));
    await waitFor(() =>
      expect(onAddPartner).toHaveBeenCalledWith(
        expect.objectContaining({
          account_key: "builder",
          initial_method: "digital",
          initial_reference: "TX-8",
          initial_payment_details: expect.objectContaining({ from_bank: "Easypaisa" }),
        }),
      ),
    );
  });

  it("shows cheque fields after cheque is selected", () => {
    render(
      <ProjectPartnerDialog
        projectId="11111111-1111-4111-8111-111111111111"
        onOpenChange={vi.fn()}
        partner={{
          partnership_id: "a",
          partner_id: "b",
          contact_id: "c",
          name: "Ali",
          phone: "0300",
          phone2: null,
          address: null,
          notes: null,
          share_bp: 2500,
          agreed_contribution: null,
          contributed: 0,
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cheque", exact: true }));
    expect(screen.getByLabelText("Cheque number *")).toBeInTheDocument();
    expect(screen.getByLabelText("Cheque date *")).toBeInTheDocument();
    expect(screen.getByLabelText("Payable to *")).toBeInTheDocument();
    expect(screen.queryByLabelText("Sender bank *")).not.toBeInTheDocument();
  });

  it("edits an existing partner's share and promised amount", async () => {
    const user = userEvent.setup();
    const onUpdatePartner = vi.fn().mockResolvedValue(undefined);
    render(
      <ProjectPartnerDialog
        projectId="11111111-1111-4111-8111-111111111111"
        onOpenChange={vi.fn()}
        remainingShareBp={6000}
        editingPartner={{
          partnership_id: "share-1",
          partner_id: "partner-1",
          contact_id: "contact-1",
          name: "Ali",
          phone: "03001234567",
          phone2: null,
          address: "Quetta",
          notes: null,
          share_bp: 3000,
          agreed_contribution: 27_000_000,
          contributed: 0,
        }}
        onUpdatePartner={onUpdatePartner}
      />,
    );
    expect(screen.getByLabelText("Partner name *")).toHaveValue("Ali");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onUpdatePartner).not.toHaveBeenCalled();
    expect(screen.queryByText("Saving…")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Project share (%) *")).toHaveValue(30);
    expect(screen.getByLabelText("Agreed contribution (Rs)")).toHaveValue("27000000");
    await user.click(screen.getByLabelText("Agreed contribution (Rs)"));
    await user.keyboard("{Enter}");
    expect(onUpdatePartner).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Project share (%) *")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Project share (%) *"), { target: { value: "35" } });
    fireEvent.change(screen.getByLabelText("Agreed contribution (Rs)"), {
      target: { value: "30000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() =>
      expect(onUpdatePartner).toHaveBeenCalledWith(
        expect.objectContaining({
          partnership_id: "share-1",
          share_bp: 3500,
          agreed_contribution: 30_000_000,
        }),
      ),
    );
  });
});
