import { addProjectSale } from "@/data/repositories/projectSalesRepository";
import type { Project } from "@/domain/types";
import { SheetEditor } from "../SheetEditor";
import type { SheetColumn } from "../SheetGrid";
import { findProject } from "./projectLookup";
import { parseDate, parseFloor, parseKind, parseWhole } from "../sheetParsing";

export function SalesSheet({ projects, onSaved }: { projects: Project[]; onSaved: () => void }) {
    const columns: SheetColumn[] = [
        {
            key: "project",
            label: "Project",
            width: 190,
            required: true,
            options: projects.map((project) => project.name),
        },
        {
            key: "kind",
            label: "Flat / Shop",
            width: 100,
            options: ["Flat", "Shop"],
            placeholder: "Flat",
        },
        { key: "floor", label: "Floor", width: 90, required: true, placeholder: "Ground, 1, 2" },
        { key: "unit", label: "Unit no.", width: 90, required: true },
        { key: "rooms", label: "Rooms", width: 80, kind: "number" },
        { key: "buyer", label: "Buyer name", width: 170, required: true },
        { key: "phone", label: "Buyer phone", width: 130 },
        { key: "address", label: "Buyer address", width: 190 },
        {
            key: "date",
            label: "Sale date",
            width: 120,
            kind: "date",
            required: true,
            placeholder: "DD/MM/YYYY",
        },
        {
            key: "price",
            label: "Sale price (Rs)",
            width: 140,
            kind: "number",
            required: true,
            sum: true,
        },
        { key: "notes", label: "Notes", width: 200 },
    ];
    return (
        <SheetEditor
            id="sales"
            title="Flats & Shops sold"
            help="One sold flat or shop per row. The project must already exist."
            columns={columns}
            saveLabel="Save sales"
            onSaved={onSaved}
            saveRow={async (cells) => {
                const project = findProject(projects, cells.project ?? "");
                const kind = parseKind(cells.kind ?? "");
                const sale = parseDate(cells.date ?? "");
                if (!sale) throw new Error("Sale date: write it like 14/10/2026");
                const price = parseWhole("Sale price", cells.price ?? "");
                if (!price) throw new Error("Sale price: enter the amount in rupees");
                await addProjectSale({
                    project_id: project.id,
                    kind,
                    floor_index: parseFloor(cells.floor ?? ""),
                    unit_number: cells.unit ?? "",
                    rooms: kind === "flat" ? parseWhole("Rooms", cells.rooms ?? "") : null,
                    buyer_name: cells.buyer ?? "",
                    buyer_phone: cells.phone ?? "",
                    buyer_address: cells.address ?? "",
                    sale_date: sale,
                    price,
                    notes: cells.notes ?? "",
                });
            }}
        />
    );
}