import type { SheetColumn, SheetRow } from "./SheetGrid";
import {
  parseAccount,
  parseAreaUnit,
  parseDate,
  parseDecimal,
  parseFloor,
  parseKind,
  parseMethod,
  parseWhole,
} from "./sheetParsing";
import { getProjectById } from "@/data/repositories/projectsRepository";
import { addProjectSale, listProjectSales } from "@/data/repositories/projectSalesRepository";
import {
  addActualProjectCost,
  addConstructionCost,
  addProjectEstimate,
  listActualProjectCosts,
  listProjectEstimates,
  updateProjectEstimate,
} from "@/data/repositories/projectFinanceRepository";
import {
  addPartnerContribution,
  addProjectPartner,
  emptyPaymentDetails,
  listPartnerContributions,
  listProjectPartners,
  readPaymentDetails,
  updateProjectPartner,
} from "@/data/repositories/projectPartnersRepository";
import { addPartnerPayout, listPartnerPayouts } from "@/data/repositories/projectPayoutsRepository";
import {
  decodeBuildingSpaces,
  decodeFloorLayout,
  getProjectBuildingDetails,
  saveProjectBuildingDetails,
  type BuildingDetailsInput,
  type BuildingSpace,
} from "@/data/repositories/projectBuildingRepository";
import { getProjectLand, saveProjectStage } from "@/data/repositories/projectStageRepository";
import {
  listDocuments,
  openDocument,
  saveProjectDocument,
} from "@/data/repositories/documentsRepository";
import {
  updateSheetContribution,
  updateSheetCost,
  updateSheetLand,
  updateSheetPayout,
  updateSheetProject,
  updateSheetSale,
  updateSheetDocument,
} from "@/data/repositories/projectSheetRepository";
import type { Transaction } from "@/domain/types";

export interface ProjectSheet {
  id: string;
  label: string;
  help: string;
  columns: SheetColumn[];
  singleton?: boolean;
  readOnly?: boolean;
  allowAdd?: boolean;
  upload?: (file: File) => Promise<void>;
  open?: (cells: Record<string, string>) => Promise<void>;
  load: () => Promise<SheetRow[]>;
  save: (cells: Record<string, string>, existingId?: string) => Promise<string>;
}
const col = (key: string, label: string, extra: Partial<SheetColumn> = {}): SheetColumn => ({
  key,
  label,
  width: 160,
  ...extra,
});
const num = (key: string, label: string, extra: Partial<SheetColumn> = {}) =>
  col(key, label, { kind: "number", ...extra });
const money = (key: string, label: string) => num(key, label, { sum: true });
const date = (key: string, label: string) =>
  col(key, label, { kind: "date", placeholder: "DD/MM/YYYY" });
const row = (id: string, values: Record<string, unknown>): SheetRow => ({
  id,
  cells: Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, v == null ? "" : String(v)]),
  ),
});
const whole = (c: Record<string, string>, key: string) =>
  parseWhole(key.replace(/_/g, " "), c[key] ?? "");
const decimal = (c: Record<string, string>, key: string) =>
  parseDecimal(key.replace(/_/g, " "), c[key] ?? "");
const iso = (value: string | undefined, optional = false) => {
  if (!value?.trim() && optional) return "";
  const parsed = parseDate(value ?? "");
  if (!parsed) throw new Error("Enter a valid date, for example 14/10/2026");
  return parsed;
};
const json = (value: string): Record<string, unknown> => {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};
const paymentColumns = [
  col("account_key", "Account", { options: ["personal", "builder"], required: true }),
  col("method", "Method", {
    options: ["cash", "bank", "digital", "cheque", "other"],
    placeholder: "cash",
  }),
  col("reference", "Reference"),
  ...Object.keys(emptyPaymentDetails).map((k) =>
    k === "cheque_date" ? date(k, "Cheque date") : col(k, k.replace(/_/g, " ")),
  ),
];
function payment(c: Record<string, string>) {
  return {
    account_key: parseAccount(c.account_key ?? ""),
    method: parseMethod(c.method ?? ""),
    reference: c.reference ?? "",
    payment_details: {
      ...emptyPaymentDetails,
      ...Object.fromEntries(
        Object.keys(emptyPaymentDetails).map((k) => [
          k,
          k === "cheque_date" ? iso(c[k], true) : (c[k] ?? ""),
        ]),
      ),
    },
  };
}
const transactionRow = (t: Transaction, extra = {}) =>
  row(t.id, { ...t, ...readPaymentDetails(t.custom), ...extra });

