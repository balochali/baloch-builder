import { AccountingPage } from "@/features/accounting/AccountingPage";
import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { ComponentProps } from "react";
import type { Role } from "@baloch/shared";
import { Grid } from "@/features/accounting/Grid";
import { ProjectsPage } from "@/features/accounting/ProjectsPage";
import { ProjectWorkspace } from "@/features/accounting/ProjectWorkspace";
import { ProjectStatusControl } from "@/features/accounting/ProjectStatusControl";
import { VoucherEditor } from "@/features/accounting/VoucherEditor";
import { Sidebar } from "@/app/layout/Sidebar";
import { SearchSelectEditor } from "@/features/accounting/SearchSelectEditor";
import { api } from "@/data/api";
type GridProps = ComponentProps<typeof Grid>;
const grids = vi.hoisted(() => new Map<string, GridProps>());
vi.mock("@/features/accounting/Grid", () => ({
  Grid: (props: GridProps) => {
    grids.set(props.screen, props);
    return (
      <div data-testid={props.screen}>
        {props.toolbarContent}
        {props.onSave && <button onClick={props.onSave}>Save Changes</button>}
      </div>
    );
  },
}));
vi.mock("@/data/api", () => ({ api: vi.fn() }));
const profile = {
  id: "p1",
  code: "P1",
  name: "Tower",
  city: "Karachi",
  type: "apartments",
  status: "construction",
  saleable_area_sqft: "1",
  cost_allocation_method: "saleable_area",
  revenue_recognition: "on_handover",
};
const user = (role: Role) => ({ id: "u1", email: "person@example.test", role });
beforeEach(() => {
  grids.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  vi.mocked(api)
    .mockReset()
    .mockImplementation(async (path, method, body) => {
      if (method === "PATCH") return { ...profile, ...(body as object) };
      if (path === "area-settings") return { areaDisplayUnit: "marla", marlaSqft: "3" };
      if (path === "projects/p1") return profile;
      if (path.startsWith("projects?") || path === "projects") return [profile];
      if (path === "accounts")
        return [
          { id: "a1", code: "1220", requiresCostHead: true, archived: false },
          { id: "a2", code: "1230", requiresCostHead: true, archived: false },
          { id: "a3", code: "2000", requiresCostHead: false, archived: false },
        ];
      if (path === "cost-heads")
        return [
          {
            id: "h1",
            code: "MAT",
            name: "Materials",
            active: true,
            budget_only: false,
            default_account_id: "a1",
          },
        ];
      return [];
    });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("validates added project rows before sending and converts chosen units to sqft", async () => {
  render(
    <MemoryRouter>
      <ProjectsPage user={user("admin")} />
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(grids.get("projects")?.columns.some((c) => c.headerName === "Area marla")).toBe(true),
  );
  expect(grids.has("projects-new")).toBe(false);
  expect(grids.get("projects")!.rows).toHaveLength(2);
  act(() =>
    grids.get("projects")!.onChange!([{ code: "OK", name: "New", city: "", type: "plots" }]),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Correct the marked");
  expect(vi.mocked(api).mock.calls.filter((c) => c[1] === "POST")).toHaveLength(0);
  act(() =>
    grids.get("projects")!.onChange!([
      { code: "OK", name: "New", city: "Karachi", type: "plots", saleable_area_sqft: "2.25" },
    ]),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      "projects",
      "POST",
      expect.objectContaining({ saleable_area_sqft: "6.75", city: "Karachi" }),
    ),
  );
  fireEvent.click(screen.getByLabelText("Show archived"));
  await waitFor(() => expect(api).toHaveBeenCalledWith("projects?includeArchived=true"));
});
for (const role of ["admin", "accountant", "sales", "construction"] as const)
  it("profile cells apply " + role + " permissions and workbook tabs are enabled", async () => {
    render(
      <MemoryRouter initialEntries={["/projects/p1"]}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectWorkspace user={user(role)} />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Tower" });
    const g = grids.get("project-profile-p1")!;
    for (const key of [
      "city",
      "saleable_area_sqft",
      "cost_allocation_method",
      "revenue_recognition",
    ]) {
      const editable = g.columns.find(c => c.field === key)!.editable;
      if (typeof editable !== "function") throw Error("Expected field-specific editing");
      expect(editable({ data: {} } as unknown as Parameters<typeof editable>[0])).toBe(
        role === "admin" ||
          (role === "accountant" &&
            ["cost_allocation_method", "revenue_recognition"].includes(key)),
      );
    }
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(9);
    tabs.slice(1).forEach((tab) => {
      expect(tab).toBeEnabled();
    });
  });
it("does not rewrite rounded profile display values until a cell actually changes", async () => {
  render(
    <MemoryRouter initialEntries={["/projects/p1"]}>
      <Routes>
        <Route path="/projects/:id" element={<ProjectWorkspace user={user("admin")} />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "Tower" });
  const g = grids.get("project-profile-p1")!;
  const row = g.rows[0];
  expect(row.saleable_area_sqft).toBe("0.333333333333");
  act(() => g.onCellChange!(row, "saleable_area_sqft", row.saleable_area_sqft));
  expect(vi.mocked(api).mock.calls.filter((c) => c[1] === "PATCH")).toHaveLength(0);
  await act(async () => g.onCellChange!({ ...row, saleable_area_sqft: "2.25" }, "saleable_area_sqft", row.saleable_area_sqft));
  expect(api).toHaveBeenCalledWith("projects/p1", "PATCH", { saleable_area_sqft: "6.75" });
});
it("asks for a backward status reason before calling the server", async () => {
  const saved = vi.fn();
  render(<ProjectStatusControl projectId="p1" status="construction" onSaved={saved} />);
  act(() => grids.get("project-status-p1")!.onChange!([{ status: "planning", reason: "" }]));
  expect(screen.getByRole("status")).toHaveTextContent("written reason");
  fireEvent.click(screen.getByRole("button", { name: "Change status" }));
  expect(screen.getByRole("alert")).toHaveTextContent("reason");
  expect(vi.mocked(api).mock.calls.filter((c) => c[1] === "POST")).toHaveLength(0);
  act(() =>
    grids.get("project-status-p1")!.onChange!([{ status: "planning", reason: "Permit revision" }]),
  );
  fireEvent.click(screen.getByRole("button", { name: "Change status" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("projects/p1/status", "POST", {
      status: "planning",
      reason: "Permit revision",
    }),
  );
});
it("offers searchable cost tags, prefills only empty accounts and flags missing WIP tags", async () => {
  render(<VoucherEditor id="new" onSaved={() => {}} />);
  await waitFor(() => expect(api).toHaveBeenCalledWith("cost-heads"));
  await act(async () => {});
  const getLines = () =>
    [...grids.values()].find((g) => g.columns.some((c) => c.field === "cost_head"))!;
  expect(getLines().columns.find((c) => c.field === "cost_head")!.cellEditor).toBe(
    SearchSelectEditor,
  );
  act(() =>
    getLines().onChange!([
      { account: "", project: "P1", debit: "100", credit: "", cost_head: "Materials" },
    ]),
  );
  expect(getLines().rows[0]).toMatchObject({
    account: "1220",
    cost_head: "MAT",
    cost_head_error: "",
  });
  act(() =>
    getLines().onChange!([
      { account: "1230", project: "P1", debit: "100", credit: "", cost_head: "mat" },
    ]),
  );
  expect(getLines().rows[0]).toMatchObject({ account: "1230", cost_head: "MAT" });
  act(() =>
    getLines().onChange!([
      { account: "1220", project: "P1", debit: "100", credit: "", cost_head: "" },
    ]),
  );
  expect(getLines().rows[0].cost_head_error).toMatch(/required/);
});
for (const role of ["admin", "accountant", "sales", "construction"] as const)
  it("shows only authorized menu entries for " + role, () => {
    render(
      <MemoryRouter>
        <Sidebar role={role} onLogout={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Projects" })).toBeInTheDocument();
    const head = screen.queryByRole("link", { name: "Personal Account" });
    if (role === "admin" || role === "accountant")
      expect(head).toHaveAttribute("href", "/bank/personal");
    else expect(head).toBeNull();
  });

it("allows a balanced incomplete draft but disables posting until its WIP line has a head", async () => {
  const fallback = vi.mocked(api).getMockImplementation()!;
  vi.mocked(api).mockImplementation(async (path, ...rest) => {
    if (path === "vouchers/v1")
      return {
        id: "v1",
        date: "2026-10-24",
        type: "JV",
        status: "draft",
        narration: "Test",
        lines: [
          { accountId: "a1", projectId: "p1", costHeadId: null, debit: "10000", credit: "0" },
          { accountId: "a3", projectId: "p1", costHeadId: null, debit: "0", credit: "10000" },
        ],
      };
    return fallback(path, ...rest);
  });
  render(<VoucherEditor id="v1" onSaved={() => {}} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled());
  expect(screen.getByRole("button", { name: "Save and post" })).toBeDisabled();
  const g = [...grids.values()].find((g) => g.columns.some((c) => c.field === "cost_head"))!;
  act(() => g.onChange!(g.rows.map((r, i) => (i === 0 ? { ...r, cost_head: "MAT" } : r))));
  expect(screen.getByRole("button", { name: "Save and post" })).toBeEnabled();
});

it.each([
  [
    "accounts",
    {
      code: "5301",
      name: "Office Costs",
      type: "expense",
      normalBalance: "debit",
      parentId: "",
      isCashBank: false,
    },
    {
      code: "5301",
      name: "Office Costs",
      type: "expense",
      normalBalance: "debit",
      parentId: null,
      isCashBank: false,
    },
  ],
  ["periods", { month: "2026-11-01", locked: false }, { month: "2026-11-01", locked: false }],
  [
    "users",
    { email: "new@example.test", password: "Local-fixture-123!", role: "accountant" },
    { email: "new@example.test", password: "Local-fixture-123!", role: "accountant" },
  ],
] as const)(
  "adds %s in the same sheet using the unchanged API payload",
  async (name, entry, expected) => {
    render(<AccountingPage screen={name} user={user("admin")} />);
    await act(async () => {});
    const g = grids.get(name)!;
    expect(grids.has(name + "-new")).toBe(false);
    expect(g.rows.slice(-1)[0]?._placeholder).toBe(true);
    act(() => g.onChange!([...g.rows.filter((r) => !r._new), { ...entry, _new: true }]));
    expect(grids.get(name)!.rows.slice(-1)[0]?._placeholder).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith(name, "POST", expected));
  },
);
it("keeps existing account identity cells read-only while the last row accepts entry", async () => {
  render(<AccountingPage screen="accounts" user={user("accountant")} />);
  await act(async () => {});
  const column = grids.get("accounts")!.columns.find((c) => c.field === "code")!;
  if (typeof column.editable !== "function") throw Error("Expected row-specific editability");
  expect(
    column.editable({ data: { id: "a1" } } as unknown as Parameters<typeof column.editable>[0]),
  ).toBe(false);
  expect(
    column.editable({ data: { _new: true } } as unknown as Parameters<typeof column.editable>[0]),
  ).toBe(true);
});
it("does not offer new project entry to an accountant", async () => {
  render(
    <MemoryRouter>
      <ProjectsPage user={user("accountant")} />
    </MemoryRouter>,
  );
  await act(async () => {});
  const g = grids.get("projects")!;
  expect(g.newLabel).toBeUndefined();
  expect(g.onChange).toBeUndefined();
  expect(g.rows.some((r) => r._new)).toBe(false);
});
