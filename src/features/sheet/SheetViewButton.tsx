import { useState } from "react";
import { Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorkbookEditor } from "./ProjectWorkbook";
import { usePageRefresh } from "./PageRefresh";
import type { ProjectSheet } from "./projectSheets";
import "./sheet.css";

interface SheetViewButtonProps {
  /** Window title, e.g. "Contacts sheet". */
  title: string;
  /** Unique name; keeps unsaved typing on this device. */
  storageId: string;
  /** Creates the sheets (called once). */
  createSheets: () => ProjectSheet[];
  /** Called after something was saved or deleted. Default: the page reloads its data. */
  onChanged?: () => void;
  label?: string;
}

/** A button that opens every record of a page in an Excel-like sheet (view, add, edit, delete). */
export function SheetViewButton({
  title,
  storageId,
  createSheets,
  onChanged,
  label = "Sheet view",
}: SheetViewButtonProps) {
  const [sheets] = useState(createSheets);
  const refreshPage = usePageRefresh();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(sheets[0]?.id ?? "");
  const [changed, setChanged] = useState(false);
  const sheet = sheets.find((item) => item.id === selected) ?? sheets[0];
  if (!sheet) return null;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="sheet-open-button"
        title="See and change everything in an Excel-like table"
        onClick={() => {
          setChanged(false);
          setOpen(true);
        }}
      >
        <Table2 size={16} aria-hidden /> {label}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          setOpen(next);
          if (!next && changed) (onChanged ?? refreshPage)();
        }}
      >
        <DialogContent className="sheet-modal">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Work here like in Excel. Everything you save is updated in the software.
            </DialogDescription>
          </DialogHeader>
          {sheets.length > 0 && (
            <div className="workbook-tabs" role="tablist" aria-label="Choose a sheet">
              {sheets.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  id={`worksheet-tab-${item.id}`}
                  aria-controls="worksheet-panel"
                  aria-selected={item.id === sheet.id}
                  disabled={busy}
                  onClick={() => setSelected(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
          <div className="sheet-page">
            <WorkbookEditor
              key={sheet.id}
              sheet={sheet}
              storageKey={`bb-sheet-v1:${storageId}:${sheet.id}`}
              onSaved={() => setChanged(true)}
              onBusy={setBusy}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