async function buildingInput(projectId: string): Promise<BuildingDetailsInput> {
  const b = await getProjectBuildingDetails(projectId);
  return {
    project_id: projectId,
    building_use: b?.building_use ?? "residential",
    spaces: b ? decodeBuildingSpaces(b.selected_spaces_json) : ["flats"],
    floors_above_ground: b?.floors_above_ground ?? 1,
    basement_count: b?.basement_count ?? null,
    floor_layout: b ? decodeFloorLayout(b.floor_layout_json) : [],
    planned_shops: b?.planned_shops ?? null,
    planned_offices: b?.planned_offices ?? null,
    planned_houses: b?.planned_houses ?? null,
    parking_area_value: b?.parking_area_value ?? null,
    parking_area_unit: b?.parking_area_unit ?? null,
    plot_area_value: b?.plot_area_value ?? null,
    plot_area_unit: b?.plot_area_unit ?? null,
    covered_area_sqft: b?.covered_area_sqft ?? null,
    covered_area_unit: b?.covered_area_unit ?? null,
    notes: b?.notes ?? "",
  };
}

export function projectSheets(projectId: string): ProjectSheet[] {
  return [
    {
      id: "summary",
      label: "Summary",
      readOnly: true,
      help: "Calculated from this project's saved records. Edit the source worksheets to update these totals. Sales value is recorded sale value, not necessarily cash collected.",
      columns: [col("metric", "Measure", { width: 300 }), num("amount", "Amount (Rs)")],
      load: async () => {
        const [sales, costs, land, contributions, payouts] = await Promise.all([
          listProjectSales(projectId),
          listActualProjectCosts(projectId),
          getProjectLand(projectId),
          listPartnerContributions(projectId),
          listPartnerPayouts(projectId),
        ]);
        const total = (items: { amount: number }[]) =>
          items.reduce((sum, item) => sum + item.amount, 0);
        const saleValue = sales.reduce((sum, s) => sum + s.price, 0);
        const spent = total(costs) + (land?.price ?? 0);
        return Object.entries({
          "Sales value": saleValue,
          "Land purchase": land?.price ?? 0,
          "Construction costs": total(costs.filter((t) => t.type === "construction_cost")),
          "Other costs": total(costs.filter((t) => t.type === "project_cost")),
          "Total project costs": spent,
          "Profit / loss": saleValue - spent,
          "Partner contributions": total(contributions),
          "Profit paid out": total(payouts.filter((p) => p.payout_purpose === "profit")),
          "Capital returned": total(payouts.filter((p) => p.payout_purpose === "capital_return")),
        }).map(([metric, amount]) => row(metric, { metric, amount }));
      },
      save: async () => {
        throw new Error("Edit the source worksheet to change calculated totals");
      },
    },
    {
      id: "project",
      label: "Project",
      singleton: true,
      help: "Edit the project's details. Change its stage from the project header so the related land and sale details stay linked.",
      columns: [
        col("name", "Project name", { required: true }),
        col("location", "Location", { required: true }),
        col("code", "Code"),
        date("start_date", "Start date"),
        col("description", "Notes", { width: 280 }),
        col("status", "Stage", { readOnly: true }),
      ],
      load: async () => {
        const p = await getProjectById(projectId);
        return p ? [row(p.id, { ...p })] : [];
      },
      save: async (c) => {
        await updateSheetProject(projectId, {
          name: c.name,
          location: c.location,
          code: c.code ?? "",
          description: c.description ?? "",
          start_date: iso(c.start_date, true),
          status: "planning",
        });
        return projectId;
      },
    },
    {
      id: "partners",
      label: "Partners",
      help: "Add and edit partner details and agreed shares. Record money received in Contributions. Received totals are calculated.",
      columns: [
        col("name", "Partner name", { required: true }),
        col("phone", "Mobile", { required: true }),
        col("phone2", "Other phone"),
        col("address", "Address"),
        num("share", "Share (%)", { required: true }),
        money("agreed_contribution", "Agreed (Rs)"),
        money("contributed", "Received (Rs)"),
        col("notes", "Notes"),
      ].map((c) => (c.key === "contributed" ? { ...c, readOnly: true } : c)),
      load: async () =>
        (await listProjectPartners(projectId)).map((p) =>
          row(p.partnership_id, { ...p, share: p.share_bp / 100 }),
        ),
      save: async (c, id) => {
        const share = decimal(c, "share");
        if (share === null || Math.abs(share * 100 - Math.round(share * 100)) > 0.000001)
          throw new Error("Share: use at most two decimal places");
        const input = {
          project_id: projectId,
          name: c.name ?? "",
          phone: c.phone ?? "",
          phone2: c.phone2 ?? "",
          address: c.address ?? "",
          notes: c.notes ?? "",
          share_bp: Math.round(share * 100),
          agreed_contribution: whole(c, "agreed_contribution"),
        };
        if (id) {
          await updateProjectPartner({ ...input, partnership_id: id });
          return id;
        }
        return addProjectPartner({
          ...input,
          initial_amount: null,
          initial_date: null,
          initial_method: "cash",
          initial_reference: "",
          initial_payment_details: emptyPaymentDetails,
        });
      },
    },
    {
      id: "building",
      label: "Building",
      singleton: true,
      help: "Edit the building specification. Spaces are comma separated (flats, shops, offices, houses, parking, masjid, lift, generator, rooftop, water_tank, fire_safety). Use Floors & flats to enter flat counts. Plot area comes from Land.",
      columns: [
        col("building_use", "Building use", {
          options: ["residential", "commercial", "mixed-use"],
        }),
        col("spaces", "Spaces", { width: 280 }),
        num("floors_above_ground", "Floors incl. ground"),
        num("basement_count", "Basements"),
        num("planned_shops", "Shops"),
        num("planned_offices", "Offices"),
        num("planned_houses", "Houses"),
        num("parking_area_value", "Parking area"),
        col("parking_area_unit", "Parking unit", { options: ["sqft", "sqyd"] }),
        num("covered_area_sqft", "Covered area"),
        col("covered_area_unit", "Covered unit", { options: ["sqft", "sqyd"] }),
        num("plot_area_value", "Plot area", { readOnly: true }),
        col("plot_area_unit", "Plot unit", { readOnly: true }),
        col("notes", "Notes"),
      ],
      load: async () => {
        const b = await getProjectBuildingDetails(projectId);
        return b
          ? [row(b.id, { ...b, spaces: decodeBuildingSpaces(b.selected_spaces_json).join(", ") })]
          : [];
      },
      save: async (c) => {
        const base = await buildingInput(projectId);
        const floors = whole(c, "floors_above_ground") ?? 1;
        if (base.floor_layout.some((f) => f.floor_index >= floors && f.flat_types.length))
          throw new Error(
            "This floor count would remove planned flats. Adjust the floor plan first.",
          );
        const spaces = (c.spaces ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean) as BuildingSpace[];
        if (!spaces.includes("flats") && base.floor_layout.some((f) => f.flat_types.length))
          throw new Error("Keep Flats selected while the floor plan contains flats.");
        const saved = await saveProjectBuildingDetails({
          ...base,
          building_use: c.building_use as BuildingDetailsInput["building_use"],
          spaces,
          floors_above_ground: floors,
          basement_count: whole(c, "basement_count"),
          floor_layout: spaces.includes("flats")
            ? Array.from(
                { length: Math.min(floors, 50) },
                (_, i) =>
                  base.floor_layout.find((f) => f.floor_index === i) ?? {
                    floor_index: i,
                    flat_types: [],
                  },
              )
            : [],
          planned_shops: whole(c, "planned_shops"),
          planned_offices: whole(c, "planned_offices"),
          planned_houses: whole(c, "planned_houses"),
          parking_area_value: decimal(c, "parking_area_value"),
          parking_area_unit: (c.parking_area_unit || null) as "sqft" | "sqyd" | null,
          covered_area_sqft: decimal(c, "covered_area_sqft"),
          covered_area_unit: (c.covered_area_unit || null) as "sqft" | "sqyd" | null,
          notes: c.notes ?? "",
        });
        return saved.id;
      },
    },
    {
      id: "floors",
      label: "Floors & flats",
      help: "One row per room type on a floor. Ground is floor 0. Adding a higher floor expands the building's floor count. The building's other details are preserved.",
      columns: [
        col("floor", "Floor", { required: true }),
        num("rooms", "Rooms per flat", { required: true }),
        num("count", "Number of flats", { required: true }),
      ],
      load: async () =>
        (await buildingInput(projectId)).floor_layout.flatMap((f) =>
          f.flat_types.map((t) =>
            row(`${f.floor_index}:${t.rooms}`, {
              floor: f.floor_index,
              rooms: t.rooms,
              count: t.count,
            }),
          ),
        ),
      save: async (c, id) => {
        const floor = parseFloor(c.floor ?? ""),
          rooms = whole(c, "rooms"),
          count = whole(c, "count");
        if (floor > 49 || !rooms || !count)
          throw new Error("Use floors 0–49 and positive room/flat counts");
        const b = await buildingInput(projectId);
        if (id) {
          const [oldFloor, oldRooms] = id.split(":").map(Number);
          const old = b.floor_layout.find((f) => f.floor_index === oldFloor);
          if (!old?.flat_types.some((t) => t.rooms === oldRooms))
            throw new Error("This floor entry changed. Reopen the sheet.");
          old.flat_types = old.flat_types.filter((t) => t.rooms !== oldRooms);
        }
        b.floors_above_ground = Math.max(b.floors_above_ground, floor + 1);
        b.floor_layout = Array.from(
          { length: b.floors_above_ground },
          (_, i) =>
            b.floor_layout.find((f) => f.floor_index === i) ?? { floor_index: i, flat_types: [] },
        );
        const target = b.floor_layout[floor];
        if (target.flat_types.some((t) => t.rooms === rooms))
          throw new Error("This floor already has that room type. Edit its existing row.");
        target.flat_types.push({ rooms, count });
        if (!b.spaces.includes("flats")) b.spaces.push("flats");
        await saveProjectBuildingDetails(b);
        return `${floor}:${rooms}`;
      },
    },
    {
      id: "estimates",
      label: "Estimates",
      help: "Cost and revenue estimates. Existing recovery breakdowns remain linked when you edit these totals.",
      columns: [
        col("kind", "Type", { options: ["cost", "revenue"] }),
        col("title", "Item", { required: true }),
        col("details", "Details"),
        money("minimum_amount", "Minimum (Rs)"),
        money("maximum_amount", "Maximum (Rs)"),
      ],
      load: async () => (await listProjectEstimates(projectId)).map((e) => row(e.id, { ...e })),
      save: async (c, id) => {
        const existing = id
          ? (await listProjectEstimates(projectId)).find((e) => e.id === id)
          : null;
        const metadata = existing ? json(existing.custom) : {};
        const value = {
          ...metadata,
          project_id: projectId,
          kind: c.kind as "cost" | "revenue",
          title: c.title ?? "",
          details: c.details ?? "",
          minimum_amount: whole(c, "minimum_amount") ?? 0,
          maximum_amount: whole(c, "maximum_amount") ?? 0,
        };
        return (id ? await updateProjectEstimate(id, value) : await addProjectEstimate(value)).id;
      },
    },
    ...(["construction_cost", "project_cost"] as const).map((type) => ({
      id: type,
      label: type === "construction_cost" ? "Construction costs" : "Other costs",
      help: "Add or correct project expenses. Amounts and paying accounts update the same records used by the Bank and project totals. Existing receipts remain attached.",
      columns: [
        date("date", "Date"),
        col("description", "Description", { width: 260, required: true }),
        money("amount", "Amount (Rs)"),
        ...paymentColumns,
      ],
      load: async () =>
        (await listActualProjectCosts(projectId))
          .filter((t) => t.type === type)
          .map((t) => transactionRow(t)),
      save: async (c: Record<string, string>, id?: string) => {
        const input = {
          ...payment(c),
          project_id: projectId,
          date: iso(c.date),
          description: c.description ?? "",
          amount: whole(c, "amount") ?? 0,
        };
        if (id) {
          await updateSheetCost(id, input, type);
          return id;
        }
        return (
          await (type === "construction_cost"
            ? addConstructionCost(input)
            : addActualProjectCost(input))
        ).id;
      },
    })),
    {
      id: "sales",
      label: "Flat & shop sales",
      help: "View, add and edit sold flats and shops. Editing keeps the sale's attached documents. Land sales use the project's Change status workflow.",
      columns: [
        col("kind", "Type", { options: ["flat", "shop"] }),
        col("floor_index", "Floor"),
        col("unit_number", "Unit no.", { required: true }),
        num("rooms", "Rooms"),
        col("buyer_name", "Buyer", { required: true }),
        col("buyer_phone", "Phone"),
        col("buyer_address", "Address"),
        date("sale_date", "Sale date"),
        money("price", "Price (Rs)"),
        col("notes", "Notes"),
      ],
      load: async () =>
        (await listProjectSales(projectId))
          .filter((s) => s.kind !== "land")
          .map((s) => row(s.id, { ...s })),
      save: async (c, id) => {
        const kind = parseKind(c.kind ?? "");
        const input = {
          project_id: projectId,
          kind,
          floor_index: parseFloor(c.floor_index ?? ""),
          unit_number: c.unit_number ?? "",
          rooms: kind === "flat" ? whole(c, "rooms") : null,
          buyer_name: c.buyer_name ?? "",
          buyer_phone: c.buyer_phone ?? "",
          buyer_address: c.buyer_address ?? "",
          sale_date: iso(c.sale_date),
          price: whole(c, "price") ?? 0,
          notes: c.notes ?? "",
        };
        if (id) {
          await updateSheetSale(id, input);
          return id;
        }
        return (await addProjectSale(input)).id;
      },
    },
    ...(["contributions", "payouts"] as const).map((type) => ({
      id: type,
      label: type === "contributions" ? "Contributions" : "Partner payouts",
      help: "Choose a partner by their exact name. If names repeat, use the partner ID shown on existing payments. These entries update partner and bank totals.",
      columns: [
        col("partner", "Partner", { required: true }),
        date("date", "Date"),
        money("amount", "Amount (Rs)"),
        ...(type === "payouts"
          ? [col("purpose", "Purpose", { options: ["profit", "capital_return"] })]
          : []),
        col("description", "Notes"),
        ...paymentColumns,
      ],
      load: async () => {
        const partners = await listProjectPartners(projectId);
        const transactions =
          type === "contributions"
            ? await listPartnerContributions(projectId)
            : await listPartnerPayouts(projectId);
        return transactions.map((t) => {
          const p = partners.find((p) => p.partner_id === t.partner_id);
          return transactionRow(t, {
            partner:
              p &&
              partners.filter((other) => other.name.toLowerCase() === p.name.toLowerCase())
                .length === 1
                ? p.name
                : t.partner_id,
            purpose: json(t.custom).purpose ?? "profit",
          });
        });
      },
      save: async (c: Record<string, string>, id?: string) => {
        const matches = (await listProjectPartners(projectId)).filter(
          (p) =>
            p.partner_id === c.partner?.trim() ||
            p.name.trim().toLowerCase() === c.partner?.trim().toLowerCase(),
        );
        if (matches.length !== 1)
          throw new Error("Enter one existing partner's exact name or partner ID");
        const input = {
          ...payment(c),
          project_id: projectId,
          partner_id: matches[0].partner_id,
          date: iso(c.date),
          amount: whole(c, "amount") ?? 0,
          description: c.description ?? "",
        };
        if (type === "contributions") {
          if (id) {
            await updateSheetContribution(id, input);
            return id;
          }
          return addPartnerContribution(input);
        }
        if (!input.account_key) throw new Error("Choose the paying account");
        const payout = {
          ...input,
          account_key: input.account_key,
          purpose: c.purpose as "profit" | "capital_return",
          notes: input.description,
        };
        if (id) {
          await updateSheetPayout(id, payout);
          return id;
        }
        return addPartnerPayout(payout);
      },
    })),
    {
      id: "land",
      label: "Land",
      singleton: true,
      help: "One land purchase per project. Adding land advances a Planning project to Land acquired. Editing existing purchase details preserves the current project stage.",
      columns: [
        col("title", "Land name"),
        col("location", "Location"),
        date("purchase_date", "Purchase date"),
        num("area_value", "Area"),
        col("area_unit", "Area unit", { options: ["sqft", "sqyd", "marla", "kanal", "acre"] }),
        col("seller_name", "Seller"),
        money("price", "Price (Rs)"),
        col("account_key", "Paid from", { options: ["personal", "builder"] }),
        col("method", "Method", { options: ["cash", "bank", "digital", "cheque", "other"] }),
        col("paid_to", "Paid to"),
        col("provider", "Bank / service"),
        col("account_name", "Account name"),
        col("account_no", "Account no."),
        col("reference", "Reference"),
        date("cheque_date", "Cheque date"),
        col("notes", "Notes"),
      ],
      load: async () => {
        const land = await getProjectLand(projectId);
        return land ? [row(land.id, { ...land, ...land.payment_details })] : [];
      },
      save: async (c, id) => {
        const price = whole(c, "price");
        const input = {
          title: c.title ?? "",
          location: c.location ?? "",
          purchase_date: iso(c.purchase_date),
          area_value: decimal(c, "area_value"),
          area_unit: parseAreaUnit(c.area_unit ?? ""),
          seller_name: c.seller_name ?? "",
          price,
          account_key: parseAccount(c.account_key ?? ""),
          notes: c.notes ?? "",
          payment_details:
            price === null
              ? null
              : {
                  method: parseMethod(c.method ?? ""),
                  paid_to: c.paid_to ?? "",
                  provider: c.provider ?? "",
                  account_name: c.account_name ?? "",
                  account_no: c.account_no ?? "",
                  reference: c.reference ?? "",
                  cheque_date: iso(c.cheque_date, true),
                },
        };
        if (id) {
          await updateSheetLand(projectId, id, input);
          return id;
        }
        if (
          (await getProjectById(projectId))?.status !== "planning" ||
          (await getProjectLand(projectId))
        )
          throw new Error("Reopen the sheet: land can only be added once to a Planning project.");
        await saveProjectStage(projectId, "land acquired", input);
        const land = await getProjectLand(projectId);
        if (!land) throw new Error("Land was saved; reopen this sheet to load it.");
        return land.id;
      },
    },
    {
      id: "land_sales",
      label: "Land sales",
      readOnly: true,
      help: "Land sales are linked to the project stage and payment records. Add a land sale through Change status in the project header.",
      columns: [
        col("buyer_name", "Buyer"),
        col("buyer_phone", "Phone"),
        col("buyer_address", "Address"),
        date("sale_date", "Sale date"),
        money("price", "Price (Rs)"),
        col("notes", "Notes"),
      ],
      load: async () =>
        (await listProjectSales(projectId))
          .filter((s) => s.kind === "land")
          .map((s) => row(s.id, { ...s })),
      save: async () => {
        throw new Error("Use Change status for land sales");
      },
    },
    {
      id: "documents",
      label: "Documents",
      allowAdd: false,
      help: "All documents linked to this project, its land, partners, costs and sales. Edit titles, dates and notes here, or attach a project image or PDF. File links and record associations are preserved.",
      upload: (file) => saveProjectDocument(projectId, file),
      open: async (cells) => {
        if (!cells.file_path) throw new Error("No file attached");
        await openDocument(cells.file_path);
      },
      columns: [
        col("title", "Document", { width: 280 }),
        col("doc_type", "Type", { readOnly: true }),
        date("doc_date", "Date"),
        col("source_name", "Linked record", { readOnly: true }),
        col("notes", "Notes"),
        col("file_path", "File", { width: 320, readOnly: true }),
      ],
      load: async () =>
        (await listDocuments())
          .filter((d) => d.project_id === projectId)
          .map((d) => row(d.id, { ...d })),
      save: async (cells, id) => {
        if (!id) throw new Error("Use Attach file to add a document");
        await updateSheetDocument(projectId, id, {
          title: cells.title ?? "",
          doc_date: iso(cells.doc_date, true),
          notes: cells.notes ?? "",
        });
        return id;
      },
    },
  ];
}
