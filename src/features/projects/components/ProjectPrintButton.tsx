import { useRef, useState } from "react";
import { Printer, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { listProjectSales } from "@/data/repositories/projectSalesRepository";
import { listPartnerPayouts } from "@/data/repositories/projectPayoutsRepository";
import {
  buildProjectReport,
  reportSections,
  type ProjectReportData,
  type ReportSection,
} from "./projectReport";
import "./project-print.css";

export function ProjectPrintButton({
  data,
}: {
  data: Omit<ProjectReportData, "sales" | "payouts">;
}) {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState<ReportSection[]>(["dashboard"]);
  const [html, setHtml] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);
  async function prepare() {
    if (!selected.length || busy) return;
    setBusy(true);
    setError("");
    setReady(false);
    try {
      const [sales, payouts] = await Promise.all([
        selected.some((s) => ["dashboard", "sales", "profit"].includes(s))
          ? listProjectSales(data.project.id)
          : Promise.resolve([]),
        selected.includes("profit") ? listPartnerPayouts(data.project.id) : Promise.resolve([]),
      ]);
      setHtml(buildProjectReport({ ...data, sales, payouts }, selected));
    } catch {
      setError("Could not prepare the report. Please try again; nothing has been printed.");
    } finally {
      setBusy(false);
    }
  }
  function print() {
    try {
      const target = frame.current?.contentWindow;
      if (!target || !ready) throw new Error("Not ready");
      target.focus();
      target.print();
    } catch {
      setError("The print dialog could not open. Please try again.");
    }
  }
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
          setHtml("");
          setError("");
          setReady(false);
        }}
      >
        <Printer size={17} /> Print project
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next);
        }}
      >
        <DialogContent className={`project-print-dialog ${html ? "has-preview" : ""}`}>
          <DialogHeader>
            <DialogTitle>
              <FileText size={23} />{" "}
              {html ? "Project report preview" : "What would you like to print?"}
            </DialogTitle>
            <DialogDescription>
              {html
                ? "Each section starts on a new A4 page. Print preview will show the final page breaks. You can choose a printer or Save as PDF in the print dialog."
                : `Choose the tabs to include for ${data.project.name}. Reports include all saved rows, not just the current page or filters.`}
            </DialogDescription>
          </DialogHeader>
          {html ? (
            <iframe
              ref={frame}
              title="Project report preview"
              srcDoc={html}
              onLoad={() => setReady(true)}
            />
          ) : (
            <>
              <div className="project-print-selection-actions">
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setSelected(reportSections.map((s) => s.id))}
                >
                  Select all
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => setSelected([])}>
                  Clear selection
                </Button>
              </div>
              <fieldset disabled={busy} className="project-print-options">
                <legend className="sr-only">Project tabs to print</legend>
                {reportSections.map((s) => (
                  <label key={s.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(s.id)}
                      onChange={(e) =>
                        setSelected((current) =>
                          e.target.checked
                            ? [...current, s.id]
                            : current.filter((id) => id !== s.id),
                        )
                      }
                    />
                    <span>
                      <strong>{s.label}</strong>
                      <small>{s.description}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <p className="project-print-note">
                {selected.length} of {reportSections.length} sections selected · Paragraphs and
                tables · A4 portrait
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <div className="project-print-actions">
            {html ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setHtml("");
                    setReady(false);
                  }}
                >
                  Change sections
                </Button>
                <Button disabled={!ready} onClick={print}>
                  <Printer size={17} /> Print / Save PDF
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button disabled={busy || !selected.length} onClick={() => void prepare()}>
                  {busy ? "Preparing report…" : "Preview report"}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
