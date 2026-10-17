import {
    getProjectLand,
    LandAcquisitionSchema,
    saveProjectStage,
    type LandAcquisitionInput,
} from "@/data/repositories/projectStageRepository";
import type { Project } from "@/domain/types";
import { SheetEditor } from "../SheetEditor";
import type { SheetColumn } from "../SheetGrid";
import { findProject } from "./projectLookup";
import {
    parseAccount,
    parseAreaUnit,
    parseDate,
    parseDecimal,
    parseMethod,
    parseWhole,
} from "../sheetParsing";

export function LandSheet({ projects, onSaved }: { projects: Project[]; onSaved: () => void }) {
    const columns: SheetColumn[] = [
        {
            key: "project",
            label: "Project",
            width: 190,
            required: true,
            options: projects.filter((p) => p.status === "planning").map((p) => p.name),
        },
        { key: "title", label: "Land name", width: 170, placeholder: "same as project" },
        { key: "location", label: "Land location", width: 200, placeholder: "same as project" },
        {
            key: "date",
            label: "Purchase date",
            width: 130,
            kind: "date",
            required: true,
            placeholder: "DD/MM/YYYY",
        },
        { key: "area", label: "Area", width: 80, kind: "number" },
        {
            key: "unit",
            label: "Area unit",
            width: 100,
            options: ["Marla", "Kanal", "Sq ft", "Sq yd", "Acre"],
        },
        { key: "seller", label: "Seller", width: 160 },
        { key: "price", label: "Price (Rs)", width: 140, kind: "number", sum: true },
        { key: "account", label: "Paid from", width: 110, options: ["Personal", "Builder"] },
        {
            key: "method",
            label: "Payment method",
            width: 130,
            options: ["Cash", "Bank", "Online", "Cheque", "Other"],
            placeholder: "Cash",
        },
        { key: "paid_to", label: "Paid to", width: 150, placeholder: "same as seller" },
        { key: "provider", label: "Bank / service", width: 140 },
        { key: "reference", label: "Reference / cheque no.", width: 150 },
        { key: "cheque_date", label: "Cheque date", width: 120, kind: "date" },
        { key: "notes", label: "Notes", width: 200 },
    ];
    return (
        <SheetEditor
            id="land"
            title="Land purchased"
            help="One land purchase per project. Leave Price empty if you do not want to record a payment yet."
            notice="Each project can have one land record. Only projects still at “Planning” can be used here; saving marks the project “Land acquired”."
            columns={columns}
            saveLabel="Save land"
            onSaved={onSaved}
            saveRow={async (cells) => {
                const project = findProject(projects, cells.project ?? "");
                if (project.status !== "planning")
                    throw new Error(
                        `This project is already “${project.status}”. Add or edit its land on the project's own page.`,
                    );
                if (await getProjectLand(project.id))
                    throw new Error("This project already has land recorded.");
                const purchase = parseDate(cells.date ?? "");
                if (!purchase) throw new Error("Purchase date: write it like 14/10/2026");
                const price = parseWhole("Price", cells.price ?? "");
                const area = parseDecimal("Area", cells.area ?? "");
                const seller = (cells.seller ?? "").trim();
                const cheque = (cells.cheque_date ?? "").trim();
                const chequeIso = cheque ? parseDate(cheque) : "";
                if (chequeIso === null) throw new Error("Cheque date: write it like 14/10/2026");
                const land: LandAcquisitionInput = {
                    account_key: parseAccount(cells.account ?? ""),
                    title: (cells.title ?? "").trim() || project.name,
                    location: (cells.location ?? "").trim() || project.location || "",
                    purchase_date: purchase,
                    area_value: area,
                    area_unit: parseAreaUnit(cells.unit ?? ""),
                    seller_name: seller,
                    price,
                    payment_details:
                        price === null
                            ? null
                            : {
                                method: parseMethod(cells.method ?? ""),
                                paid_to: (cells.paid_to ?? "").trim() || seller,
                                provider: (cells.provider ?? "").trim(),
                                account_name: "",
                                account_no: "",
                                reference: (cells.reference ?? "").trim(),
                                cheque_date: chequeIso,
                            },
                    notes: (cells.notes ?? "").trim(),
                };
                LandAcquisitionSchema.parse(land); // plain-language messages before anything is saved
                await saveProjectStage(project.id, "land acquired", land);
                project.status = "land acquired"; // a second row for the same project is refused above
            }}
        />
    );
}