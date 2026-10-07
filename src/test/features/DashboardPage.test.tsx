import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "@/features/dashboard/pages/DashboardPage";
import { listProjects } from "@/data/repositories/projectsRepository";
import { listContacts } from "@/data/repositories/contactsRepository";
import {
  listAllProjectPartners,
  listAllPartnerContributions,
} from "@/data/repositories/projectPartnersRepository";
import { listPersonalExpenses } from "@/data/repositories/personalExpenseRepository";
import { listUdhaars } from "@/data/repositories/udhaarRepository";
import type { Contact, Project, Transaction } from "@/domain/types";
import type { PartnerOverviewRow } from "@/data/repositories/projectPartnersRepository";
import type { PersonalExpense } from "@/data/repositories/personalExpenseRepository";
import type { Udhaar } from "@/data/repositories/udhaarRepository";

vi.mock("@/data/repositories/projectsRepository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/repositories/projectsRepository")>()),
  listProjects: vi.fn(),
}));
vi.mock("@/data/repositories/bankRepository", () => ({
  listBankEntries: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/data/repositories/contactsRepository", () => ({ listContacts: vi.fn() }));
vi.mock("@/data/repositories/projectPartnersRepository", () => ({
  listAllProjectPartners: vi.fn(),
  listAllPartnerContributions: vi.fn(),
}));
vi.mock("@/data/repositories/personalExpenseRepository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/repositories/personalExpenseRepository")>()),
  listPersonalExpenses: vi.fn(),
}));
vi.mock("@/data/repositories/udhaarRepository", () => ({ listUdhaars: vi.fn() }));

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.mocked(listProjects).mockResolvedValue([
      {
        id: "project-1",
        name: "Baloch Residency",
        location: "Karachi",
        status: "planning",
      } as Project,
    ]);
    vi.mocked(listContacts).mockResolvedValue([{ id: "contact-1", name: "Ali" } as Contact]);
    vi.mocked(listAllProjectPartners).mockResolvedValue([
      { partner_id: "partner-1" } as PartnerOverviewRow,
    ]);
    vi.mocked(listAllPartnerContributions).mockResolvedValue([
      { project_id: "project-1", date: "2026-09-15", amount: 500_000 } as Transaction,
    ]);
    vi.mocked(listPersonalExpenses).mockResolvedValue([
      { category: "car", purchase_date: "2026-08-10", amount: 200_000 } as PersonalExpense,
    ]);
    vi.mocked(listUdhaars).mockResolvedValue([
      {
        id: "loan-1",
        borrower_name: "Bilal",
        amount: 100_000,
        paid_amount: 30_000,
        due_date: null,
      } as Udhaar,
    ]);
  });

  it("summarizes saved modules and shows the correct chart values", async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Your business at a glance" }),
    ).toBeInTheDocument();
    expect((await screen.findAllByText("Rs 5 lakh")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rs 70,000").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Baloch Residency/ })).toHaveAttribute(
      "href",
      "/projects/project-1",
    );
    expect(
      screen.queryByRole("heading", { name: "Money through the months" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Projects/ }));
    expect(
      screen.getByRole("heading", { name: "Partner payments by project" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Udhaar/ }));
    expect(
      screen.getByRole("img", { name: "Rs 30,000 paid back out of Rs 100,000 lent" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Money/ }));
    expect(await screen.findByText("No payments in this selection")).toBeInTheDocument();
  });

  it("does not display a failed section as a real zero", async () => {
    vi.mocked(listUdhaars).mockRejectedValue(new Error("database unavailable"));
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Credit / Udhaar");
    fireEvent.click(screen.getByRole("tab", { name: /Udhaar/ }));
    expect(screen.getByText("Udhaar chart unavailable right now.")).toBeInTheDocument();
  });

  it("includes projects without a status in the stage breakdown", async () => {
    vi.mocked(listProjects).mockResolvedValue([
      { id: "planned", name: "Planned building", status: "planning" } as Project,
      { id: "unclassified", name: "New building", status: null } as Project,
    ]);
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Your business at a glance" });
    fireEvent.click(screen.getByRole("tab", { name: /Projects/ }));
    expect(
      screen.getByRole("img", {
        name: /Planning: 1;.*Other status: 1/,
      }),
    ).toBeInTheDocument();
  });

  it("shows helpful empty states in each dashboard view", async () => {
    vi.mocked(listProjects).mockResolvedValue([]);
    vi.mocked(listContacts).mockResolvedValue([]);
    vi.mocked(listAllProjectPartners).mockResolvedValue([]);
    vi.mocked(listAllPartnerContributions).mockResolvedValue([]);
    vi.mocked(listPersonalExpenses).mockResolvedValue([]);
    vi.mocked(listUdhaars).mockResolvedValue([]);
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText("Your projects will appear here after you add them."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Projects/ }));
    expect(screen.getByRole("link", { name: "Add your first project" })).toHaveAttribute(
      "href",
      "/projects",
    );
    fireEvent.click(screen.getByRole("tab", { name: /Money/ }));
    expect(await screen.findByText("No payments in this selection")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Udhaar/ }));
    expect(screen.getByText("No outstanding Udhaar balances.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("supports keyboard tab navigation and shows only the selected view", async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Your business at a glance" });
    const overviewTab = screen.getByRole("tab", { name: /Overview/ });
    fireEvent.keyDown(overviewTab, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /Projects/ })).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "dashboard-panel-projects");
    expect(screen.queryByRole("heading", { name: "Recent projects" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("tab", { name: /Projects/ }), { key: "End" });
    expect(screen.getByRole("tab", { name: /Udhaar/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByRole("tab", { name: /Udhaar/ }), { key: "Home" });
    expect(overviewTab).toHaveAttribute("aria-selected", "true");
  });
});
