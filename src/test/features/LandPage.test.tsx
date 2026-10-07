import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LandPage } from "@/features/land/pages/LandPage";
import { listProjects } from "@/data/repositories/projectsRepository";
import { getProjectLand } from "@/data/repositories/projectStageRepository";
import type { Project } from "@/domain/types";

vi.mock("@/data/repositories/documentsRepository", () => ({ listLandDocuments: vi.fn().mockResolvedValue([{ id: "doc1", title: "Ownership.pdf", mime: "application/pdf", doc_type: "land_image", file_path: "test.pdf" }, { id: "doc2", title: "Cash receipt.png", mime: "image/png", doc_type: "land_payment_receipt" }]), openDocument: vi.fn(), readDocumentImage: vi.fn() }));

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
    fireEvent.click(screen.getByText("Search & filter land"));
    fireEvent.change(screen.getByLabelText("Search land records"), {
      target: { value: "missing" },
    });
    expect(screen.getByText("No land records match these filters.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getByRole("heading", { name: "Corner plot" })).toBeInTheDocument();
  });
  it("opens land documents separately from payment receipts", async () => {
    render(<MemoryRouter><LandPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Corner plot" }));
    fireEvent.click(screen.getByRole("button", { name: "Land documents" }));
    expect(await screen.findByText("Ownership.pdf")).toBeInTheDocument();
    expect(screen.queryByText("Cash receipt.png")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Payment & receipts" }));
    expect(await screen.findByText("Cash receipt.png")).toBeInTheDocument();
    expect(screen.queryByText("Ownership.pdf")).not.toBeInTheDocument();
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
