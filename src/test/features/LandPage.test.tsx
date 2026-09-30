import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LandPage } from "@/features/land/pages/LandPage";
import { listProjects } from "@/data/repositories/projectsRepository";
import { getProjectLand } from "@/data/repositories/projectStageRepository";
import type { Project } from "@/domain/types";

vi.mock("@/data/repositories/projectsRepository", () => ({ listProjects: vi.fn() }));
vi.mock("@/data/repositories/projectStageRepository", () => ({ getProjectLand: vi.fn() }));

describe("LandPage", () => {
  beforeEach(() => {
    vi.mocked(listProjects).mockResolvedValue([
      { id: "p1", name: "Residency" },
      { id: "p2", name: "Garden" },
    ] as Project[]);
    vi.mocked(getProjectLand).mockImplementation(async (id) =>
      id === "p1"
        ? {
            id: "land1",
            title: "Corner plot",
            location: "Quetta",
            purchase_date: "2026-09-01",
            area_value: 500,
            area_unit: "sqyd",
            price: 1500000,
            seller_name: "Seller name",
            notes: "Near main road",
          }
        : null,
    );
  });
  it("shows existing acquired land, filters it, and links to its project", async () => {
    render(
      <MemoryRouter>
        <LandPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Corner plot" })).toBeInTheDocument();
    expect(screen.getByText("Rs 1,500,000")).toBeInTheDocument();
    expect(screen.getByText("500 sqyd")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View project" })).toHaveAttribute(
      "href",
      "/projects/p1",
    );
    fireEvent.change(screen.getByLabelText("Search land records"), {
      target: { value: "missing" },
    });
    expect(screen.getByText("No land records match these filters.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getByRole("heading", { name: "Corner plot" })).toBeInTheDocument();
  });
  it("reports partial loading failures", async () => {
    vi.mocked(getProjectLand).mockRejectedValueOnce(new Error("unavailable"));
    render(
      <MemoryRouter>
        <LandPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Some project land records could not be loaded",
    );
  });
});
