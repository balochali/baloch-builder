import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectEntry } from "@/features/accounting/ProjectEntry";
import { projectSummary } from "@/features/accounting/projectSummary";
import { api } from "@/data/api";
vi.mock("@/data/api", () => ({ api: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("creates a project with converted areas and opens the saved record", async () => {
  vi.mocked(api).mockResolvedValue({ id: "saved-project" });
  const onCreated = vi.fn();
  render(
    <ProjectEntry
      settings={{ areaDisplayUnit: "marla", marlaSqft: "272.25" }}
      users={[]}
      onCreated={onCreated}
      onCancel={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Project Code"), { target: { value: "BB-001" } });
  fireEvent.change(screen.getByLabelText("Project Name"), { target: { value: "Heights" } });
  fireEvent.change(screen.getByLabelText("City"), { target: { value: "Karachi" } });
  fireEvent.change(screen.getByLabelText("Land Area (marla)"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Create & Open Project" }));
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: "saved-project" }));
  expect(api).toHaveBeenCalledWith(
    "projects",
    "POST",
    expect.objectContaining({ code: "BB-001", name: "Heights", land_area_sqft: "544.5" }),
  );
});
it("keeps entries on a failed save and does not navigate", async () => {
  vi.mocked(api).mockRejectedValue(new Error("Project code already exists"));
  const onCreated = vi.fn();
  render(
    <ProjectEntry
      settings={{ areaDisplayUnit: "sqft", marlaSqft: "272.25" }}
      users={[]}
      onCreated={onCreated}
      onCancel={vi.fn()}
    />,
  );
  for (const [label, value] of [
    ["Project Code", "BB-001"],
    ["Project Name", "Heights"],
    ["City", "Karachi"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Create & Open Project" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Project code already exists");
  expect(screen.getByLabelText("Project Name")).toHaveValue("Heights");
  expect(onCreated).not.toHaveBeenCalled();
});
it("totals decimal areas exactly and separates drafts and invalid values", () => {
  expect(
    projectSummary([
      { saleable_area_sqft: "0.1" },
      { saleable_area_sqft: "0.2", archived: true },
      { saleable_area_sqft: "0.3", _new: true },
      { saleable_area_sqft: "bad", _new: true },
    ]),
  ).toEqual({ count: 2, active: 1, drafts: 2, area: "0.6", excluded: 1 });
  expect(projectSummary([]).area).toBe("0");
});
it("converts square yards without changing workspace units", async () => {
  vi.mocked(api).mockResolvedValue({ id: "yards-project" });
  render(
    <ProjectEntry
      settings={{ areaDisplayUnit: "sqft", marlaSqft: "272.25" }}
      users={[]}
      onCreated={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByRole("combobox", { name: /Area Unit/ }), {
    target: { value: "sqyd" },
  });
  for (const [label, value] of [
    ["Project Code", "BB-002"],
    ["Project Name", "Yard Project"],
    ["City", "Karachi"],
    ["Land Area (sqyd)", "120.5"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Create & Open Project" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      "projects",
      "POST",
      expect.objectContaining({ land_area_sqft: "1084.5" }),
    ),
  );
});
