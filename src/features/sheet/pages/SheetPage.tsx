import { useCallback, useEffect, useState } from "react";
import { listProjects } from "@/data/repositories/projectsRepository";
import type { Project } from "@/domain/types";
import { PageHeader } from "@/components/PageHeader";
import { ProjectsSheet } from "../tabs/ProjectsSheet";
import { SalesSheet } from "../tabs/SalesSheet";
import { LandSheet } from "../tabs/LandSheet";
import "../sheet.css";

const tabs = [
    { id: "projects", label: "Projects" },
    { id: "sales", label: "Flats & Shops" },
    { id: "land", label: "Land" },
] as const;
type TabId = (typeof tabs)[number]["id"];

export function SheetPage() {
    const [tab, setTab] = useState<TabId>("projects");
    const [projects, setProjects] = useState<Project[]>([]);
    const [loadError, setLoadError] = useState("");
    const [loaded, setLoaded] = useState(false);

    const [version, setVersion] = useState(0);
    const reload = useCallback(() => setVersion((value) => value + 1), []);
    useEffect(() => {
        let active = true;
        listProjects()
            .then((list) => {
                if (!active) return;
                setProjects(list);
                setLoaded(true);
                setLoadError("");
            })
            .catch(() => {
                if (active) setLoadError("Could not load the project list. Reopen this page to try again.");
            });
        return () => {
            active = false;
        };
    }, [version]);

    return (
        <div className="sheet-page">
            <PageHeader
                title="Sheet Entry"
                description="Type your records like in Excel. Everything you save here appears in the normal pages."
            />
            <div className="sheet-tabs" role="tablist" aria-label="What are you entering?">
                {tabs.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === item.id}
                        className={tab === item.id ? "is-active" : undefined}
                        onClick={() => setTab(item.id)}
                    >
                        {item.label}
                    </button>
                ))}
            </div>
            {loadError && <p className="sheet-message is-bad">{loadError}</p>}
            {loaded && tab === "projects" && <ProjectsSheet projects={projects} onSaved={reload} />}
            {loaded && tab === "sales" && <SalesSheet projects={projects} onSaved={reload} />}
            {loaded && tab === "land" && <LandSheet projects={projects} onSaved={reload} />}
        </div>
    );
}