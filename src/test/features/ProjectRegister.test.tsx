import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { Grid } from "@/features/accounting/Grid";
import { ProjectRegister } from "@/features/accounting/ProjectRegister";
import { api } from "@/data/api";
const capture = vi.hoisted(() => ({ grid: null as ComponentProps<typeof Grid> | null }));
vi.mock("@/data/api", () => ({ api: vi.fn() }));
vi.mock("@/features/accounting/Grid", () => ({
  Grid: (props: ComponentProps<typeof Grid>) => {
    capture.grid = props;
    return props.onSave ? <button onClick={props.onSave}>Save Changes</button> : null;
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("clears dirty state after saving a partner and retains a blank row", async () => {
  vi.mocked(api).mockImplementation(async (_path, method, data) =>
    method === "POST" ? { ...(data as object), id: "r1", version: 1 } : [],
  );
  const dirty = vi.fn();
  render(
    <ProjectRegister
      projectId="p1"
      sheet="partners"
      user={{ id: "u", email: "admin@test", role: "admin" }}
      onDirty={dirty}
    />,
  );
  await waitFor(() => expect(capture.grid).not.toBeNull());
  act(() => capture.grid!.onChange!([{ ...capture.grid!.rows[0], name: "Ali", share: "25" }]));
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await waitFor(() => expect(capture.grid!.rows[0].id).toBe("r1"));
  expect(capture.grid!.rows.slice(-1)[0]._placeholder).toBe(true);
  expect(dirty).toHaveBeenLastCalledWith(false);
  expect(screen.queryByRole("button", { name: "Save Changes" })).not.toBeInTheDocument();
});
it("estimate unlocks on Edit and locks only after successful Save", async () => {
  capture.grid = null;
  vi.mocked(api).mockImplementation(async (_path, method, data) =>
    method === "POST" ? { ...(data as object), id: "e1", version: 1 } : [],
  );
  render(
    <ProjectRegister
      projectId="p1"
      sheet="estimate"
      user={{ id: "u", email: "admin@test", role: "admin" }}
      onDirty={vi.fn()}
    />,
  );
  await screen.findByRole("button", { name: "Edit" });
  expect(capture.grid!.onChange).toBeUndefined();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(capture.grid!.singleClickEdit).toBe(true);
  expect(capture.grid!.toolbar).toBe(false);
  act(() =>
    capture.grid!.onChange!([
      {
        ...capture.grid!.rows[0],
        item: "Land",
        unit: "Lump Sum",
        quantity: "1",
        minimumCost: "80",
        maximumCost: "120",
      },
    ]),
  );
  fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Edit" })).toBeEnabled());
  expect(capture.grid!.onChange).toBeUndefined();
  expect(screen.getByRole("button", { name: "Edit" })).toBeEnabled();
  expect(capture.grid!.rows).toHaveLength(1);
});
it("keeps failed estimate rows editable", async () => {
  capture.grid = null;
  vi.mocked(api).mockImplementation(async (_path, method) => {
    if (method === "POST") throw Error("Save failed");
    return [];
  });
  render(
    <ProjectRegister
      projectId="p1"
      sheet="estimate"
      user={{ id: "u", email: "admin@test", role: "admin" }}
      onDirty={vi.fn()}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  act(() => capture.grid!.onChange!([{ ...capture.grid!.rows[0], item: "Steel" }]));
  fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
  await screen.findByRole("alert");
  expect(capture.grid!.onChange).toBeDefined();
  expect(screen.getByRole("button", { name: /^Save$/ })).toBeEnabled();
});

it("commits an active editor before Save and retains saved records on reopening", async () => {
  capture.grid = null;
  const saved = {
    item: "Land",
    unit: "Lump Sum",
    quantity: "1",
    rate: "100",
    minimumCost: "80",
    maximumCost: "120",
    notes: "",
    custom: {},
    id: "e2",
    version: 1,
  };
  vi.mocked(api).mockImplementation(async (path, method) => {
    if (method === "POST") return saved;
    return path.startsWith("views/") ? null : [];
  });
  const props = {
    projectId: "p1",
    sheet: "estimate" as const,
    user: { id: "u", email: "admin@test", role: "admin" as const },
    onDirty: vi.fn(),
  };
  const view = render(<ProjectRegister {...props} />);
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  const commit = vi.fn(() => [
    {
      ...capture.grid!.rows[0],
      item: "Land",
      unit: "Lump Sum",
      quantity: "1",
      minimumCost: "80",
      maximumCost: "120",
    },
  ]);
  (capture.grid!.editHandle as { current: { commit: typeof commit } | null }).current = { commit };
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Edit" })).toBeEnabled());
  expect(commit).toHaveBeenCalledOnce();
  expect(api).toHaveBeenCalledWith(
    "projects/p1/workbook/estimate",
    "POST",
    expect.objectContaining({ item: "Land", minimumCost: "80", maximumCost: "120" }),
  );
  expect(capture.grid!.rows).toEqual([saved]);
  expect(capture.grid!.onChange).toBeUndefined();
  expect(screen.queryByText(/Click Edit to enter data/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Choose a unit for each item/)).not.toBeInTheDocument();
  view.unmount();
  vi.mocked(api).mockImplementation(async (path) => (path.startsWith("views/") ? null : [saved]));
  render(<ProjectRegister {...props} />);
  await screen.findByRole("button", { name: "Edit" });
  expect(capture.grid!.rows).toEqual([saved]);
  expect(capture.grid!.onChange).toBeUndefined();
});

it("shows bottom tabs and stages row deletion only in edit mode until Save", async () => {
  const saved = {
    id: "e1",
    version: 1,
    item: "Steel",
    quantity: "1",
    minimumCost: "10",
    maximumCost: "20",
  };
  capture.grid = null;
  vi.mocked(api).mockImplementation(async (path, method) =>
    method === "DELETE" ? { removed: true } : path.startsWith("views/") ? null : [saved],
  );
  render(
    <ProjectRegister
      projectId="p1"
      sheet="estimate"
      user={{ id: "u", email: "admin@test", role: "admin" }}
      onDirty={vi.fn()}
    />,
  );
  await screen.findByRole("button", { name: "Edit" });
  expect(capture.grid!.columns.some((c) => c.colId === "remove")).toBe(false);
  fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
  expect(await screen.findByRole("tabpanel", { name: "Estimate overview" })).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "Sales" }));
  expect(screen.queryByText("Coming soon")).not.toBeInTheDocument();
  await waitFor(() => expect(api).toHaveBeenCalledWith("projects/p1/workbook/sales_estimate"));
  fireEvent.click(screen.getByRole("tab", { name: "Cost" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  const DeleteCell = capture.grid!.columns.find((c) => c.colId === "remove")!.cellRenderer;
  const icon = render(<DeleteCell data={{ ...saved, _rowIndex: 0 }} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete Steel" }));
  expect(capture.grid!.rows.every((r) => r._placeholder)).toBe(true);
  expect(vi.mocked(api).mock.calls.some(([, method]) => method === "DELETE")).toBe(false);
  icon.unmount();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Edit" })).toBeEnabled());
  expect(api).toHaveBeenCalledWith("projects/p1/workbook/estimate/e1", "DELETE", { version: 1 });
  expect(capture.grid!.rows).toHaveLength(0);
  expect(capture.grid!.columns.some((c) => c.colId === "remove")).toBe(false);
});
