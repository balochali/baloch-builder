import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { Grid } from "@/features/accounting/Grid";
import { WorkspaceSection } from "@/features/accounting/WorkspaceSection";
import { api } from "@/data/api";
vi.mock("@/data/api", () => ({ api: vi.fn() }));
vi.mock("@/features/accounting/Grid", () => ({
  Grid: (props: ComponentProps<typeof Grid>) => (
    <div>
      {props.rows.map((row) => (
        <p key={String(row.id)}>{String(row.narration ?? row.name)}</p>
      ))}
      {props.summary?.(props.rows)}
    </div>
  ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("shows no unclassified bank transactions until an account is selected", async () => {
  vi.mocked(api).mockImplementation(async (path) =>
    path === "accounts"
      ? [
          { id: "a", code: "1000", name: "Bank One", isCashBank: true },
          { id: "b", code: "5000", name: "Expense", isCashBank: false },
        ]
      : [
          { id: "l1", code: "1000", narration: "Selected receipt", debit: "10000", credit: "0" },
          { id: "l2", code: "2000", narration: "Unrelated receipt", debit: "99900", credit: "0" },
        ],
  );
  render(
    <MemoryRouter>
      <WorkspaceSection section="bank/personal" />
    </MemoryRouter>,
  );
  await screen.findByRole("option", { name: "1000 — Bank One" });
  expect(screen.queryByRole("option", { name: "5000 — Expense" })).not.toBeInTheDocument();
  expect(screen.queryByText("Selected receipt")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "1000" } });
  expect(await screen.findByText("Selected receipt")).toBeInTheDocument();
  expect(screen.queryByText("Unrelated receipt")).not.toBeInTheDocument();
  expect(screen.getAllByText("Rs 100.00")).toHaveLength(2);
  expect(vi.mocked(api).mock.calls.every((call) => call[1] === undefined)).toBe(true);
});
it("reads lands from authorized project records", async () => {
  vi.mocked(api).mockResolvedValue([{ id: "p1", name: "Heights", land_area_sqft: "100" }]);
  render(
    <MemoryRouter>
      <WorkspaceSection section="land" />
    </MemoryRouter>,
  );
  expect(await screen.findByText("Heights")).toBeInTheDocument();
  expect(api).toHaveBeenCalledWith("projects?includeArchived=false");
});
