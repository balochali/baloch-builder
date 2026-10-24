import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SaleLifecycleDialog } from "@/features/projects/components/SaleLifecycleDialog";
import { recordSaleEvent } from "@/data/repositories/saleEventsRepository";
import type { ProjectSale } from "@/data/repositories/projectSalesRepository";
vi.mock("@/data/repositories/saleEventsRepository", async (original) => ({
  ...(await original<typeof import("@/data/repositories/saleEventsRepository")>()),
  recordSaleEvent: vi.fn(),
}));
const sale = {
  id: "s",
  project_id: "p",
  buyer_name: "Ali",
  kind: "flat",
  unit_number: "A1",
  price: 1000000,
  sale_date: "2026-10-01",
} as ProjectSale;
beforeEach(() => vi.mocked(recordSaleEvent).mockReset().mockResolvedValue(undefined));
it("calculates cancellation from receipts and saves the confirmed refund", async () => {
  const saved = vi.fn();
  render(
    <SaleLifecycleDialog
      sale={sale}
      received={200000}
      kind="cancel"
      onClose={vi.fn()}
      onSaved={saved}
    />,
  );
  fireEvent.change(screen.getByLabelText("Deduction percentage (%) *"), {
    target: { value: "10" },
  });
  expect(screen.getByText("Deduction retained")).toHaveTextContent("20,000");
  expect(screen.getByText("Refund to buyer")).toHaveTextContent("180,000");
  fireEvent.change(screen.getByLabelText("Payment amount (Rs) *"), { target: { value: "50000" } });
  expect(screen.getByText(/Remaining after this payment/)).toHaveTextContent("130,000");
  expect(screen.getByRole("button", { name: "Confirm cancellation" })).toBeDisabled();
  fireEvent.click(screen.getByRole("radio", { name: "Builder Account" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /I confirm/ }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));
  await waitFor(() =>
    expect(recordSaleEvent).toHaveBeenCalledWith(
      sale,
      expect.objectContaining({
        kind: "cancel",
        received: 200000,
        rate: 10,
        payment: expect.objectContaining({ amount: 50000, account_key: "builder" }),
      }),
    ),
  );
  expect(saved).toHaveBeenCalledOnce();
});
it("records commission on resale price rather than another full sale receipt", async () => {
  render(
    <SaleLifecycleDialog
      sale={sale}
      received={1000000}
      kind="resell"
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("New buyer name *"), { target: { value: "Bilal" } });
  fireEvent.change(screen.getByLabelText("Resale price (Rs) *"), { target: { value: "2000000" } });
  fireEvent.change(screen.getByLabelText("Builder commission (%) *"), { target: { value: "2" } });
  expect(screen.getByText("Builder commission to receive")).toHaveTextContent("40,000");
  fireEvent.click(screen.getByRole("radio", { name: "Builder Account" }));
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Confirm resale" }));
  await waitFor(() =>
    expect(recordSaleEvent).toHaveBeenCalledWith(
      sale,
      expect.objectContaining({
        kind: "resell",
        resale_price: 2000000,
        new_buyer_name: "Bilal",
        payment: expect.objectContaining({ amount: 40000 }),
      }),
    ),
  );
});

it("can cancel now and refund later without payment details", async () => {
  render(
    <SaleLifecycleDialog
      sale={sale}
      received={200000}
      kind="cancel"
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Deduction percentage (%) *"), {
    target: { value: "10" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: /No refund paid yet/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /I confirm/ }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));
  await waitFor(() =>
    expect(recordSaleEvent).toHaveBeenCalledWith(sale, expect.objectContaining({ payment: null })),
  );
});
