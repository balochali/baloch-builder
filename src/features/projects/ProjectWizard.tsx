import { useEffect, useRef, useState, type FormEvent } from "react";
import { Building2, Plus, X } from "lucide-react";
import {
  areaUnits,
  basicsSchema,
  budgetSchema,
  emptyBasics,
  emptyBudget,
  projectStatuses,
  projectTypes,
  type Basics,
  type Budget,
  type Partner,
  type Project,
} from "@baloch/shared";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/data/api";
import { BuildingDrawing } from "./BuildingDrawing";

type PartnerOption = { id: string; name: string };
const titles = ["Name your project", "Project basics", "Partners & budget"];
const optionalNumber = (value: string) => (value === "" ? null : Number(value));

export function ProjectWizard({
  initial,
  startStep = 0,
  onClose,
  onSaved,
  onComplete,
}: {
  initial?: Project;
  startStep?: number;
  onClose: () => void;
  onSaved: (project: Project) => void;
  onComplete: (project: Project) => void;
}) {
  const [step, setStep] = useState(startStep);
  const [project, setProject] = useState(initial);
  const [reserved, setReserved] = useState(initial?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [basics, setBasics] = useState<Basics>(initial ?? emptyBasics);
  const [budget, setBudget] = useState<Budget>(initial ?? emptyBudget);
  const [options, setOptions] = useState<PartnerOption[]>([]);
  const [partnerName, setPartnerName] = useState("");
  const [partnerChoice, setPartnerChoice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);
  const pending = useRef(false);
  const reservation = useRef<Promise<{ id: string }> | null>(null);
  useEffect(() => {
    if (initial) return;
    let active = true;
    reservation.current ??= api<{ id: string }>("projects/reserve-id", "POST", {});
    reservation.current
      .then((value) => {
        if (active) setReserved(value.id);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [initial, retry]);
  useEffect(() => {
    if (step !== 2) return;
    let active = true;
    api<PartnerOption[]>("projects/partner-options")
      .then((rows) => {
        if (active) setOptions(rows);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [step]);
  function addPartner() {
    const option = options.find((item) => item.id === partnerChoice);
    const label = option?.name ?? partnerName.trim();
    if (!label) return;
    if (
      budget.partners.some(
        (item) => item.partnerId === option?.id || item.name.toLowerCase() === label.toLowerCase(),
      )
    ) {
      setError("This partner is already on the project.");
      return;
    }
    const partner = { partnerId: option?.id ?? crypto.randomUUID(), name: label, sharePercent: 0 };
    setBudget({ ...budget, partners: [...budget.partners, partner] });
    setPartnerChoice("");
    setPartnerName("");
    setError("");
  }
  function changePartner(index: number, partner: Partner) {
    setBudget({
      ...budget,
      partners: budget.partners.map((item, i) => (i === index ? partner : item)),
    });
  }
  async function advance(skip = false) {
    if (pending.current || !reserved || !name.trim()) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const basicsInput = step > 0 ? basicsSchema.parse(basics) : null;
      if (initial && !initial.draft && step < 2) {
        setStep(step + 1);
        return;
      }
      const finalBudget =
        step === 2 ? budgetSchema.parse(skip ? (initial ?? emptyBudget) : budget) : null;
      const next = !project
        ? await api<Project>("projects", "POST", { id: reserved, name: name.trim() })
        : await api<Project>(
            `projects/${project.id}`,
            "PATCH",
            initial && !initial.draft
              ? { step: "edit", name: name.trim(), basics: basicsInput, budget: finalBudget }
              : step === 0
                ? { step: "name", name: name.trim() }
                : step === 1
                  ? { step: "basics", basics: basicsInput }
                  : { step: "finish", budget: finalBudget },
          );
      setProject(next);
      onSaved(next);
      if (step === 2) {
        onClose();
        onComplete(next);
      } else setStep(step + 1);
    } catch (e) {
      setError(
        e instanceof Error && "issues" in e
          ? (e.issues as { message: string }[])[0].message
          : String(e),
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    void advance();
  }
  const share = budget.partners.reduce((sum, item) => sum + item.sharePercent, 0);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending.current) onClose();
      }}
    >
      <DialogContent className="project-create-dialog">
        <div className="project-modal-art">
          <BuildingDrawing />
          <span>
            <Building2 size={22} />
          </span>
        </div>
        <div className="project-modal-content">
          <ol className="project-steps" aria-label="Project setup progress">
            {titles.map((title, index) => (
              <li key={title} aria-current={step === index ? "step" : undefined}>
                {index + 1}. {title}
              </li>
            ))}
          </ol>
          <DialogTitle>{titles[step]}</DialogTitle>
          <DialogDescription>
            {step === 0
              ? "Next saves the project as a draft."
              : "These details are optional. You can edit them later."}
          </DialogDescription>
          <form key={step} onSubmit={submit}>
            <fieldset disabled={saving} className="project-form-grid">
              {step === 0 && (
                <>
                  <label>
                    Project name
                    <Input
                      autoFocus
                      required
                      maxLength={120}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Baloch Heights"
                    />
                  </label>
                  <label>
                    Project ID
                    <Input readOnly value={reserved} placeholder="Reserving ID…" />
                  </label>
                </>
              )}
              {step === 1 && (
                <>
                  <label>
                    Project type
                    <select
                      autoFocus
                      value={basics.type ?? ""}
                      onChange={(e) =>
                        setBasics({ ...basics, type: (e.target.value || null) as Basics["type"] })
                      }
                    >
                      <option value="">Select type</option>
                      {projectTypes.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Status
                    <select
                      value={basics.status}
                      onChange={(e) =>
                        setBasics({ ...basics, status: e.target.value as Basics["status"] })
                      }
                    >
                      {projectStatuses.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Address
                    <Input
                      maxLength={300}
                      value={basics.address}
                      onChange={(e) => setBasics({ ...basics, address: e.target.value })}
                    />
                  </label>
                  <label>
                    City
                    <Input
                      maxLength={120}
                      value={basics.city}
                      onChange={(e) => setBasics({ ...basics, city: e.target.value })}
                    />
                  </label>
                  <label>
                    Land area
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={basics.landArea?.value ?? ""}
                      onChange={(e) =>
                        setBasics({
                          ...basics,
                          landArea: e.target.value
                            ? {
                                value: Number(e.target.value),
                                unit: basics.landArea?.unit ?? "Marla",
                              }
                            : null,
                        })
                      }
                    />
                  </label>
                  <label>
                    Unit
                    <select
                      disabled={!basics.landArea}
                      value={basics.landArea?.unit ?? "Marla"}
                      onChange={(e) => {
                        if (basics.landArea)
                          setBasics({
                            ...basics,
                            landArea: {
                              ...basics.landArea,
                              unit: e.target.value as (typeof areaUnits)[number],
                            },
                          });
                      }}
                    >
                      {areaUnits.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Start date
                    <Input
                      type="date"
                      value={basics.startDate ?? ""}
                      onChange={(e) => setBasics({ ...basics, startDate: e.target.value || null })}
                    />
                  </label>
                  <label>
                    Expected completion
                    <Input
                      type="date"
                      min={basics.startDate ?? undefined}
                      value={basics.expectedEndDate ?? ""}
                      onChange={(e) =>
                        setBasics({ ...basics, expectedEndDate: e.target.value || null })
                      }
                    />
                  </label>
                </>
              )}
              {step === 2 && (
                <>
                  <label className="project-full">
                    Estimated budget (PKR)
                    <Input
                      autoFocus
                      type="number"
                      min="0"
                      step="any"
                      value={budget.estimatedBudget ?? ""}
                      onChange={(e) =>
                        setBudget({ ...budget, estimatedBudget: optionalNumber(e.target.value) })
                      }
                    />
                  </label>
                  <div className="project-full project-partner-rows">
                    {budget.partners.map((item, index) => (
                      <div className="project-partner-row" key={item.partnerId}>
                        <span>{item.name}</span>
                        <label>
                          Share %
                          <Input
                            aria-label={item.name + " share percent"}
                            type="number"
                            min="0"
                            max="100"
                            step="any"
                            value={item.sharePercent}
                            onChange={(e) =>
                              changePartner(index, {
                                ...item,
                                sharePercent: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                        <button
                          type="button"
                          aria-label={"Remove " + item.name}
                          className="projects-secondary"
                          onClick={() =>
                            setBudget({
                              ...budget,
                              partners: budget.partners.filter(
                                (p) => p.partnerId !== item.partnerId,
                              ),
                            })
                          }
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                    {options.length > 0 && (
                      <label>
                        Existing partner
                        <select
                          value={partnerChoice}
                          onChange={(e) => setPartnerChoice(e.target.value)}
                        >
                          <option value="">Choose a partner</option>
                          {options.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {!partnerChoice && (
                      <label>
                        New partner name
                        <Input
                          maxLength={120}
                          value={partnerName}
                          onChange={(e) => setPartnerName(e.target.value)}
                        />
                      </label>
                    )}
                    <button
                      type="button"
                      className="projects-secondary"
                      disabled={!partnerChoice && !partnerName.trim()}
                      onClick={addPartner}
                    >
                      <Plus size={16} /> Add partner
                    </button>
                    {budget.partners.length > 0 && Math.abs(share - 100) > 0.001 && (
                      <p role="status" className="project-share-warning">
                        Shares total {Number(share.toFixed(2))}%. You can save and adjust them
                        later.
                      </p>
                    )}
                  </div>
                </>
              )}
            </fieldset>
            {error && (
              <p role="alert" className="project-save-error">
                {error}
              </p>
            )}
            {!reserved && error && (
              <button
                type="button"
                className="projects-secondary"
                onClick={() => {
                  reservation.current = null;
                  setError("");
                  setRetry((v) => v + 1);
                }}
              >
                Retry ID reservation
              </button>
            )}
            <div className="project-modal-actions">
              {step > 0 && (
                <button
                  type="button"
                  disabled={saving}
                  className="projects-secondary"
                  onClick={() => {
                    setError("");
                    setStep(step - 1);
                  }}
                >
                  Back
                </button>
              )}
              <button
                type="button"
                disabled={saving}
                className="projects-secondary"
                onClick={onClose}
              >
                Cancel
              </button>
              {step === 2 && (!initial || initial.draft) && (
                <button
                  type="button"
                  disabled={saving}
                  className="projects-secondary"
                  onClick={() => void advance(true)}
                >
                  Skip for now
                </button>
              )}
              <button className="projects-primary" disabled={saving || !reserved || !name.trim()}>
                {saving
                  ? "Saving…"
                  : step < 2
                    ? "Next"
                    : initial
                      ? "Save project"
                      : "Create project"}
              </button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
