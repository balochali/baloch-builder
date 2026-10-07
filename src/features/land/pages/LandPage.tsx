import { LandPrintDialog } from "./LandPrintDialog";
import { LandPhotoSlider } from "./LandPhotoSlider";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Printer, ArrowUpRight, MapPin, Building2, Wallet, CalendarDays, UserRound, Ruler, SlidersHorizontal, ChevronDown } from "lucide-react";
import { listProjects } from "@/data/repositories/projectsRepository";
import { getProjectLand, type ProjectLand } from "@/data/repositories/projectStageRepository";
import "./land.css";
import { LandDetailsDialog } from "./LandDetailsDialog";
import { EmptyState } from "@/components/EmptyState";
import { useRecordFilters } from "@/components/RecordFilters";
import { formatPKR, formatPKRInLakhCrore } from "@/domain/money";
import { formatDate } from "@/lib/dates";

type LandRecord = ProjectLand & { projectId: string; projectName: string };

export function LandPage() {
  const [printLand, setPrintLand] = useState<LandRecord | null>(null);
  const [selected, setSelected] = useState<LandRecord | null>(null);
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
  const { visible, pageItems, pagination, controls, active } = useRecordFilters(records, {
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
  const totalPrice = records.reduce((sum, land) => sum + (land.price ?? 0), 0);
  const pricedCount = records.filter((land) => land.price !== null).length;
  return <main className="land-page">
    <header className="land-hero"><div><span className="land-eyebrow"><MapPin size={17}/> YOUR PROJECT PROPERTY</span><h1>Land & acquisitions</h1><p>Your land, purchase details and project connections in one place.</p></div><Link to="/projects" className="land-project-button">Open projects <ArrowUpRight size={18}/></Link></header>
    {loading ? <p role="status" className="land-state">Loading land records…</p> : <>
      {error && <p role="alert" className="land-error">{error}</p>}
      <div className="land-metrics">
        <section><span><MapPin size={23}/></span><small>Acquired properties</small><strong>{records.length}</strong><p>{error ? "From available records" : "Land saved with your projects"}</p></section>
        <section><span><Wallet size={23}/></span><small>Recorded purchase value</small><strong>{formatPKRInLakhCrore(totalPrice)}</strong><p>{pricedCount} of {records.length} properties have a price</p></section>
        <section><span><Building2 size={23}/></span><small>Linked projects</small><strong>{new Set(records.map((land) => land.projectId)).size}</strong><p>Projects with acquired land</p></section>
      </div>
      <div className="land-section-heading"><div><h2>Your land portfolio</h2><p>Find a property and open its project to manage the details.</p></div><span>{visible.length} {visible.length === 1 ? "property" : "properties"}</span></div>
      <details className="land-filters"><summary><SlidersHorizontal size={19}/><strong>Search & filter land</strong><span>{active ? "Filters applied" : "All properties"}</span><ChevronDown size={18}/></summary>{controls}</details>{pagination}
      {!error && records.length === 0 ? <EmptyState icon={<MapPin size={40}/>} title="No acquired land recorded yet" description="Record a land acquisition in a project to see its details here."/> : visible.length === 0 ? <p className="land-state">No land records match these filters.</p> : <div className="land-grid">{pageItems.map((land) => <article className="land-card" key={land.id} onClick={(event) => { if (!(event.target as HTMLElement).closest("button, a, input, summary, details")) setSelected(land); }}>
        <LandPhotoSlider landId={land.id} title={land.title} />
        <div className="land-card-heading"><span><MapPin size={25}/></span><div><small>{land.projectName}</small><h3><button type="button" className="land-card-open" title="Open land details and documents" onClick={() => setSelected(land)}>{land.title}</button></h3></div></div>
        <p className="land-location"><MapPin size={15}/>{land.location || "Location not recorded"}</p>
        <div className="land-price"><small>Purchase price</small><strong>{land.price === null ? "Not recorded" : formatPKR(land.price)}</strong></div>
        <dl><div><dt><CalendarDays size={16}/> Acquired</dt><dd>{formatDate(land.purchase_date)}</dd></div><div><dt><Ruler size={16}/> Land area</dt><dd>{land.area_value === null ? "Not recorded" : land.area_value.toLocaleString() + " " + land.area_unit}</dd></div><div><dt><UserRound size={16}/> Purchased from</dt><dd>{land.seller_name || "Not recorded"}</dd></div></dl>
        {land.notes && <details className="land-notes"><summary>Notes</summary><p>{land.notes}</p></details>}
        <div className="land-card-actions">
        <button type="button" className="land-card-link land-action-print" onClick={() => setPrintLand(land)}><Printer size={17}/> Print documents <ArrowUpRight size={16}/></button>
        <Link to={"/projects/" + land.projectId} className="land-card-link land-action-project"><Building2 size={17}/> View project <ArrowUpRight size={16}/></Link>
        </div>
      </article>)}</div>}
      <p className="land-help"><Building2 size={19}/><span>To add or update acquired land, open its project and choose <strong>Change Status → Land acquired.</strong> Personal land purchases are in <Link to="/personal-expense">Personal Expense</Link>.</span></p>
    </>}
    {printLand && <LandPrintDialog land={printLand} onClose={() => setPrintLand(null)} />}
    {selected && <LandDetailsDialog key={selected.id} land={selected} onClose={() => setSelected(null)}/>}
  </main>;
}
