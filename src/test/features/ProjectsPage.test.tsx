import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectsPage } from "@/features/projects/pages/ProjectsPage";
import { listProjects } from "@/data/repositories/projectsRepository";

vi.mock("@/data/repositories/projectsRepository", () => ({
  listProjects: vi.fn(), createProject: vi.fn(),
  CreateProjectSchema: { parse: vi.fn() },
}));

describe("ProjectsPage", () => {
  beforeEach(() => {
    vi.mocked(listProjects).mockResolvedValue([{
      id: "11111111-1111-4111-8111-111111111111", name: "Baloch Residency",
      code: "BR-01", location: "Quetta", status: "planning", start_date: null,
      description: null, archived: 0, custom: "{}", created_at: "2026-09-22",
      updated_at: "2026-09-22",
    }]);
  });

  it("shows searchable project cards that link to their detail page", async () => {
    render(<MemoryRouter><ProjectsPage /></MemoryRouter>);
    const card = await screen.findByRole("link", { name: /Baloch Residency/i });
    expect(card).toHaveAttribute("href", "/projects/11111111-1111-4111-8111-111111111111");
    fireEvent.click(screen.getByText("Search & filter projects"));
    fireEvent.change(screen.getByRole("textbox", { name: "Search projects" }),
      { target: { value: "unknown" } });
    await waitFor(() => expect(screen.getByText("No projects match your search.")).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /Baloch Residency/i })).not.toBeInTheDocument();
  });
  it("shows distinct project stages and keeps paused projects out of the active count", async () => {
    const base = (await vi.mocked(listProjects)())[0];
    vi.mocked(listProjects).mockResolvedValue([
      {...base, id: "planning", name: "Planning project", status: "planning"},
      {...base, id: "building", name: "Building project", status: "under construction"},
      {...base, id: "done", name: "Finished project", status: "completed"},
      {...base, id: "paused", name: "Paused project", status: "on hold"},
    ]);
    render(<MemoryRouter><ProjectsPage /></MemoryRouter>);
    const building = await screen.findByRole("link", { name: /Building project/ });
    expect(building).toHaveTextContent("Under construction");
    expect(building).toHaveTextContent("Stage 3 of 4");
    const paused = screen.getByRole("link", { name: /Paused project/ });
    expect(paused).toHaveTextContent("Work is paused");
    expect(paused.querySelector('[aria-current="step"]')).toBeNull();
    const active = screen.getByText("In progress").parentElement!;
    expect(active.querySelector('strong')).toHaveTextContent('2');
    expect(screen.getByRole('link', {name:/Finished project/})).toHaveTextContent('Stage 4 of 4');
  });

});
