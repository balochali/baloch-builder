import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps, ReactElement } from "react";
import { blankWorkbookRow } from "@baloch/shared";
import { Grid, type Row } from "@/features/accounting/Grid";
import { SalesEstimate, SalesSummary } from "@/features/accounting/SalesEstimate";
import { api } from "@/data/api";

const capture = vi.hoisted(() => ({ grid: null as ComponentProps<typeof Grid> | null }));
vi.mock("@/data/api", () => ({ api: vi.fn() }));
vi.mock("@/features/accounting/Grid", () => ({
  Grid: (props: ComponentProps<typeof Grid>) => {
    capture.grid = props;
    return <div data-testid="grid">{props.summary?.(props.rows)}</div>;
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  capture.grid = null;
});

const shop = {
  id: "s1",
  version: 1,
  unitType: "Shop",
  size: "400",
  sizeUnit: "sq ft",
  units: 12,
  minimumPrice: "5000000",
  maximumPrice: "6500000",
  notes: "",
};
const newRow = (over: Record<string, unknown>): Row => ({
  ...blankWorkbookRow("sales_estimate"),
  _new: true,
  _placeholder: false,
  ...over,
});
const column = (id: string) =>
  capture.grid!.columns.find((col) => (col.colId ?? col.field) === id)!;
type Getter = (params: { data?: Row }) => unknown;
const calc = (id: string, data: Row) => (column(id).valueGetter as Getter)({ data });
function setup(props: Partial<ComponentProps<typeof SalesEstimate>> = {}) {
  const onDirty = vi.fn(),
    onEditingChange = vi.fn();
  render(
    <SalesEstimate
      projectId="p1"
      canEdit
      marlaSqft="272.25"
      onDirty={onDirty}
      onEditingChange={onEditingChange}
      {...props}
    />,
  );
  return { onDirty, onEditingChange };
}

it("loads saved rows read-only, then unlocks with Edit and shows a blank entry row", async () => {
  vi.mocked(api).mockResolvedValue([shop]);
  const { onEditingChange } = setup();
  await screen.findByRole("button", { name: "Edit" });
  expect(api).toHaveBeenCalledWith("projects/p1/workbook/sales_estimate");
  expect(capture.grid!.rows).toHaveLength(1);
  expect(capture.grid!.onChange).toBeUndefined();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(capture.grid!.rows).toHaveLength(2);
  expect(capture.grid!.rows[1]._placeholder).toBe(true);
  expect(capture.grid!.onChange).toBeDefined();
  expect(onEditingChange).toHaveBeenLastCalledWith(true);
  expect(screen.getByRole("button", { name: "+ 2 Room Flat" })).toBeEnabled();
});

it("calculates area and price totals per row and for the whole sheet", async () => {
  vi.mocked(api).mockResolvedValue([
    shop,
    {
      ...shop,
      id: "s2",
      unitType: "2 Room Flat",
      size: "850",
      units: 24,
      minimumPrice: "9000000",
      maximumPrice: "11000000",
    },
  ]);
  setup();
  await screen.findByRole("button", { name: "Edit" });
  expect(capture.grid!.rows[0].totalArea).toBe("4800");
  expect(calc("minimumTotal", capture.grid!.rows[0])).toBe("60,000,000");
  expect(calc("maximumTotal", capture.grid!.rows[0])).toBe("78,000,000");
  expect(capture.grid!.rows[1].totalArea).toBe("20400");
  expect(capture.grid!.rows[1]).toMatchObject({ unitType: "Flat", rooms: "2" });
  expect(calc("minimumTotal", capture.grid!.rows[1])).toBe("216,000,000");
  const totals = screen.getByTestId("grid").textContent!;
  expect(totals).toContain("Unit Types2");
  expect(totals).toContain("Total Units36");
  expect(totals).toContain("Total Area (sq ft)25,200");
  expect(totals).toContain("Rs 276,000,000.00");
  expect(totals).toContain("Rs 342,000,000.00");
});

it("converts other size units using the project's marla size", async () => {
  vi.mocked(api).mockResolvedValue([{ ...shop, sizeUnit: "marla", size: "5", units: 2 }]);
  setup({ marlaSqft: "225" });
  await screen.findByRole("button", { name: "Edit" });
  expect(capture.grid!.rows[0].totalArea).toBe("2250");
});

it("quick-adds a unit type, saves new rows and locks again only after a successful Save", async () => {
  vi.mocked(api).mockImplementation(async (_path, method, data) =>
    method === "POST" ? { ...(data as object), id: "s9", version: 1 } : [shop],
  );
  const { onDirty, onEditingChange } = setup();
  await screen.findByRole("button", { name: "Edit" });
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.click(screen.getByRole("button", { name: "+ 3 Room Flat" }));
  const added = capture.grid!.rows.find((row) => row.unitType === "Flat" && row.rooms === "3")!;
  expect(added).toBeTruthy();
  expect(capture.grid!.rows.slice(-1)[0]._placeholder).toBe(true);
  act(() =>
    capture.grid!.onChange!(
      capture.grid!.rows.map((row) =>
        row === added
          ? {
              ...row,
              totalArea: "21600",
              units: "18",
              minimumPrice: "14000000",
              maximumPrice: "17000000",
            }
          : row,
      ),
    ),
  );
  await waitFor(() => expect(onDirty).toHaveBeenLastCalledWith(true));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Edit" })).toBeEnabled());
  expect(api).toHaveBeenCalledWith(
    "projects/p1/workbook/sales_estimate",
    "POST",
    expect.objectContaining({
      unitType: "Flat",
      rooms: 3,
      totalArea: "21600",
      units: 18,
      minimumPrice: "14000000",
    }),
  );
  expect(vi.mocked(api).mock.calls.filter(([, method]) => method === "POST")).toHaveLength(1);
  expect(onDirty).toHaveBeenLastCalledWith(false);
  expect(onEditingChange).toHaveBeenLastCalledWith(false);
  expect(capture.grid!.rows.some((row) => row.id === "s9")).toBe(true);
});

it("does not save incomplete or inconsistent rows and keeps the sheet unlocked", async () => {
  vi.mocked(api).mockResolvedValue([]);
  setup();
  await screen.findByRole("button", { name: "Edit" });
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  act(() =>
    capture.grid!.onChange!([
      newRow({ unitType: "Shop", size: "400", units: "10", minimumPrice: "9", maximumPrice: "5" }),
      newRow({ unitType: "Office", size: "300", units: "0" }),
      { ...blankWorkbookRow("sales_estimate"), _new: true, _placeholder: true },
    ]),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByRole("alert");
  expect(vi.mocked(api).mock.calls.some(([, method]) => method === "POST")).toBe(false);
  expect(String(capture.grid!.rows[0].error)).toMatch(/Maximum price cannot be less/);
  expect(String(capture.grid!.rows[1].error)).toMatch(/Enter how many units/);
  expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
});

it("stages deletions until Save, then removes by version", async () => {
  vi.mocked(api).mockImplementation(async (_path, method) =>
    method === "DELETE" ? { removed: true } : [shop],
  );
  setup();
  await screen.findByRole("button", { name: "Edit" });
  expect(column("remove")).toBeUndefined();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  const DeleteCell = column("remove").cellRenderer as (params: { data: Row }) => ReactElement;
  const icon = render(<DeleteCell data={{ ...shop, _rowIndex: 0 }} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete Shop" }));
  icon.unmount();
  expect(capture.grid!.rows.every((row) => row._placeholder)).toBe(true);
  expect(vi.mocked(api).mock.calls.some(([, method]) => method === "DELETE")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Edit" })).toBeEnabled());
  expect(api).toHaveBeenCalledWith("projects/p1/workbook/sales_estimate/s1", "DELETE", {
    version: 1,
  });
  expect(capture.grid!.rows).toHaveLength(0);
});

it("is read-only for people who cannot edit", async () => {
  vi.mocked(api).mockResolvedValue([shop]);
  setup({ canEdit: false });
  await screen.findByRole("button", { name: "Edit" });
  expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "+ Shop" })).not.toBeInTheDocument();
  expect(capture.grid!.rows).toEqual([expect.objectContaining({ unitType: "Shop", units: "12" })]);
  expect(capture.grid!.rows.some((row) => row._placeholder)).toBe(false);
});

it("excludes incomplete rows from the totals and says so", () => {
  render(
    <SalesSummary
      marlaSqft="272.25"
      rows={[
        { ...shop, units: "12" },
        { ...shop, id: "bad", units: "0" },
        { ...blankWorkbookRow("sales_estimate"), _placeholder: true },
      ]}
    />,
  );
  expect(document.body.textContent).toContain("incomplete rows excluded");
  expect(document.body.textContent).toContain("Rs 60,000,000.00");
  expect(document.body.textContent).toContain("Unit Types1");
});

it("uses the requested columns with raw text editing and visible typed numbers", async () => {
  vi.mocked(api).mockResolvedValue([]);
  setup();
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  expect(
    capture.grid!.columns.filter((c) => c.colId !== "remove").map((c) => c.headerName),
  ).toEqual([
    "S.No",
    "Unit Type",
    "Rooms",
    "No. of Units",
    "Total Area (sq ft)",
    "Min Price / Unit",
    "Max Price / Unit",
    "Total Min",
    "Total Max",
  ]);
  expect(column("unitType").cellEditorParams.values).toEqual(["Flat", "Shop"]);
  expect(column("minimumPrice").cellEditor).toBe("agTextCellEditor");
  expect(column("minimumPrice").cellDataType).toBe(false);
  const format = column("minimumPrice").valueFormatter as (p: unknown) => string;
  expect(format({ value: "12345", data: { _placeholder: true } })).toBe("12,345");
  act(() =>
    capture.grid!.onChange!([
      newRow({
        unitType: "Flat",
        rooms: "2",
        units: "3",
        totalArea: "2400",
        minimumPrice: "100",
        maximumPrice: "200",
      }),
    ]),
  );
  expect(capture.grid!.rows[0]).toMatchObject({
    rooms: "2",
    totalArea: "2400",
    minimumPrice: "100",
    _placeholder: false,
  });
  expect(calc("minimumTotal", capture.grid!.rows[0])).toBe("300");
  expect(calc("maximumTotal", capture.grid!.rows[0])).toBe("600");
});
