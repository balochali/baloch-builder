import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useImperativeHandle, type Ref } from "react";
import { Grid } from "@/features/accounting/Grid";
const capture = vi.hoisted(() => ({
  rows: [] as unknown[][],
  write: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));
vi.mock("exceljs", () => ({
  default: {
    Workbook: class {
      xlsx = { writeBuffer: capture.write };
      addWorksheet() {
        return {
          addRow: (row: unknown[]) => capture.rows.push(row),
          getRow: () => ({}),
          columns: [],
        };
      }
    },
  },
}));
vi.mock("ag-grid-react", () => ({
  AgGridReact: ({ ref }: { ref: Ref<unknown> }) => {
    useImperativeHandle(ref, () => ({
      api: {
        getAllDisplayedColumns: () => [
          { getColDef: () => ({ headerName: "Project code" }), getColId: () => "code" },
        ],
        forEachNodeAfterFilterAndSort: (fn: (node: { data: { code: string } }) => void) => {
          fn({ data: { code: "VISIBLE-B" } });
          fn({ data: { code: "VISIBLE-A" } });
        },
        getCellValue: ({ rowNode }: { rowNode: { data: { code: string } } }) => rowNode.data.code,
      },
    }));
    return <div />;
  },
}));
afterEach(() => vi.restoreAllMocks());
it("exports displayed columns and only filtered rows in active sort order", async () => {
  capture.rows = [];
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:export-test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(
    <Grid
      screen="projects"
      rows={[{ code: "HIDDEN" }, { code: "VISIBLE-A" }, { code: "VISIBLE-B" }]}
      columns={[{ field: "code" }]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /export/i }));
  await waitFor(() => expect(capture.write).toHaveBeenCalled());
  expect(capture.rows).toEqual([["Project code"], ["VISIBLE-B"], ["VISIBLE-A"]]);
});
