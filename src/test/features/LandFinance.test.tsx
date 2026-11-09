import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { LandEntryModal } from "@/features/projects/LandFinance";
import type { LandSheet, LandParcel, LandPurchase } from "@baloch/shared";
import { api } from "@/data/api";
vi.mock("@/data/api", () => ({ api: vi.fn() }));
it("blocks saving a split payment above the remaining balance", () => {
  const parcel = { id: "parcel", name: "Plot 1" } as LandParcel;
  const purchase = { id: "purchase", parcelId: parcel.id } as LandPurchase;
  const sheet = {
    partners: [],
    lenders: [],
    sellers: [],
    available: { bank: 100000, cash: 0 },
    parcels: [{ id: parcel.id, remaining: 1000 }],
  } as unknown as LandSheet;
  render(
    <LandEntryModal
      id="P-001"
      sheet={sheet}
      parcel={parcel}
      purchase={purchase}
      form={{ kind: "payments" }}
      close={vi.fn()}
      saved={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Amount 1"), { target: { value: "600" } });
  fireEvent.click(screen.getByRole("button", { name: "Add another source" }));
  fireEvent.change(screen.getByLabelText("Amount 2"), { target: { value: "401" } });
  expect(screen.getByRole("button", { name: "Save payment" })).toBeDisabled();
  expect(screen.getByText(/Payment exceeds/)).toBeInTheDocument();
  expect(api).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Amount 2"), { target: { value: "400" } });
  expect(screen.getByRole("button", { name: "Save payment" })).toBeEnabled();
  expect(screen.getByText("Payment total: 1,000 PKR")).toBeInTheDocument();
});
