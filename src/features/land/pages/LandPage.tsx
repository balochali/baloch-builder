import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, MapPin } from "lucide-react";
import { listProjects } from "@/data/repositories/projectsRepository";
import { getProjectLand, type ProjectLand } from "@/data/repositories/projectStageRepository";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { useRecordFilters } from "@/components/RecordFilters";
import { formatPKR } from "@/domain/money";
import { formatDate } from "@/lib/dates";

type LandRecord = ProjectLand & { projectId: string; projectName: string };

export function LandPage() {
  const [records, setRecords] = useState<LandRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const projects = await listProjects();
        const results = await Promise.allSettled(
          projects.map(async (project) => {
            const land = await getProjectLand(project.id);
            return land ? { ...land, projectId: project.id, projectName: project.name } : null;
          }),
        );
        if (!active) return;
        setRecords(
          results.flatMap((result) =>
            result.status === "fulfilled" && result.value ? [result.value] : [],
          ),
        );
        if (results.some((result) => result.status === "rejected"))
          setError("Some project land records could not be loaded. Reopen this page to retry.");
      } catch {
        if (active) setError("Could not load land records. Reopen this page to retry.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);
  const { visible, controls } = useRecordFilters(records, {
    label: "land records",
    searchText: (land) =>
      [land.title, land.location, land.seller_name, land.notes, land.projectName].join(" "),
    date: (land) => land.purchase_date,
    dateLabel: "Acquired",
    facets: [
      { label: "Project", value: (land) => land.projectName },
      { label: "Area unit", value: (land) => land.area_unit },
    ],
  });
  return (
    <div>
      <PageHeader
        title="Land"
        description="Acquired land recorded in your projects, together in one place."
        action={
          <Link className="home-hero-action" to="/projects">
            Open projects <ArrowUpRight size={16} />
          </Link>
        }
      />
      <p className="scope-note">
        To add or update acquired land, open its project and choose Change Status → Land acquired.
        Personal land purchases are in Personal Expense.
      </p>
      {loading ? (
        <p role="status">Loading land records…</p>
      ) : (
        <>
          {error && (
            <p role="alert" className="text-destructive mb-4">
              {error}
            </p>
          )}
          {controls}
          {!error && records.length === 0 ? (
            <EmptyState
              icon={<MapPin size={40} />}
              title="No acquired land recorded yet"
              description="Record a land acquisition in a project to see its details here."
            />
          ) : visible.length === 0 ? (
            <p className="filter-empty">No land records match these filters.</p>
          ) : (
            <div className="projects-grid">
              {visible.map((land) => (
                <section key={land.id} className="settings-section">
                  <span className="home-eyebrow">{land.projectName}</span>
                  <h2>{land.title}</h2>
                  <p>{land.location}</p>
                  <dl className="grid grid-cols-2 gap-4 my-5">
                    <div>
                      <dt className="text-xs text-muted-foreground">Acquired</dt>
                      <dd>{formatDate(land.purchase_date)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Purchase price</dt>
                      <dd>{land.price === null ? "Not recorded" : formatPKR(land.price)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Area</dt>
                      <dd>
                        {land.area_value === null
                          ? "Not recorded"
                          : `${land.area_value.toLocaleString()} ${land.area_unit}`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Seller</dt>
                      <dd>{land.seller_name || "Not recorded"}</dd>
                    </div>
                  </dl>
                  {land.notes && <p>{land.notes}</p>}
                  <Link
                    to={`/projects/${land.projectId}`}
                    className="inline-flex items-center gap-2 text-primary font-medium"
                  >
                    View project <ArrowUpRight size={16} />
                  </Link>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
