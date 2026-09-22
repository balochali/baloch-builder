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
    fireEvent.change(screen.getByRole("textbox", { name: "Search projects" }),
      { target: { value: "unknown" } });
    await waitFor(() => expect(screen.getByText("No projects match your search.")).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /Baloch Residency/i })).not.toBeInTheDocument();
  });
});
