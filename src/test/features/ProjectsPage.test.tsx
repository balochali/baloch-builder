import { MemoryRouter, Route, Routes } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectsPage } from "@/features/projects/ProjectsPage";
import { api } from "@/data/api";
vi.mock("@/data/api", () => ({ api: vi.fn() }));
afterEach(() => vi.resetAllMocks());
it("lists saved projects and saves the trimmed name as a new card", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce([{ id: "1", name: "Existing Heights", created_at: "2026-11-06" }])
    .mockResolvedValueOnce({ id: "P-002" })
    .mockResolvedValueOnce({ id: "P-002", name: "Baloch Heights", draft: true });
  render(
    <MemoryRouter>
      <ProjectsPage role="admin" />
    </MemoryRouter>,
  );
  expect(await screen.findByRole("heading", { name: "Existing Heights" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "New project" }));
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Project name"), {
    target: { value: "  Baloch Heights  " },
  });
  await waitFor(() => expect(screen.getByLabelText("Project ID")).toHaveValue("P-002"));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(await screen.findByRole("heading", { name: "Project basics" })).toBeInTheDocument();
  expect(api).toHaveBeenLastCalledWith("projects", "POST", { id: "P-002", name: "Baloch Heights" });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("link", { name: /Baloch Heights/ })).toHaveAttribute(
    "href",
    "/projects/P-002",
  );
});
it("preserves the name and keeps the modal open after a failed save", async () => {
  vi.mocked(api)
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce({ id: "P-002" })
    .mockRejectedValueOnce(new Error("Unable to save"));
  render(
    <MemoryRouter>
      <ProjectsPage role="admin" />
    </MemoryRouter>,
  );
  await screen.findByText("A blank canvas for your next landmark.");
  fireEvent.click(screen.getByRole("button", { name: "New project" }));
  fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "New Tower" } });
  await waitFor(() => expect(screen.getByLabelText("Project ID")).toHaveValue("P-002"));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save");
  expect(screen.getByLabelText("Project name")).toHaveValue("New Tower");
});
it("allows construction users to view projects without creating them", async () => {
  vi.mocked(api).mockResolvedValueOnce([]);
  render(
    <MemoryRouter>
      <ProjectsPage role="construction" />
    </MemoryRouter>,
  );
  await screen.findByText("A blank canvas for your next landmark.");
  expect(screen.queryByRole("button", { name: "New project" })).not.toBeInTheDocument();
});

it("updates the draft at each step and opens its detail route after creation", async () => {
  const draft = { id: "P-003", name: "Harbour Plaza", draft: true };
  vi.mocked(api).mockImplementation(async (url, method, data) => {
    if (url === "projects/reserve-id") return { id: draft.id };
    if (url === "projects/partner-options") return [];
    if (method === "POST") return draft;
    if (method === "PATCH")
      return { ...draft, draft: (data as { step: string }).step !== "finish" };
    return [];
  });
  render(
    <MemoryRouter initialEntries={["/projects"]}>
      <Routes>
        <Route path="/projects" element={<ProjectsPage role="admin" />} />
        <Route path="/projects/P-003" element={<h1>Harbour Plaza details</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByText("A blank canvas for your next landmark.");
  fireEvent.click(screen.getByRole("button", { name: "New project" }));
  await waitFor(() => expect(screen.getByLabelText("Project ID")).toHaveValue(draft.id));
  fireEvent.change(screen.getByLabelText("Project name"), { target: { value: draft.name } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.change(await screen.findByLabelText("City"), { target: { value: "Karachi" } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("heading", { name: "Partners & budget" });
  expect(api).toHaveBeenCalledWith("projects/P-003", "PATCH", {
    step: "basics",
    basics: expect.objectContaining({ city: "Karachi", status: "Planning" }),
  });
  fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
  expect(await screen.findByRole("heading", { name: "Harbour Plaza details" })).toBeInTheDocument();
  expect(api).toHaveBeenCalledWith("projects/P-003", "PATCH", {
    step: "finish",
    budget: { estimatedBudget: null, partners: [] },
  });
});
