import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { SellUnit, ReceivePayment, friendlyError } from "@/features/projects/Sales";
import { DataGrid, gridWorkbook } from "@/components/grid/DataGrid";
import { GlobalActions } from "@/app/layout/GlobalActions";
import type { SaleAgreement, SaleUnit } from "@baloch/shared";
vi.mock("@/data/api", () => ({
  api: vi.fn(async (url: string) =>
    url === "me"
      ? { id: "test-user" }
      : url.startsWith("search?")
        ? [
            { id: "unit", kind: "unit", label: "A-101", url: "/projects/P-001/sales" },
            { id: "customer", kind: "customer", label: "Ali Khan", url: "/projects/P-001/sales" },
          ]
        : [],
  ),
}));
const unit = {
  id: "unit",
  unit_no: "A-101",
  list_price: 100,
  category: "Flat",
  version: 1,
} as SaleUnit;
describe("Sales actions", () => {
  it("blocks a sale when its payment plan differs from the price", () => {
    render(
      <SellUnit
        unit={unit}
        customers={[{ id: "customer", name: "Ali", phone: "" }]}
        endpoint="test"
        close={() => {}}
        done={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Customer"), { target: { value: "customer" } });
    fireEvent.click(screen.getByText("Continue"));
    fireEvent.click(screen.getByText("Continue"));
    fireEvent.click(screen.getByText("Add payment row"));
    expect(screen.getByText("Continue")).toBeDisabled();
    expect(screen.getAllByText(/difference: -1/).length).toBeGreaterThan(0);
  });
  it("blocks overpayment and displays the remaining amount", () => {
    const a = {
      id: "a",
      customer_name: "Ali",
      total_price: 100,
      received: 20,
      schedule: [{ seq: 1, label: "Full", due_date: "2020-01-01", amount: 100 }],
      handover_date: null,
    } as SaleAgreement;
    render(<ReceivePayment agreement={a} endpoint="test" close={() => {}} done={() => {}} />);
    fireEvent.change(screen.getByLabelText("Amount received"), { target: { value: "81" } });
    expect(screen.getByText("Save payment")).toBeDisabled();
    expect(screen.getByText(/cannot receive more/)).toBeVisible();
  });
  it("maps database errors to plain language", () => {
    expect(friendlyError(new Error("duplicate key constraint foo"))).not.toContain("constraint");
    expect(friendlyError(new Error("Choose a customer."))).toBe("Choose a customer.");
  });
  it("opens Ctrl+K and finds a unit and customer", async () => {
    render(
      <MemoryRouter>
        <GlobalActions role="admin" />
      </MemoryRouter>,
    );
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.change(screen.getByPlaceholderText("Type at least two characters"), {
      target: { value: "Ali" },
    });
    await screen.findByText("A-101");
    expect(screen.getByText("Ali Khan")).toBeVisible();
  });
});
describe("spreadsheet grid", () => {
  const columns = [
    { key: "name", label: "Name", value: (r: { name: string; amount: number }) => r.name },
    {
      key: "amount",
      label: "Amount",
      value: (r: { name: string; amount: number }) => r.amount,
      numeric: true,
      total: true,
      editable: () => true,
      validate: (s: string) => Number.isSafeInteger(Number(s)),
    },
  ];
  function Editable() {
    const [rows, setRows] = useState([
      { id: "1", name: "One", amount: 1 },
      { id: "2", name: "Two", amount: 2 },
      { id: "3", name: "Three", amount: 3 },
    ]);
    return (
      <DataGrid
        name="Test grid"
        rows={rows}
        columns={columns}
        onChange={(changes) =>
          setRows((old) =>
            old.map((r) => ({
              ...r,
              amount: Number(changes.find((c) => c.id === r.id)?.value ?? r.amount),
            })),
          )
        }
      />
    );
  }
  it("supports Enter, Tab, Escape, paste and undo", async () => {
    const { container } = render(<Editable />);
    const cell = (r: number, c: number) =>
      container.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`)!;
    cell(0, 1).focus();
    fireEvent.keyDown(cell(0, 1), { key: "F2" });
    const input = screen.getByLabelText("Edit Amount");
    fireEvent.change(input, { target: { value: "20" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(cell(0, 1)).toHaveTextContent("1");
    fireEvent.paste(cell(0, 1), { clipboardData: { getData: () => "10\n20\n30" } });
    await waitFor(() => expect(cell(2, 1)).toHaveTextContent("30"));
    fireEvent.keyDown(cell(0, 1), { key: "z", ctrlKey: true });
    await waitFor(() => expect(cell(2, 1)).toHaveTextContent("3"));
    fireEvent.keyDown(cell(0, 0), { key: "Tab" });
    await waitFor(() => expect(cell(0, 1)).toHaveFocus());
    fireEvent.keyDown(cell(0, 1), { key: "Enter" });
    await waitFor(() => expect(cell(1, 1)).toHaveFocus());
  });
  it("exports numeric filtered rows and a totals row", async () => {
    const book = await gridWorkbook(columns, [{ name: "Visible", amount: 1234 }]);
    const sheet = book.getWorksheet("Data")!;
    expect(sheet.rowCount).toBe(3);
    expect(sheet.getRow(2).getCell(1).value).toBe("Visible");
    expect(sheet.getRow(2).getCell(2).value).toBe(1234);
    expect(sheet.getRow(3).getCell(1).value).toBe("Total");
    expect(sheet.getRow(3).getCell(2).value).toBe(1234);
  }, 60000);
});
