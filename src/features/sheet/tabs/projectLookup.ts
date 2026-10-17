import type { Project } from "@/domain/types";

/** Finds a project by the name typed in a cell. Throws a plain message if unclear. */
export function findProject(projects: Project[], text: string): Project {
    const name = text.trim().toLowerCase();
    if (!name) throw new Error("Project: choose or type the project name");
    const matches = projects.filter((project) => project.name.trim().toLowerCase() === name);
    if (matches.length === 0)
        throw new Error(
            "Project not found. Spell it exactly like on the Projects tab, or add it there first.",
        );
    if (matches.length > 1)
        throw new Error("Two projects have this name. Rename one of them on the Projects page.");
    return matches[0];
}