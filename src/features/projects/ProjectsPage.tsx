import towers from "@/assets/auth/residential-towers.png";
import { useEffect, useState } from "react";
import { Building2, HardHat, Plus, RefreshCw } from "lucide-react";
import { can, projectStatuses, type Project, type Role } from "@baloch/shared";
import { api } from "@/data/api";
import { Link, useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { BuildingDrawing } from "./BuildingDrawing";
import { ProjectWizard } from "./ProjectWizard";
import { ProjectFigures } from "./ProjectFigures";
import "./projects.css";

export function ProjectsPage({ role }: { role: Role }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [reload, setReload] = useState(0);
  const navigate = useNavigate();
  const filtered = projects.filter(
    (project) =>
      (!status || (project.status ?? "Planning") === status) &&
      [project.name, project.id, project.city].some((value) =>
        value?.toLowerCase().includes(search.trim().toLowerCase()),
      ),
  );
  useEffect(() => {
    let active = true;
    api<Project[]>("projects")
      .then((rows) => {
        if (active) setProjects(rows);
      })
      .catch((e) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);
  const start = () => setOpen(true);
  return (
    <section className="builder-projects" aria-labelledby="projects-heading">
      <header className="projects-heading">
        <div>
          <span className="projects-eyebrow">BALOCH BUILDERS & DEVELOPERS</span>
          <h1 id="projects-heading">Projects</h1>
          <p>View saved projects and start new developments.</p>
        </div>
        {can(role, "manageProjects") && (
          <button className="projects-primary" onClick={start} disabled={loading}>
            <Plus size={18} /> New project
          </button>
        )}
      </header>
      <div className="projects-banner">
        <img className="projects-hero-photo" src={towers} alt="" />
        <div>
          <span className="projects-banner-kicker">
            <HardHat size={16} /> DEVELOPMENT PORTFOLIO
          </span>
          <h2>Build what’s next.</h2>
          <p>Give each development a place to take shape.</p>
        </div>
      </div>
      <div className="projects-section-title">
        <h2>
          Your projects <span>{loading ? "—" : projects.length}</span>
        </h2>
      </div>
      {!loading && !error && projects.length > 0 && (
        <div className="project-filters">
          <label>
            Search projects
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, ID or city"
            />
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {projectStatuses.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      {loading ? (
        <div className="projects-loading" role="status">
          Loading your projects…
        </div>
      ) : error ? (
        <div className="projects-empty">
          <p role="alert">{error}</p>
          <button
            className="projects-secondary"
            onClick={() => {
              setLoading(true);
              setError("");
              setReload((v) => v + 1);
            }}
          >
            <RefreshCw size={16} /> Try again
          </button>
        </div>
      ) : projects.length && !filtered.length ? (
        <div className="projects-empty">No projects match your filters.</div>
      ) : projects.length ? (
        <div className="projects-card-grid">
          {filtered.map((project, index) => (
            <Link
              className="builder-project-card project-card-link"
              key={project.id}
              to={`/projects/${project.id}`}
            >
              <div className={`project-card-art project-card-art-${index % 4}`}>
                <span className="project-draft-badge">
                  {project.status ?? "Planning"}
                  {project.draft ? " · Draft" : ""}
                </span>
                <BuildingDrawing variant={index} />
              </div>
              <div className="project-card-body">
                <span className="project-card-eyebrow">
                  <Building2 size={13} /> BUILDING PROJECT
                </span>
                <h3>{project.name}</h3>
                <p>
                  {project.id} · {project.type ?? "Type not set"} · {project.city || "City not set"}
                </p>
                <ProjectFigures labels={["Total received", "Total spent", "Profit"]} />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="projects-empty projects-empty-layout">
          <div className="projects-empty-copy">
            <span className="projects-empty-icon">
              <Building2 size={32} strokeWidth={1.4} />
            </span>
            <h3>A blank canvas for your next landmark.</h3>
            <p>
              {can(role, "manageProjects")
                ? "Create your first project. Start with a name — we’ll build from there."
                : "Your saved projects will appear here once an administrator creates them."}
            </p>
            {can(role, "manageProjects") && (
              <button className="projects-secondary" onClick={start}>
                <Plus size={17} /> Create your first project
              </button>
            )}
          </div>
          <div className="projects-empty-plan" aria-hidden="true">
            <BuildingDrawing variant={1} />
            <span>01 / CONCEPT STUDY</span>
          </div>
        </div>
      )}
      {open && (
        <ProjectWizard
          onClose={() => setOpen(false)}
          onSaved={(project) => {
            setProjects((rows) =>
              rows.some((row) => row.id === project.id)
                ? rows.map((row) => (row.id === project.id ? project : row))
                : [project, ...rows],
            );
          }}
          onComplete={(project) => navigate(`/projects/${project.id}`)}
        />
      )}
    </section>
  );
}
