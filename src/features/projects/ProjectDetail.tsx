import { ProjectFunding } from "./ProjectFunding";
import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Navigate, useOutletContext, useParams } from "react-router-dom";
import { ArrowLeft, Building2, FileText, HardHat, Landmark, Users, Wallet } from "lucide-react";
import { can, type Project, type Role } from "@baloch/shared";
import { api } from "@/data/api";
import { ComingSoon } from "./ComingSoon";
import { Feasibility } from "./Feasibility";
import { ProjectWizard } from "./ProjectWizard";
import { ProjectLand } from "./ProjectLand";
import { ProjectBuilding } from "./ProjectBuilding";
import { areaNumber, totalLandArea, type SiteData } from "./projectSite";
import "./projects.css";
import "./project-site.css";

const sections = [
  { title: "Overview", icon: Building2 },
  { title: "Feasibility", icon: HardHat },
  { title: "Land", icon: Landmark },
  { title: "Building", icon: Building2 },
  { title: "Transactions", icon: Wallet },
  { title: "Partners", icon: Users },
  { title: "Parties", icon: Users },
  { title: "Documents", icon: FileText },
];
const slug = (title: string) => title.toLowerCase().replace(/ /g, "-");
export function ProjectDetail({ role }: { role: Role }) {
  const { id, tab = "overview" } = useParams();
  const setTitle = useOutletContext<((title: string | undefined) => void) | undefined>();
  const [project, setProject] = useState<Project>();
  const [error, setError] = useState("");
  const [edit, setEdit] = useState(false);
  const [site, setSite] = useState<SiteData>();
  const [siteError, setSiteError] = useState("");
  const [feasibilityPending, setFeasibilityPending] = useState(true);
  const [salesRevision, setSalesRevision] = useState(0);
  const [buildingOpened, setBuildingOpened] = useState(tab === "building");
  const updateSite = useCallback(
    (update: (site: SiteData) => SiteData) =>
      setSite((current) => (current ? update(current) : current)),
    [],
  );
  useEffect(() => {
    let active = true;
    api<SiteData>(`projects/${id}/site`)
      .then((data) => {
        if (active) setSite(data);
      })
      .catch((cause) => {
        if (active) setSiteError(String(cause));
      });
    return () => {
      active = false;
    };
  }, [id]);

  const manage = can(role, "manageProjects");
  useEffect(() => {
    let active = true;
    api<Project>(`projects/${id}`)
      .then((result) => {
        if (active) setProject(result);
      })
      .catch((cause) => {
        if (active) setError(String(cause));
      });
    return () => {
      active = false;
    };
  }, [id]);
  const name = project?.name;
  useEffect(() => {
    setTitle?.(name);
    return () => setTitle?.(undefined);
  }, [name, setTitle]);
  const base = `/projects/${id}`;
  const section = sections.find((item) => slug(item.title) === tab);
  if (!section) return <Navigate to={base} replace />;
  return (
    <section className="builder-projects">
      <Link className="project-back" to="/projects">
        <ArrowLeft size={16} /> Projects
      </Link>
      {error && (
        <p role="alert" className="project-save-error">
          {error}
        </p>
      )}
      {!project ? (
        !error && <p role="status">Loading project...</p>
      ) : (
        <>
          <header className="projects-heading project-detail-header">
            <div>
              <span className="projects-eyebrow">{project.id}</span>
              <h1>{project.name}</h1>
              <span className="project-status">
                {project.status}
                {project.draft ? " / Draft" : ""}
              </span>
            </div>
            {manage && (
              <button className="projects-primary" onClick={() => setEdit(true)}>
                {project.draft ? "Resume setup" : "Edit"}
              </button>
            )}
          </header>
          <nav className="project-detail-tabs" aria-label="Project sections">
            {sections.map((item) => (
              <NavLink
                key={item.title}
                end
                onClick={() => {
                  if (item.title === "Building") setBuildingOpened(true);
                }}
                to={item.title === "Overview" ? base : base + "/" + slug(item.title)}
              >
                {item.title}
              </NavLink>
            ))}
          </nav>
          {tab === "overview" && (
            <dl className="feasibility-metrics">
              <div>
                <dt>Land area</dt>
                <dd>
                  {site?.parcels?.length
                    ? `${areaNumber(totalLandArea(site.parcels, "Marla"))} Marla`
                    : siteError
                      ? "Unavailable"
                      : site
                        ? project.landArea
                          ? `${areaNumber(project.landArea.value)} ${project.landArea.unit}`
                          : "—"
                        : "Loading..."}
                </dd>
              </div>
            </dl>
          )}
          {!["feasibility", "land", "building", "partners", "transactions"].includes(tab) && (
            <ComingSoon
              title={section.title}
              icon={section.icon}
              action={
                tab === "documents" ? (
                  <Link className="projects-primary" to="/projects">
                    Back to Projects
                  </Link>
                ) : undefined
              }
            />
          )}
          {(tab === "partners" || tab === "transactions") &&
            (can(role, "ledger") ? (
              <ProjectFunding key={tab} id={project.id} tab={tab} manage={manage} />
            ) : (
              <p>You do not have access to project financial records.</p>
            ))}
          {["land", "building"].includes(tab) && !site && (
            <p role={siteError ? "alert" : "status"}>{siteError || "Loading project site..."}</p>
          )}
          {site && tab === "land" && (
            <ProjectLand
              project={project}
              site={site}
              manage={manage}
              ledger={can(role, "ledger")}
              onSite={updateSite}
            />
          )}
          {site && (tab === "building" || buildingOpened) && (
            <div hidden={tab !== "building"}>
              <ProjectBuilding
                project={project}
                site={site}
                manage={manage}
                onSite={updateSite}
                feasibilityPending={feasibilityPending}
                onSynced={() => setSalesRevision((v) => v + 1)}
              />
            </div>
          )}
          <div hidden={tab !== "feasibility"}>
            <Feasibility
              key={salesRevision}
              id={project.id}
              manage={manage}
              projectPartners={project.partners}
              onPendingChange={setFeasibilityPending}
            />
          </div>
          {edit && (
            <ProjectWizard
              initial={project}
              onClose={() => setEdit(false)}
              onSaved={setProject}
              onComplete={setProject}
            />
          )}
        </>
      )}
    </section>
  );
}
