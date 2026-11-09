import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  emptyBasics,
  emptyBudget,
  emptyBuilding,
  type LandParcel,
  type Project,
} from "@baloch/shared";
import { ProjectBuilding } from "@/features/projects/ProjectBuilding";
import { ProjectLand } from "@/features/projects/ProjectLand";
import { totalLandArea } from "@/features/projects/projectSite";
import { api } from "@/data/api";

vi.mock("@/data/api", () => ({ api: vi.fn() }));
const project: Project = {
  ...emptyBasics,
  ...emptyBudget,
  id: "P-001",
  name: "Baloch Heights",
  draft: false,
  createdAt: "",
  updatedAt: "",
};
function parcel(id: string, acquisitionType: LandParcel["acquisitionType"]): LandParcel {
  return {
    id,
    name: id,
    address: "",
    mapLink: "",
    area: { value: 1, unit: "Kanal" },
    acquisitionType,
    stage: "Identified",
    agreementRef: "",
    agreementDate: "",
    facing: "",
    notes: "",
    createdAt: "",
    updatedAt: "",
    attachments: [],
  };
}

it("sums purchased and contributed parcels and changes the display unit", () => {
  const parcels = [parcel("Plot 1", "purchase"), parcel("Plot 2", "partner_contribution")];
  expect(totalLandArea(parcels, "Marla")).toBe(40);
  expect(totalLandArea(parcels, "Sq ft")).toBe(10890);
  expect(totalLandArea(parcels, "Sq yard")).toBe(1210);
  expect(totalLandArea(parcels, "Acre")).toBe(0.25);
  render(
    <ProjectLand
      project={project}
      site={{ parcels, building: emptyBuilding(project.name), partners: [], sellers: [] }}
      manage={false}
      ledger={false}
      onSite={vi.fn()}
    />,
  );
  expect(screen.getByText("40 Marla")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Display unit"), { target: { value: "Kanal" } });
  expect(screen.getByText("2 Kanal")).toBeInTheDocument();
});

it("pastes unit types, calculates the building summary and previews sync before writing", async () => {
  const building = {
    ...emptyBuilding(project.name),
    buildingType: "Flats + shops (mixed)" as const,
  };
  vi.mocked(api).mockImplementation(async (url, method, body) => {
    if (url.endsWith("/building") && method === "PUT") return body;
    if (url.endsWith("/sync-sales"))
      return {
        token: "preview",
        changes: [{ before: null, after: { name: "2-bed flat", count: 10, area: 900 } }],
      };
    throw new Error("Unexpected request");
  });
  const onSynced = vi.fn();
  render(
    <ProjectBuilding
      project={project}
      site={{ building, parcels: [], partners: [], sellers: [] }}
      manage
      onSite={vi.fn()}
      onSynced={onSynced}
    />,
  );
  fireEvent.click(screen.getByText("Building details"));
  fireEvent.click(screen.getByText("Floor plan"));
  fireEvent.change(screen.getByLabelText(/Floors above ground/), { target: { value: "5" } });
  expect(screen.getByRole("textbox", { name: "Floor label, row 5" })).toHaveValue("4th");
  const section = screen.getByRole("heading", { name: "Unit types" }).closest("section")!;
  const units = within(section);
  fireEvent.click(units.getByRole("button", { name: "Add row" }));
  const clipboard = [
    ["Flat", "2-bed flat", "10", "900"],
    ["Flat", "3-bed flat", "5", "1300"],
    ["Shop", "Shop", "4", "300"],
  ]
    .map((row) => row.join(String.fromCharCode(9)))
    .join(String.fromCharCode(10));
  fireEvent.paste(units.getByRole("textbox", { name: "Category, row 1" }), {
    clipboardData: { getData: () => clipboard },
  });
  expect(screen.getByText("16,700 sq ft")).toBeInTheDocument();
  expect(units.getByRole("textbox", { name: "Bedrooms, row 3" })).toHaveAttribute("readonly");
  fireEvent.click(units.getByRole("button", { name: "Sync to feasibility sales" }));
  const dialog = await screen.findByRole("dialog", { name: "Review feasibility sales changes" });
  expect(onSynced).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirm sync" }));
  expect(await screen.findByText(/Feasibility sales updated/)).toBeInTheDocument();
  expect(onSynced).toHaveBeenCalledOnce();
});
