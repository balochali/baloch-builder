import { useId, useState } from "react";
import { ImagePlus, type LucideIcon } from "lucide-react";
import { SelectedImagePreviews } from "@/components/attachments/ImageGallery";
import { attachmentAccept, validateAttachment } from "@/domain/attachments";
import "./attachment-upload.css";

type Props = {
  files: File[];
  onChange: (files: File[]) => void;
  title?: string;
  description?: string;
  label?: string;
  allowPdf?: boolean;
  disabled?: boolean;
  mode?: "append" | "replace";
  icon?: LucideIcon;
  onError?: (message: string) => void;
};
/** Selection only: callers retain ownership of persistence, retries and document links. */
export function AttachmentUpload({
  files,
  onChange,
  title = "Transaction receipt (optional)",
  description = "Upload a receipt, transfer screenshot or cheque image.",
  label = "Add transaction receipt",
  allowPdf = false,
  disabled = false,
  mode = "replace",
  icon: Icon = ImagePlus,
  onError,
}: Props) {
  const id = useId(),
    [error, setError] = useState("");
  return (
    <section className="attachment-upload">
      <div>
        <strong className="attachment-upload-title">
          <Icon size={21} aria-hidden="true" />
          {title}
        </strong>
        <p>{description}</p>
      </div>
      <label className="attachment-upload-picker" htmlFor={id}>
        <span className="attachment-upload-icon">
          <Icon size={30} aria-hidden="true" />
        </span>
        <strong>{label}</strong>
        <small>
          {files.length ? `${files.length} selected · ` : ""}Choose images
          {allowPdf ? " or PDFs" : ""} · up to 10 MB each
        </small>
        <input
          id={id}
          type="file"
          multiple
          disabled={disabled}
          accept={attachmentAccept(allowPdf)}
          onChange={(event) => {
            const selected = Array.from(event.target.files || []);
            event.target.value = "";
            if (!selected.length) return;
            try {
              selected.forEach((file) => validateAttachment(file, allowPdf));
              onChange(mode === "append" ? [...files, ...selected] : selected);
              setError("");
              onError?.("");
            } catch (cause) {
              const message = cause instanceof Error ? cause.message : String(cause);
              setError(message);
              onError?.(message);
            }
          }}
        />
      </label>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {files.length > 0 && (
        <>
          <ul className="attachment-upload-files">
            {files.map((file, index) => (
              <li key={index}>
                <span>{file.name}</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(files.filter((_, i) => i !== index))}
                  aria-label={`Remove ${file.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <SelectedImagePreviews files={files} />
        </>
      )}
    </section>
  );
}
