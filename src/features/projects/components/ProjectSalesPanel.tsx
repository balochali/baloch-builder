import { usePagination } from "@/components/Pagination";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Building2, CalendarDays, ChevronLeft, FileImage, ImagePlus, Plus, Search, ShoppingBag, Store, UserRound, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SelectedImagePreviews, SavedImageGallery } from "@/features/documents/components/ImageGallery";
import { listProjectSaleDocuments, saveProjectSaleImage, type DocumentRecord } from "@/data/repositories/documentsRepository";
import { addProjectSale, listProjectSales, ProjectSaleSchema, type ProjectSale, type ProjectSaleInput } from "@/data/repositories/projectSalesRepository";
import type { ProjectBuildingDetails } from "@/domain/types";
import { formatPKR } from "@/domain/money";
import { formatDate } from "@/lib/dates";
import { plannedFlatGroups } from "./recoverySpaces";
import "./project-sales.css";

const floorName = (index: number) => index === 0 ? "Ground floor" : `Floor ${index}`;
type Kind = "flat" | "shop";
type Filter = "all" | Kind;

interface Props { projectId: string; buildingDetails: ProjectBuildingDetails | null }

export function ProjectSalesPanel({ projectId, buildingDetails }: Props) {
  const [sales, setSales] = useState<ProjectSale[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const flatGroups = useMemo(() => plannedFlatGroups(buildingDetails), [buildingDetails]);

  useEffect(() => {
    let active = true;
    Promise.all([listProjectSales(projectId), listProjectSaleDocuments(projectId)])
      .then(([saleRows, documentRows]) => { if (active) { setSales(saleRows); setDocuments(documentRows); } })
      .catch(() => { if (active) setError("Could not load sales for this project. Reopen the tab to try again."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId]);

  const flatCount = sales.filter((sale) => sale.kind === "flat").length;
  const shopCount = sales.filter((sale) => sale.kind === "shop").length;
  const contracted = sales.reduce((total, sale) => total + sale.price, 0);
  const visible = sales.filter((sale) => (filter === "all" || sale.kind === filter) &&
    [sale.unit_number, sale.buyer_name, sale.buyer_phone, sale.notes, floorName(sale.floor_index)].join(" ").toLowerCase().includes(search.trim().toLowerCase()));

  const pages = usePagination(visible, JSON.stringify([projectId, filter, search, visible.map(row => row.id)]), "sales");
  async function saveSale(value: ProjectSaleInput, files: File[]) {
    const row = await addProjectSale(value);
    setSales((current) => [row, ...current]);
    toast.success(`${row.kind === "flat" ? "Flat" : "Shop"} sale recorded`);
    if (files.length) {
      const results = await Promise.allSettled(files.map((file) => saveProjectSaleImage(row.id, file, row.sale_date)));
      const saved = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      setDocuments((current) => [...saved, ...current]);
      if (saved.length !== files.length) toast.error(`${files.length - saved.length} image${files.length - saved.length === 1 ? "" : "s"} could not be saved. You can still see the sale here.`);
    }
  }

  return <section id="project-panel-sales" role="tabpanel" aria-labelledby="project-tab-sales" className="project-sales">
    <header className="project-sales-hero"><div className="project-sales-hero-copy"><span><Store size={28} /></span><div><small>PROJECT INVENTORY</small><h2>Flat & shop sales</h2><p>See which units have sold, who bought them and their agreed prices.</p></div></div><button type="button" className="project-sales-primary" onClick={() => setOpen(true)}><Plus size={18} /> Record sale</button></header>
    <div className="project-sales-stats">
      <div className="project-sales-stat is-flat"><Building2 size={23} /><span>Flats sold</span><strong>{flatCount}{buildingDetails?.planned_flats ? <small> / {buildingDetails.planned_flats} planned</small> : null}</strong><div className="project-sales-meter"><i style={{ width: `${buildingDetails?.planned_flats ? Math.min(100, flatCount / buildingDetails.planned_flats * 100) : 0}%` }} /></div></div>
      <div className="project-sales-stat is-shop"><ShoppingBag size={23} /><span>Shops sold</span><strong>{shopCount}{buildingDetails?.planned_shops ? <small> / {buildingDetails.planned_shops} planned</small> : null}</strong><div className="project-sales-meter"><i style={{ width: `${buildingDetails?.planned_shops ? Math.min(100, shopCount / buildingDetails.planned_shops * 100) : 0}%` }} /></div></div>
      <div className="project-sales-stat is-value"><Wallet size={23} /><span>Total agreed sale value</span><strong>{formatPKR(contracted)}</strong><p>Contracted price; payments are recorded separately.</p></div>
    </div>
    <div className="project-sales-list-heading"><div><h3>Sold units</h3><p>Search buyers or unit numbers, then open any saved document image.</p></div><span>{visible.length} of {sales.length} sales</span></div>
    <div className="project-sales-toolbar"><div className="project-sales-filters" aria-label="Sale type">{(["all", "flat", "shop"] as const).map((item) => <button key={item} type="button" className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>{item === "all" ? "All sales" : item === "flat" ? "Flats" : "Shops"}</button>)}</div><label className="project-sales-search"><Search size={17} /><input aria-label="Search sales" placeholder="Search buyer, unit or floor…" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
    {pages.controls}
    {loading ? <p className="project-sales-state">Loading sales…</p> : error ? <p className="project-sales-state" role="alert">{error}</p> : visible.length ? <div className="project-sales-grid">{pages.items.map((sale) => <article className="project-sales-card" key={sale.id}><div className="project-sales-card-head"><span className={`project-sales-card-icon is-${sale.kind}`}>{sale.kind === "flat" ? <Building2 size={21} /> : <Store size={21} />}</span><div><small>{sale.kind === "flat" ? "FLAT" : "SHOP"} · {floorName(sale.floor_index)}</small><h4>{sale.kind === "flat" ? "Flat" : "Shop"} {sale.unit_number}</h4></div><b>{formatPKR(sale.price)}</b></div><div className="project-sales-card-meta"><span><UserRound size={16} /> {sale.buyer_name}</span><span><CalendarDays size={16} /> {formatDate(sale.sale_date)}</span>{sale.kind === "flat" && sale.rooms && <span>{sale.rooms}-room flat</span>}{sale.buyer_phone && <span>{sale.buyer_phone}</span>}</div>{sale.buyer_address && <p className="project-sales-card-note">{sale.buyer_address}</p>}{sale.notes && <p className="project-sales-card-note">{sale.notes}</p>}{documents.some((document) => document.owner_id === sale.id) && <div className="project-sales-card-documents"><small><FileImage size={15} /> Sale documents</small><SavedImageGallery documents={documents.filter((document) => document.owner_id === sale.id)} /></div>}</article>)}</div> : <div className="project-sales-empty"><Store size={34} /><h3>{sales.length ? "No sales match" : "No units sold yet"}</h3><p>{sales.length ? "Try a different search or unit type." : "Record a flat or shop sale to start tracking buyers and agreements."}</p>{!sales.length && <button type="button" className="project-sales-primary" onClick={() => setOpen(true)}><Plus size={17} /> Record first sale</button>}</div>}
    {open && <SaleDialog projectId={projectId} buildingDetails={buildingDetails} flatGroups={flatGroups} sales={sales} onClose={() => setOpen(false)} onSave={saveSale} />}
  </section>;
}

function SaleDialog({ projectId, buildingDetails, flatGroups, sales, onClose, onSave }: {
  projectId: string; buildingDetails: ProjectBuildingDetails | null; flatGroups: ReturnType<typeof plannedFlatGroups>;
  sales: ProjectSale[]; onClose: () => void; onSave: (value: ProjectSaleInput, files: File[]) => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<Kind>("flat");
  const [floor, setFloor] = useState(String(flatGroups[0]?.floor_index ?? 0));
  const [unit, setUnit] = useState("");
  const [rooms, setRooms] = useState("");
  const [buyer, setBuyer] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const plannedFloors = [...new Set(flatGroups.map((group) => group.floor_index))].sort((a, b) => a - b);
  const roomOptions = [...new Set(flatGroups.filter((group) => group.floor_index === Number(floor)).map((group) => group.rooms))].sort((a, b) => a - b);


  function next() {
    setFormError("");
    if (step === 0) {
      if (!unit.trim()) return setFormError("Enter the flat or shop number.");
      if (!Number.isInteger(Number(floor)) || Number(floor) < 0 || Number(floor) > 100) return setFormError("Enter a valid floor number.");
      if (sales.some((sale) => sale.kind === kind && sale.floor_index === Number(floor) && sale.unit_number.trim().toLowerCase() === unit.trim().toLowerCase())) return setFormError("This unit is already recorded as sold on this floor.");
      const planned = kind === "flat" ? buildingDetails?.planned_flats : buildingDetails?.planned_shops;
      if (planned && sales.filter((sale) => sale.kind === kind).length >= planned) return setFormError(`All ${planned} planned ${kind === "flat" ? "flats" : "shops"} are already recorded as sold.`);
    }
    if (step === 1) {
      if (!buyer.trim()) return setFormError("Enter the buyer's name.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return setFormError("Choose a valid sale date.");
      if (!/^\d+$/.test(price.replace(/,/g, "")) || !Number.isSafeInteger(Number(price.replace(/,/g, ""))) || Number(price.replace(/,/g, "")) <= 0) return setFormError("Enter a positive whole-rupee sale price.");
    }
    setStep((current) => current + 1);
  }

  async function save() {
    const parsed = ProjectSaleSchema.safeParse({ project_id: projectId, kind, floor_index: Number(floor), unit_number: unit, rooms: kind === "flat" && rooms ? Number(rooms) : null, buyer_name: buyer, buyer_phone: phone, buyer_address: address, sale_date: date, price: Number(price.replace(/,/g, "")), notes });
    if (!parsed.success) return setFormError(parsed.error.issues[0]?.message || "Check the sale details.");
    setSaving(true); setFormError("");
    try { await onSave(parsed.data, files); onClose(); }
    catch (cause) { setFormError(cause instanceof Error ? cause.message : "Could not save this sale. Please try again."); }
    finally { setSaving(false); }
  }

  return <Dialog open onOpenChange={(value) => { if (!value && !saving) onClose(); }}><DialogContent className="project-sale-dialog"><DialogHeader><div className="project-sale-dialog-heading"><span><Store size={27} /></span><div><small>PROJECT SALE</small><DialogTitle>Record a flat or shop sale</DialogTitle><p>Save the unit, buyer, agreed price and optional document images.</p></div></div></DialogHeader>
    <div className="project-sale-steps">{["Unit", "Buyer & price", "Documents"].map((label, index) => <div key={label} className={index === step ? "is-current" : index < step ? "is-done" : ""}><b>{index + 1}</b>{label}</div>)}</div>
    <div className="project-sale-dialog-body">
      {step === 0 && <><div className="project-sale-step-intro"><h3>Which unit was sold?</h3><p>Identify the exact flat or shop so it cannot be sold twice.</p></div><div className="project-sale-kind"><button type="button" className={kind === "flat" ? "is-active" : ""} onClick={() => { setKind("flat"); setRooms(""); setFloor(String(plannedFloors[0] ?? 0)); }}><Building2 size={22} /><strong>Flat</strong><small>{buildingDetails?.planned_flats ?? "No"} planned</small></button><button type="button" className={kind === "shop" ? "is-active" : ""} onClick={() => { setKind("shop"); setRooms(""); setFloor("0"); }}><Store size={22} /><strong>Shop</strong><small>{buildingDetails?.planned_shops ?? "No"} planned</small></button></div><div className="project-sale-fields"><label>{kind === "flat" ? "Flat number" : "Shop number"} *<input autoFocus placeholder={kind === "flat" ? "e.g. A-101" : "e.g. S-01"} value={unit} onChange={(event) => setUnit(event.target.value)} /></label><label>Floor *{kind === "flat" && plannedFloors.length ? <select value={floor} onChange={(event) => { setFloor(event.target.value); setRooms(""); }}>{plannedFloors.map((index) => <option key={index} value={index}>{floorName(index)}</option>)}</select> : <input type="number" min="0" max="100" value={floor} onChange={(event) => setFloor(event.target.value)} />}</label>{kind === "flat" && <label>Flat size {roomOptions.length ? <select value={rooms} onChange={(event) => setRooms(event.target.value)}><option value="">Choose size (optional)</option>{roomOptions.map((count) => <option key={count} value={count}>{count} rooms</option>)}</select> : <input type="number" min="1" max="20" placeholder="Rooms (optional)" value={rooms} onChange={(event) => setRooms(event.target.value)} />}</label>}</div></>}
      {step === 1 && <><div className="project-sale-step-intro"><h3>Who bought it, and for how much?</h3><p>The agreed price is a sale value. It does not record a received payment.</p></div><div className="project-sale-fields"><label>Buyer name *<input autoFocus placeholder="Full name" value={buyer} onChange={(event) => setBuyer(event.target.value)} /></label><label>Phone number<input inputMode="tel" placeholder="Optional" value={phone} onChange={(event) => setPhone(event.target.value)} /></label><label className="is-wide">Buyer address<input placeholder="Optional address" value={address} onChange={(event) => setAddress(event.target.value)} /></label><label>Sale date *<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Agreed price (Rs) *<input inputMode="numeric" placeholder="e.g. 7,500,000" value={price} onChange={(event) => setPrice(event.target.value)} /></label><label className="is-wide">Notes<textarea rows={3} placeholder="Payment terms or agreement details (optional)" value={notes} onChange={(event) => setNotes(event.target.value)} /></label></div></>}
      {step === 2 && <><div className="project-sale-step-intro"><h3>Add sale documents</h3><p>Upload images of the sale agreement, buyer ID, receipts or other proof. This step is optional.</p></div><label className="project-sale-upload"><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => { const selected = Array.from(event.target.files || []); const invalid = selected.find((file) => !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024); if (invalid) { setFormError("Choose JPEG, PNG, WebP or GIF images smaller than 10 MB each."); event.target.value = ""; return; } setFiles(selected); setFormError(""); }} /><span><ImagePlus size={25} /></span><strong>Choose document images</strong><small>{files.length ? `${files.length} selected · choose again to replace` : "JPEG, PNG, WebP or GIF · up to 10 MB each"}</small></label><SelectedImagePreviews files={files} /><div className="project-sale-review"><strong>Ready to save</strong><span>{kind === "flat" ? "Flat" : "Shop"} {unit} · {floorName(Number(floor))}</span><span>{buyer} · {formatPKR(Number(price.replace(/,/g, "")))}</span></div></>}
      {formError && <p className="project-sale-error" role="alert">{formError}</p>}
    </div>
    <DialogFooter className="project-sale-footer">{step > 0 && <button type="button" className="project-sale-secondary" disabled={saving} onClick={() => { setStep(step - 1); setFormError(""); }}><ChevronLeft size={16} /> Back</button>}<button type="button" className="project-sale-secondary" disabled={saving} onClick={onClose}>Cancel</button><button type="button" className="project-sales-primary" disabled={saving} onClick={step === 2 ? save : next}>{saving ? "Saving…" : step === 2 ? "Save sale" : "Next"}</button></DialogFooter>
  </DialogContent></Dialog>;
}
