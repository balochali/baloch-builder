import { PartnerEditor } from "./PartnersMaster";
import { useState, type FormEvent } from "react";
import { Plus, MapPin, FileText } from "lucide-react";
import {
  parcelSchema,
  parcelStages,
  parcelUnits,
  type LandParcel,
  type Project,
  type SiteParty,
} from "@baloch/shared";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/data/api";
import {
  areaNumber,
  encodeAttachments,
  totalLandArea,
  type AreaUnit,
  type SiteData,
} from "./projectSite";

function QuickAdd({
  id,
  close,
  onAdded,
}: {
  id: string;
  close: () => void;
  onAdded: (item: SiteParty) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    const name = String(fields.get("name")).trim();
    if (!name) {
      setError("Enter a name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const item = await api<SiteParty>(`projects/${id}/site/sellers`, "POST", {
        name,
        phone: fields.get("phone"),
        address: fields.get("address"),
        notes: fields.get("notes"),
      });
      onAdded(item);
      close();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <DialogContent className="project-detail-dialog">
        <DialogTitle>Add seller</DialogTitle>
        <DialogDescription>Save the contact and select it for this parcel.</DialogDescription>
        <form onSubmit={submit}>
          <fieldset disabled={busy} className="project-form-grid">
            <label className="project-full">
              Name
              <Input name="name" autoFocus required maxLength={120} />
            </label>
            {
              <>
                <label>
                  Phone
                  <Input name="phone" type="tel" maxLength={120} />
                </label>
                <label>
                  Address
                  <Input name="address" maxLength={500} />
                </label>
                <label className="project-full">
                  Notes
                  <Input name="notes" maxLength={500} />
                </label>
              </>
            }
          </fieldset>
          {error && <p role="alert">{error}</p>}
          <div className="project-modal-actions">
            <button className="projects-secondary" type="button" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button className="projects-primary" disabled={busy}>
              {busy ? "Saving..." : "Save seller"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectLand({
  project,
  site,
  manage,
  onSite,
}: {
  project: Project;
  site: SiteData;
  manage: boolean;
  onSite: (update: (site: SiteData) => SiteData) => void;
}) {
  const [unit, setUnit] = useState<AreaUnit>("Marla");
  const [editing, setEditing] = useState<LandParcel | null>();
  const [acquisition, setAcquisition] = useState<"purchase" | "partner_contribution">("purchase");
  const [seller, setSeller] = useState("");
  const [partner, setPartner] = useState("");
  const [quick, setQuick] = useState<"seller" | "partner">();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const partners = site.partners;
  function open(parcel: LandParcel | null) {
    setEditing(parcel);
    setAcquisition(parcel?.acquisitionType ?? "purchase");
    setSeller(parcel?.sellerPartyId ?? "");
    setPartner(parcel?.contributingPartnerId ?? "");
    setError("");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const fields = new FormData(event.currentTarget);
    const value = (key: string) => String(fields.get(key) ?? "");
    const parsed = parcelSchema.safeParse({
      id: editing?.id ?? crypto.randomUUID(),
      name: value("name"),
      address: value("address"),
      mapLink: value("mapLink"),
      area: { value: Number(value("area")), unit: value("unit") },
      acquisitionType: acquisition,
      sellerPartyId: acquisition === "purchase" ? seller || undefined : undefined,
      contributingPartnerId:
        acquisition === "partner_contribution" ? partner || undefined : undefined,
      stage: value("stage"),
      agreementRef: value("agreementRef"),
      agreementDate: value("agreementDate"),
      facing: value("facing"),
      notes: value("notes"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const files = await encodeAttachments(
        fields.getAll("files").filter((file): file is File => file instanceof File && !!file.name),
      );
      const parcel = await api<LandParcel>(`projects/${project.id}/site/parcel`, "PUT", {
        parcel: parsed.data,
        files,
      });
      onSite((current) => ({
        ...current,
        parcels: current.parcels.some((p) => p.id === parcel.id)
          ? current.parcels.map((p) => (p.id === parcel.id ? parcel : p))
          : [...current.parcels, parcel],
      }));
      setEditing(undefined);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setSaving(false);
    }
  }
  async function download(fileId: string) {
    setError("");
    try {
      const { name, content } = await api<{ name: string; content: string }>(
        `projects/${project.id}/files/${fileId}`,
      );
      const url = URL.createObjectURL(
        new Blob([Uint8Array.from(atob(content), (c) => c.charCodeAt(0))]),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(String(cause));
    }
  }
  return (
    <section className="project-site">
      <div className="project-section-heading">
        <h2>Land parcels</h2>
        {manage && site.parcels.length > 0 && (
          <button className="projects-primary" onClick={() => open(null)}>
            <Plus size={16} /> Add land
          </button>
        )}
      </div>
      <p className="site-banner">Land prices, payments and funding will be added here later.</p>
      <dl className="feasibility-metrics">
        <div>
          <dt>Number of parcels</dt>
          <dd>{site.parcels.length}</dd>
        </div>
        <div>
          <dt>Total land area</dt>
          <dd>
            {areaNumber(totalLandArea(site.parcels, unit))} {unit}
          </dd>
        </div>
      </dl>
      <label className="site-unit-select">
        Display unit
        <select value={unit} onChange={(e) => setUnit(e.target.value as AreaUnit)}>
          {parcelUnits.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
      </label>
      {editing === undefined && error && (
        <p role="alert" className="project-save-error">
          {error}
        </p>
      )}
      {!site.parcels.length && (
        <div className="projects-empty">
          <MapPin size={28} />
          <h3>No land added yet</h3>
          <p>Add the first parcel to track its area and documents.</p>
          {manage && (
            <button className="projects-primary" onClick={() => open(null)}>
              <Plus size={16} /> Add land
            </button>
          )}
        </div>
      )}
      <div className="project-records">
        {site.parcels.map((parcel) => (
          <article key={parcel.id} className="project-detail-panel">
            <div className="project-section-heading">
              <div>
                <h3>{parcel.name}</h3>
                <span className="project-status">{parcel.stage}</span>
              </div>
              {manage && (
                <button className="projects-secondary" onClick={() => open(parcel)}>
                  Edit parcel
                </button>
              )}
            </div>
            <dl className="project-info">
              <div>
                <dt>Area</dt>
                <dd>
                  {areaNumber(parcel.area.value)} {parcel.area.unit}
                </dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>
                  {parcel.address || "—"}{" "}
                  {parcel.mapLink && (
                    <a href={parcel.mapLink} target="_blank" rel="noreferrer">
                      Map
                    </a>
                  )}
                </dd>
              </div>
              <div>
                <dt>Acquisition</dt>
                <dd>
                  {parcel.acquisitionType === "purchase"
                    ? "Purchased from seller"
                    : "Contributed by partner"}
                </dd>
              </div>
              <div>
                <dt>{parcel.acquisitionType === "purchase" ? "Seller" : "Partner"}</dt>
                <dd>
                  {(parcel.acquisitionType === "purchase"
                    ? site.sellers.find((s) => s.id === parcel.sellerPartyId)
                    : partners.find((p) => p.id === parcel.contributingPartnerId)
                  )?.name ?? "—"}
                </dd>
              </div>
              <div>
                <dt>Agreement or registry reference</dt>
                <dd>{parcel.agreementRef || "—"}</dd>
              </div>
              <div>
                <dt>Agreement date</dt>
                <dd>{parcel.agreementDate || "—"}</dd>
              </div>
              <div>
                <dt>Facing / corner</dt>
                <dd>{parcel.facing || "—"}</dd>
              </div>
              <div>
                <dt>Notes</dt>
                <dd>{parcel.notes || "—"}</dd>
              </div>
            </dl>
            {parcel.attachments.length > 0 && (
              <ul className="project-file-list">
                {parcel.attachments.map((file) => (
                  <li key={file.id}>
                    <FileText size={16} />
                    <span>{file.name}</span>
                    <button className="projects-secondary" onClick={() => void download(file.id)}>
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
      {editing !== undefined && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !saving) setEditing(undefined);
          }}
        >
          <DialogContent className="project-detail-dialog">
            <DialogTitle>{editing ? "Edit parcel" : "Add land"}</DialogTitle>
            <DialogDescription>
              Record the parcel’s location, ownership and documents.
            </DialogDescription>
            <form onSubmit={submit}>
              <fieldset className="project-form-grid" disabled={saving}>
                <label>
                  Parcel name / plot number
                  <Input
                    name="name"
                    defaultValue={editing?.name}
                    maxLength={500}
                    required
                    autoFocus
                  />
                </label>
                <label>
                  Address / location
                  <Input name="address" defaultValue={editing?.address} maxLength={500} />
                </label>
                <label className="project-full">
                  Map link
                  <Input
                    name="mapLink"
                    type="url"
                    defaultValue={editing?.mapLink}
                    placeholder="https://"
                  />
                </label>
                <label>
                  Area
                  <Input
                    name="area"
                    type="number"
                    min="0.000001"
                    step="any"
                    defaultValue={editing?.area.value}
                    required
                  />
                </label>
                <label>
                  Unit
                  <select name="unit" defaultValue={editing?.area.unit ?? "Marla"}>
                    {parcelUnits.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Acquisition type
                  <select
                    value={acquisition}
                    onChange={(e) => setAcquisition(e.target.value as typeof acquisition)}
                  >
                    <option value="purchase">Purchased from seller</option>
                    <option value="partner_contribution">Contributed by partner</option>
                  </select>
                </label>
                <div className="site-contact-field">
                  {acquisition === "purchase" ? (
                    <label>
                      Seller
                      <select value={seller} onChange={(e) => setSeller(e.target.value)} required>
                        <option value="">Select seller</option>
                        {site.sellers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label>
                      Partner
                      <select value={partner} onChange={(e) => setPartner(e.target.value)} required>
                        <option value="">Select partner</option>
                        {partners.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button
                    className="projects-secondary"
                    type="button"
                    onClick={() => setQuick(acquisition === "purchase" ? "seller" : "partner")}
                  >
                    {acquisition === "purchase" ? "Add seller" : "Create new partner"}
                  </button>
                </div>
                <label>
                  Stage
                  <select name="stage" defaultValue={editing?.stage ?? "Identified"}>
                    {parcelStages.map((stage) => (
                      <option key={stage}>{stage}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Agreement or registry reference
                  <Input name="agreementRef" defaultValue={editing?.agreementRef} maxLength={500} />
                </label>
                <label>
                  Agreement date
                  <Input name="agreementDate" type="date" defaultValue={editing?.agreementDate} />
                </label>
                <label>
                  Plot facing / corner
                  <Input name="facing" defaultValue={editing?.facing} maxLength={500} />
                </label>
                <label className="project-full">
                  Notes
                  <textarea name="notes" defaultValue={editing?.notes} maxLength={500} />
                </label>
                <label className="project-full">
                  Attachments
                  <Input name="files" type="file" multiple />
                </label>
              </fieldset>
              {error && (
                <p role="alert" className="project-save-error">
                  {error}
                </p>
              )}
              <div className="project-modal-actions">
                <button
                  type="button"
                  className="projects-secondary"
                  disabled={saving}
                  onClick={() => setEditing(undefined)}
                >
                  Cancel
                </button>
                <button className="projects-primary" disabled={saving}>
                  {saving ? "Saving..." : "Save parcel"}
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {quick === "seller" && (
        <QuickAdd
          id={project.id}
          close={() => setQuick(undefined)}
          onAdded={(item) => {
            onSite((current) => ({ ...current, sellers: [...current.sellers, item] }));
            setSeller(item.id);
          }}
        />
      )}
      {quick === "partner" && (
        <PartnerEditor
          close={() => setQuick(undefined)}
          onSaved={(item) => {
            onSite((current) => ({ ...current, partners: [...current.partners, item] }));
            setPartner(item.id);
          }}
        />
      )}
    </section>
  );
}
