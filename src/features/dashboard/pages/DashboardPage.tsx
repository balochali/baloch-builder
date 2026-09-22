import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Building2, FolderKanban, MapPin, Plus, Users } from "lucide-react";
import { listProjects } from "@/data/repositories/projectsRepository";
import { listContacts } from "@/data/repositories/contactsRepository";
import type { Project } from "@/domain/types";

const statusColors: Record<string, string> = { planning: "#d6a529", "land acquired": "#4c8cc9", "under construction": "#f17c59", completed: "#37a782", "on hold": "#9f9aaf" };
const statusLabels: Record<string, string> = { planning: "Planning", "land acquired": "Land acquired", "under construction": "Under construction", completed: "Completed", "on hold": "On hold" };

export function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [contactCount, setContactCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([listProjects(), listContacts()])
      .then(([projectRows, contactRows]) => { if (active) { setProjects(projectRows); setContactCount(contactRows.length); } })
      .catch((cause) => { if (active) setError(String(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const counts = Object.keys(statusLabels).map((status) => ({ status, label: statusLabels[status], count: projects.filter((project) => (project.status || "planning") === status).length, color: statusColors[status] }));
  const activeCount = projects.filter((project) => project.status === "under construction").length;
  const completedCount = projects.filter((project) => project.status === "completed").length;
  const chartRows = counts.filter((item) => item.count > 0);

  return <div className="dashboard-page">
    <div className="dashboard-hero"><div><p className="dashboard-eyebrow">YOUR BUSINESS AT A GLANCE</p><h1>Welcome to Baloch Builders</h1><p>See where your projects stand and jump straight to the work that matters.</p></div><Link to="/projects" className="dashboard-hero-action">View projects <ArrowRight size={17} /></Link></div>
    {loading && <p className="dashboard-message">Loading your overview…</p>}
    {!loading && error && <p className="dashboard-message" role="alert">Could not load the overview: {error}</p>}
    {!loading && !error && <>
      <div className="dashboard-section-heading"><div><p className="dashboard-eyebrow">OVERVIEW</p><h2>Here is what is happening</h2></div><span>Based on your saved records</span></div>
      <div className="dashboard-stats">
        <Link to="/projects" className="dashboard-stat stat-blue"><span className="stat-icon"><FolderKanban size={23} /></span><span className="stat-number">{projects.length}</span><span className="stat-label">Total projects</span><span className="stat-foot">All your developments <ArrowRight size={15} /></span></Link>
        <Link to="/projects" className="dashboard-stat stat-orange"><span className="stat-icon"><Building2 size={23} /></span><span className="stat-number">{activeCount}</span><span className="stat-label">Under construction</span><span className="stat-foot">Currently being built <ArrowRight size={15} /></span></Link>
        <Link to="/projects" className="dashboard-stat stat-green"><span className="stat-icon"><Building2 size={23} /></span><span className="stat-number">{completedCount}</span><span className="stat-label">Completed projects</span><span className="stat-foot">Finished developments <ArrowRight size={15} /></span></Link>
        <Link to="/contacts" className="dashboard-stat stat-purple"><span className="stat-icon"><Users size={23} /></span><span className="stat-number">{contactCount}</span><span className="stat-label">Contacts</span><span className="stat-foot">People in your network <ArrowRight size={15} /></span></Link>
      </div>
      <div className="dashboard-grid">
        <section className="dashboard-panel"><div className="panel-head"><div><p className="dashboard-eyebrow">PROJECT PROGRESS</p><h2>Where projects stand</h2><p>Number of projects at each stage</p></div><FolderKanban size={20} /></div>
          {projects.length === 0 ? <div className="chart-empty"><span className="empty-symbol"><FolderKanban size={25} /></span><strong>Your project chart starts here</strong><p>Add a project to see its stage in this chart.</p><Link to="/projects">Add a project <ArrowRight size={15} /></Link></div> : <div className="status-chart" role="img" aria-label={chartRows.map((item) => `${item.label}: ${item.count}`).join(", ")}>{chartRows.map((item) => <div className="status-row" key={item.status}><div className="status-row-top"><span><i style={{ background: item.color }} />{item.label}</span><strong>{item.count} {item.count === 1 ? "project" : "projects"}</strong></div><div className="status-track"><div style={{ width: `${item.count / projects.length * 100}%`, background: item.color }} /></div></div>)}<p className="chart-note">Each bar shows the share of your {projects.length} {projects.length === 1 ? "project" : "projects"} in that stage.</p></div>}
        </section>
        <section className="dashboard-panel"><div className="panel-head"><div><p className="dashboard-eyebrow">RECENT WORK</p><h2>Latest projects</h2><p>Open a project to see its details</p></div><Link to="/projects" className="panel-link">View all <ArrowRight size={15} /></Link></div>
          {projects.length === 0 ? <div className="chart-empty"><span className="empty-symbol"><Plus size={26} /></span><strong>No projects added yet</strong><p>Create your first project to keep its information in one place.</p><Link to="/projects">Go to projects <ArrowRight size={15} /></Link></div> : <div className="recent-projects">{projects.slice(0, 4).map((project) => <Link key={project.id} to={`/projects/${project.id}`} className="recent-project"><span className="recent-avatar">{project.name.slice(0, 1).toUpperCase()}</span><span className="recent-info"><strong>{project.name}</strong><small><MapPin size={13} />{project.location || "Location not added"}</small></span><span className="recent-status" style={{ color: statusColors[project.status || "planning"] }}>{statusLabels[project.status || "planning"] || project.status}</span><ArrowRight size={16} /></Link>)}</div>}
        </section>
      </div>
    </>}
  </div>;
}
