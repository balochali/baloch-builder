import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ProjectContractorsPanel } from "@/features/projects/components/ProjectContractorsPanel";
import {
  listProjectContractors,
  listContractorPayments,
  saveProjectContractor,
  addContractorPayment,
} from "@/data/repositories/projectContractorsRepository";
vi.mock("@/data/repositories/projectContractorsRepository", () => ({
  listProjectContractors: vi.fn(),
  listContractorPayments: vi.fn(),
  saveProjectContractor: vi.fn(),
  addContractorPayment: vi.fn(),
}));
const person = {
  id: "c1",
  project_id: "p1",
  name: "Ahmed",
  phone: "0300",
  address: "Quetta",
  scope: "Labour",
  agreed_amount: 100000,
  paid: 25000,
  agreement_date: "2026-10-01",
  notes: "",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listProjectContractors).mockResolvedValue([person]);
  vi.mocked(listContractorPayments).mockResolvedValue([]);
});
it("records a payment and refreshes the contractor's remaining balance", async () => {
  const changed = vi.fn();
  vi.mocked(addContractorPayment).mockImplementation(async () => {
    vi.mocked(listProjectContractors).mockResolvedValue([{ ...person, paid: 35000 }]);
    return "t1";
  });
  render(<ProjectContractorsPanel projectId="p1" onChanged={changed} />);
  await screen.findByRole("heading", { name: "Ahmed" });
  fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
  fireEvent.change(screen.getByLabelText("Payment amount (Rs) *"), { target: { value: "10000" } });
  fireEvent.change(screen.getByLabelText("Payment date *"), { target: { value: "2026-10-03" } });
  fireEvent.click(screen.getByRole("button", { name: "Save payment" }));
  await waitFor(() =>
    expect(addContractorPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        contractor_id: "c1",
        project_id: "p1",
        amount: 10000,
        date: "2026-10-03",
        method: "cash",
        received_by: "Ahmed",
      }),
    ),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getAllByText(/65,000/).length).toBeGreaterThan(0));
  expect(changed).toHaveBeenCalledTimes(1);
});
it("adds name, address and an agreement without recording a payment", async () => {
  render(<ProjectContractorsPanel projectId="p1" onChanged={vi.fn()} />);
  await screen.findByRole("heading", { name: "Ahmed" });
  fireEvent.click(screen.getByRole("button", { name: "Add thekedar" }));
  const form = within(screen.getByRole("dialog"));
  fireEvent.change(form.getByLabelText("Name *"), { target: { value: "Bilal" } });
  fireEvent.change(form.getByLabelText("Address"), { target: { value: "Karachi" } });
  fireEvent.change(form.getByLabelText("Agreed construction work *"), {
    target: { value: "Finishing" },
  });
  fireEvent.change(form.getByLabelText("Agreed amount (Rs) *"), { target: { value: "200000" } });
  fireEvent.click(form.getByRole("button", { name: "Save agreement" }));
  await waitFor(() =>
    expect(saveProjectContractor).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "p1",
        name: "Bilal",
        address: "Karachi",
        scope: "Finishing",
        agreed_amount: 200000,
      }),
      undefined,
    ),
  );
  expect(addContractorPayment).not.toHaveBeenCalled();
});
