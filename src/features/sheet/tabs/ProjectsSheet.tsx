import { createProject } from "@/data/repositories/projectsRepository";
import type { Project } from "@/domain/types";
import { SheetEditor } from "../SheetEditor";
import type { SheetColumn } from "../SheetGrid";
import { parseDate } from "../sheetParsing";

const columns: SheetColumn[] = [
    { key: "name", label: "Project name", width: 200, required: true },
    { key: "location", label: "Location / address", width: 240, required: true },
    { key: "code", label: "Code", width: 90 },
    { key: "start_date", label: "Start date", width: 120, kind: "date", placeholder: "DD/MM/YYYY" },
    { key: "description", label: "Notes", width: 260 },
];

export function ProjectsSheet({ projects, onSaved }: { projects: Project[]; onSaved: () => void }) {
    return (
        <SheetEditor
            id="projects"
            title="Projects"
            help="One project per row. New projects start with the status “Planning”."
            columns={columns}
            saveLabel="Save projects"
            onSaved={onSaved}
            saveRow={async (cells) => {
                const name = (cells.name ?? "").trim();
                if (name && projects.some((p) => p.name.trim().toLowerCase() === name.toLowerCase()))
                    throw new Error("A project with this name already exists. Use a different name.");
                const startText = (cells.start_date ?? "").trim();
                const start = startText ? parseDate(startText) : "";
                if (start === null) throw new Error("Start date: write it like 14/10/2026");
                await createProject({
                    name,
                    location: cells.location ?? "",
                    code: cells.code ?? "",
                    description: cells.description ?? "",
                    status: "planning",
                    start_date: start,
                });
                projects.push({ name } as Project); // catches the same name typed twice in one sheet
            }}
        />
    );
}