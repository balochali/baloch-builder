import { useRef, useState } from "react";
import { AttachmentUpload } from "@/components/AttachmentUpload";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { saveProjectSaleImage, type DocumentRecord } from "@/data/repositories/documentsRepository";
import type { ProjectSale } from "@/data/repositories/projectSalesRepository";
export function SaleDocumentsDialog({
  sale,
  onClose,
  onSaved,
}: {
  sale: ProjectSale;
  onClose: () => void;
  onSaved: (rows: DocumentRecord[]) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function save() {
    if (lock.current || !files.length) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const results = await Promise.allSettled(
        files.map((file) => saveProjectSaleImage(sale.id, file, sale.sale_date)),
      );
      const saved = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      onSaved(saved);
      const failed = files.filter((_, i) => results[i].status === "rejected");
      setFiles(failed);
      if (failed.length)
        setError("Some documents could not be saved. Retry to upload only the remaining files.");
      else onClose();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="project-sale-dialog">
        <DialogHeader>
          <DialogTitle>Add sale documents</DialogTitle>
          <p>
            {sale.buyer_name} · {sale.kind} {sale.unit_number}
          </p>
        </DialogHeader>
        <div className="project-sale-dialog-body">
          <AttachmentUpload
            files={files}
            onChange={setFiles}
            disabled={busy}
            title="Optional documents"
            label="Choose document images"
            onError={setError}
          />
          {error && <p role="alert">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Close
          </Button>
          <Button disabled={busy || !files.length} onClick={() => void save()}>
            {busy ? "Saving…" : "Save documents"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
