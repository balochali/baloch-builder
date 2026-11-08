import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  can,
  partnerProfile,
  type JournalRow,
  type MasterPartner,
  type Role,
} from "@baloch/shared";
import { api } from "@/data/api";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { downloadFundingFile, FundingTable, Metrics, Money } from "./FundingUI";
import { partnerTotals } from "./fundingView";
import { encodeAttachments } from "./projectSite";
import "./projects.css";

export function createNamedPartner(name: string) {
  return api<MasterPartner>("partners", "POST", {
    name,
    role: "Partner",
    status: "Active",
    phone: "",
    email: "",
    address: "",
    idNumber: "",
    bankDetails: "",
    joinedDate: "",
    notes: "",
  });
}

export function PartnerEditor({
  partner,
  close,
  onSaved,
}: {
  partner?: MasterPartner;
  close: () => void;
  onSaved: (partner: MasterPartner) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = partnerProfile.safeParse({
      ...Object.fromEntries(new FormData(event.currentTarget)),
      role: partner?.role ?? "Partner",
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api<MasterPartner>(
        partner ? `partners/${partner.id}` : "partners",
        partner ? "PUT" : "POST",
        parsed.data,
      );
      onSaved(result);
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
        <DialogTitle>{partner ? "Edit partner" : "Add partner"}</DialogTitle>
        <DialogDescription>Keep contact and payout details together.</DialogDescription>
        <form onSubmit={submit}>
          <fieldset className="project-form-grid" disabled={busy}>
            <label>
              Name
              <Input name="name" defaultValue={partner?.name} required autoFocus maxLength={120} />
            </label>
            <label>
              Role
              <Input readOnly value={partner?.role ?? "Partner"} />
            </label>
            <label>
              Phone
              <Input name="phone" defaultValue={partner?.phone} type="tel" maxLength={120} />
            </label>
            <label>
              Email
              <Input name="email" defaultValue={partner?.email} type="email" />
            </label>
            <label>
              Address
              <Input name="address" defaultValue={partner?.address} maxLength={500} />
            </label>
            <label>
              ID number
              <Input name="idNumber" defaultValue={partner?.idNumber} maxLength={120} />
            </label>
            <label>
              Bank details for payouts
              <Input name="bankDetails" defaultValue={partner?.bankDetails} maxLength={500} />
            </label>
            <label>
              Joined date
              <Input name="joinedDate" type="date" defaultValue={partner?.joinedDate} />
            </label>
            <label>
              Status
              <select name="status" defaultValue={partner?.status ?? "Active"}>
                <option>Active</option>
                {partner?.role !== "Owner" && <option>Exited</option>}
              </select>
            </label>
            <label className="project-full">
              Notes
              <Input name="notes" defaultValue={partner?.notes} maxLength={500} />
            </label>
          </fieldset>
          {error && (
            <p role="alert" className="project-save-error">
              {error}
            </p>
          )}
          <div className="project-modal-actions">
            <button type="button" className="projects-secondary" disabled={busy} onClick={close}>
              Cancel
            </button>
            <button className="projects-primary" disabled={busy}>
              {busy ? "Saving..." : "Save partner"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type PartnerDetail = {
  partner: MasterPartner;
  lines: (JournalRow & { projectCode: string; projectName: string })[];
  documents: { id: string; name: string }[];
};
export function PartnersMaster({ role }: { role: Role }) {
  const { partnerId } = useParams();
  const [partners, setPartners] = useState<MasterPartner[]>();
  const [detail, setDetail] = useState<PartnerDetail>();
  const [edit, setEdit] = useState<MasterPartner | null>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const manage = can(role, "manageProjects");
  useEffect(() => {
    let active = true;
    if (partnerId)
      api<PartnerDetail>(`partners/${partnerId}`)
        .then((value) => {
          if (active) setDetail(value);
        })
        .catch((cause) => {
          if (active) setError(String(cause));
        });
    else
      api<MasterPartner[]>("partners")
        .then((value) => {
          if (active) setPartners(value);
        })
        .catch((cause) => {
          if (active) setError(String(cause));
        });
    return () => {
      active = false;
    };
  }, [partnerId]);
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const [attachment] = await encodeAttachments([file]);
      const document = await api<PartnerDetail["documents"][number]>(
        `partners/${partnerId}/documents`,
        "POST",
        attachment,
      );
      setDetail((value) =>
        value ? { ...value, documents: [...value.documents, document] } : value,
      );
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  const totals = partnerTotals(detail?.lines ?? []);
  const projects = [
    ...new Map(detail?.lines.map((row) => [row.projectCode, row.projectName]) ?? []).entries(),
  ];
  return (
    <section className="builder-projects">
      {partnerId && (
        <Link className="project-back" to="/partners">
          ← Partners
        </Link>
      )}
      <header className="projects-heading">
        <div>
          <span className="projects-eyebrow">PROJECT FUNDING</span>
          <h1>{partnerId ? (detail?.partner.name ?? "Partner") : "Partners"}</h1>
        </div>
        {manage && (!partnerId || detail) && (
          <button
            className="projects-primary"
            onClick={() => setEdit(partnerId ? detail?.partner : null)}
          >
            {partnerId ? "Edit partner" : "Add partner"}
          </button>
        )}
      </header>
      {error && (
        <p role="alert" className="project-save-error">
          {error}
        </p>
      )}
      {!partnerId &&
        (!partners ? (
          <p role="status">Loading partners...</p>
        ) : !partners.length ? (
          <p>No partners added yet.</p>
        ) : (
          <FundingTable headers={["Name", "Role", "Phone", "Status"]}>
            {partners.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/partners/${p.id}`}>{p.name}</Link>
                </td>
                <td>{p.role}</td>
                <td>{p.phone || "—"}</td>
                <td>{p.status}</td>
              </tr>
            ))}
          </FundingTable>
        ))}
      {partnerId && detail && (
        <>
          <section className="project-detail-panel">
            <h2>Profile</h2>
            <dl className="project-info">
              {[
                ["Role", detail.partner.role],
                ["Status", detail.partner.status],
                ["Phone", detail.partner.phone],
                ["Email", detail.partner.email],
                ["Address", detail.partner.address],
                ["ID number", detail.partner.idNumber],
                ["Bank details", detail.partner.bankDetails],
                ["Joined date", detail.partner.joinedDate],
                ["Notes", detail.partner.notes],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value || "—"}</dd>
                </div>
              ))}
            </dl>
          </section>
          <Metrics
            values={[
              ["Contributed", <Money value={totals.contributed} />],
              ["Capital returned", <Money value={totals.returned} />],
              ["Profit received", <Money value={totals.profit} />],
            ]}
          />
          <section className="project-detail-panel">
            <h2>By project</h2>
            {projects.length ? (
              <FundingTable headers={["Project", "Contributed", "Returned", "Profit received"]}>
                {projects.map(([code, name]) => {
                  const values = partnerTotals(detail.lines.filter((l) => l.projectCode === code));
                  return (
                    <tr key={code}>
                      <td>
                        {code ? (
                          <Link to={`/projects/${code}/partners`}>{name}</Link>
                        ) : (
                          "Unassigned"
                        )}
                      </td>
                      <td className="funding-numeric">
                        <Money value={values.contributed} />
                      </td>
                      <td className="funding-numeric">
                        <Money value={values.returned} />
                      </td>
                      <td className="funding-numeric">
                        <Money value={values.profit} />
                      </td>
                    </tr>
                  );
                })}
              </FundingTable>
            ) : (
              <p>No project activity yet.</p>
            )}
          </section>
          <section className="project-detail-panel">
            <div className="project-section-heading">
              <h2>Documents</h2>
              {manage && (
                <label className="projects-secondary project-upload">
                  {busy ? "Uploading..." : "Upload document"}
                  <input
                    type="file"
                    aria-label="Upload partner document"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void upload(file);
                    }}
                  />
                </label>
              )}
            </div>
            {detail.documents.length ? (
              <ul className="project-file-list">
                {detail.documents.map((doc) => (
                  <li key={doc.id}>
                    <span>{doc.name}</span>
                    <button
                      className="projects-secondary"
                      onClick={() =>
                        void downloadFundingFile(`partners/${partnerId}/documents/${doc.id}`).catch(
                          (cause) => setError(String(cause)),
                        )
                      }
                    >
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No documents uploaded yet.</p>
            )}
          </section>
        </>
      )}
      {edit !== undefined && (
        <PartnerEditor
          partner={edit ?? undefined}
          close={() => setEdit(undefined)}
          onSaved={(saved) => {
            if (partnerId) setDetail((value) => (value ? { ...value, partner: saved } : value));
            else setPartners((value) => [...(value ?? []), saved]);
          }}
        />
      )}
    </section>
  );
}
