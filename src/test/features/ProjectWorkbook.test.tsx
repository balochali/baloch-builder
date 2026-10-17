import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkbookEditor } from "@/features/sheet/ProjectWorkbook";
import { parseClipboard } from "@/features/sheet/SheetGrid";
import type { ProjectSheet } from "@/features/sheet/projectSheets";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
function fixture() {
  const records = [{ id: "saved-1", cells: { name: "Existing" } }];
  const sheet: ProjectSheet = {
    id: "test",
    label: "Test",
    help: "Test records",
    columns: [{ key: "name", label: "Name", width: 160 }],
    load: vi.fn(async () => records.map((r) => ({ ...r, cells: { ...r.cells } }))),
    save: vi.fn(async (cells, id) => {
      if (cells.name === "Invalid") throw new Error("Fix this name");
      const savedId = id ?? `saved-${records.length + 1}`;
      const existing = records.find((r) => r.id === savedId);
      if (existing) existing.cells = { name: cells.name };
      else records.push({ id: savedId, cells: { name: cells.name } });
      return savedId;
    }),
  };
  const props = { sheet, storageKey: "test-sheet", onSaved: vi.fn(), onBusy: vi.fn() };
  return { records, sheet, props };
}
it("updates and adds records in Strict Mode, retains saved rows, and never resubmits unchanged rows", async () => {
  const { sheet, props } = fixture();
  render(
    <StrictMode>
      <WorkbookEditor {...props} />
    </StrictMode>,
  );
  fireEvent.change(await screen.findByLabelText("Name row 1"), { target: { value: "Edited" } });
  fireEvent.change(screen.getByLabelText("Name row 2"), { target: { value: "New" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes (2)" }));
  await screen.findByText(/2 rows saved/);
  expect(sheet.save).toHaveBeenCalledWith({ name: "Edited" }, "saved-1");
  expect(sheet.save).toHaveBeenCalledWith({ name: "New" }, undefined);
  expect(screen.getByLabelText("Name row 1")).toHaveValue("Edited");
  expect(screen.getByLabelText("Name row 2")).toHaveValue("New");
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  expect(localStorage.getItem("test-sheet")).toBeNull();
});
it("keeps failed rows editable without retrying successful inserts", async () => {
  const { sheet, props } = fixture();
  render(<WorkbookEditor {...props} />);
  await screen.findByLabelText("Name row 1");
  fireEvent.change(screen.getByLabelText("Name row 2"), { target: { value: "New" } });
  fireEvent.change(screen.getByLabelText("Name row 3"), { target: { value: "Invalid" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes (2)" }));
  await screen.findByText("Fix this name");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save changes (1)" })).toBeEnabled(),
  );
  fireEvent.change(screen.getByLabelText("Name row 3"), { target: { value: "Corrected" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes (1)" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled());
  expect(sheet.save).toHaveBeenCalledTimes(3);
});
it("checkpoints a completed save after unmount and waits before reopening that worksheet", async () => {
  const { sheet, props } = fixture();
  const original = sheet.save;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  sheet.save = vi.fn(async (c, id) => {
    await gate;
    return original(c, id);
  });
  const view = render(<WorkbookEditor {...props} />);
  await screen.findByLabelText("Name row 1");
  fireEvent.change(screen.getByLabelText("Name row 2"), { target: { value: "New" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes (1)" }));
  view.unmount();
  render(<WorkbookEditor {...props} />);
  expect(screen.getByText("Loading records…")).toBeInTheDocument();
  release();
  await screen.findByLabelText("Name row 2");
  expect(screen.getByLabelText("Name row 2")).toHaveValue("New");
  expect(localStorage.getItem("test-sheet")).toBeNull();
  expect(sheet.save).toHaveBeenCalledTimes(1);
});
it("refuses to overwrite a saved record changed elsewhere", async () => {
  const { sheet, props, records } = fixture();
  render(<WorkbookEditor {...props} />);
  fireEvent.change(await screen.findByLabelText("Name row 1"), { target: { value: "My edit" } });
  records[0].cells = { name: "Other edit" };
  fireEvent.click(screen.getByRole("button", { name: "Save changes (1)" }));
  await screen.findByText(/This record changed elsewhere/);
  expect(sheet.save).not.toHaveBeenCalled();
});
it("keeps drafts separate for different projects", async () => {
  const { props } = fixture();
  const view = render(<WorkbookEditor {...props} storageKey="project-a" />);
  fireEvent.change(await screen.findByLabelText("Name row 1"), { target: { value: "Unsaved A" } });
  view.unmount();
  render(<WorkbookEditor {...props} storageKey="project-b" />);
  expect(await screen.findByLabelText("Name row 1")).toHaveValue("Existing");
  expect(localStorage.getItem("project-a")).toContain("Unsaved A");
});
it("parses quoted Excel cells containing line breaks, tabs and escaped quotes", () => {
  expect(parseClipboard('Alpha\t"line one\nline two"\t"A\tB"\nBeta\t"said ""hello"""\t3')).toEqual([
    ["Alpha", "line one\nline two", "A\tB"],
    ["Beta", 'said "hello"', "3"],
  ]);
});
