import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  buildProjectReport,
  reportSections,
  type ProjectReportData,
} from "@/features/projects/components/projectReport";
import { ProjectPrintButton } from "@/features/projects/components/ProjectPrintButton";
import { listProjectSales } from "@/data/repositories/projectSalesRepository";
vi.mock("@/data/repositories/projectSalesRepository", () => ({
  listProjectSales: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/data/repositories/projectPayoutsRepository", () => ({
  listPartnerPayouts: vi.fn().mockResolvedValue([]),
}));
const data: ProjectReportData = {
  project: {
    id: "test",
    name: "Residency <script>alert(1)</script>",
    code: "BB-1",
    location: "Karachi",
    description: "A residential development",
    status: "under construction",
    start_date: "2026-01-01",
    created_at: "",
    updated_at: "",
    archived: 0,
    custom: "{}",
  },
  building: null,
  land: null,
  partners: [],
  contributions: [],
  estimates: [],
  costs: [],
  sales: [],
  payouts: [],
};
describe("project print reports", () => {
  it("includes only selected sections and escapes project text", () => {
    const html = buildProjectReport(data, ["sales"]);
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(Array.from(doc.querySelectorAll("h2")).map((h) => h.textContent)).toEqual([
      "01 / Sales",
    ]);
    expect(doc.querySelector("script")).toBeNull();
    expect(doc.querySelector("h1")?.textContent).toBe(data.project.name);
    expect(doc.body.textContent).not.toContain("A residential development");
  });
  it("prints all rows instead of the screen pagination and provides page-break rules", () => {
    const costs = Array.from({ length: 55 }, (_, i) => ({
      id: String(i),
      date: "2026-10-01",
      amount: 100,
      direction: "out" as const,
      type: "construction_cost",
      method: "cash",
      reference: null,
      description: `Cost item ${i}`,
      project_id: "test",
      land_id: null,
      partner_id: null,
      contact_id: null,
      receipt_document_id: null,
      created_at: "",
      updated_at: "",
      archived: 0 as const,
      custom: "{}",
    }));
    const html = buildProjectReport({ ...data, costs }, ["costs", "profit"]);
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelectorAll("tbody tr")).toHaveLength(55);
    expect(doc.body.textContent).toContain("Cost item 54");
    expect(doc.body.textContent).toContain("5,500");
    expect(html).toContain("break-before:page");
    expect(html).toContain("table-header-group");
  });
  it("renders all seven sections with empty records", () => {
    const doc = new DOMParser().parseFromString(
      buildProjectReport(
        data,
        reportSections.map((s) => s.id),
      ),
      "text/html",
    );
    expect(doc.querySelectorAll("section")).toHaveLength(7);
    expect(doc.body.textContent).toContain("No building plan has been recorded");
    expect(doc.body.textContent).toContain("not finalized cash profit");
  });
  it("requires a selection and prepares only the requested tabs", async () => {
    vi.mocked(listProjectSales).mockClear();
    render(<ProjectPrintButton data={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Print project" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.getByRole("button", { name: "Preview report" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Costs/ }));
    fireEvent.click(screen.getByRole("button", { name: "Preview report" }));
    const frame = await screen.findByTitle("Project report preview");
    expect(frame.getAttribute("srcdoc")).toContain("01 / Costs");
    expect(listProjectSales).not.toHaveBeenCalled();
    fireEvent.load(frame);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Print / Save PDF" })).toBeEnabled(),
    );
  });
  it("shows a preparation error without opening an incomplete report", async () => {
    vi.mocked(listProjectSales).mockRejectedValueOnce(new Error("database unavailable"));
    render(<ProjectPrintButton data={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Print project" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not prepare");
    expect(screen.queryByTitle("Project report preview")).not.toBeInTheDocument();
  });
});

