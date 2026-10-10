import { usePagination } from "@/components/Pagination";
import { useEffect, useState } from "react";
import { Eye, FileImage, X } from "lucide-react";
import {
  readDocumentImage,
  openDocument,
  type DocumentRecord,
} from "@/data/repositories/documentsRepository";
import "./image-gallery.css";

export function SelectedImagePreviews({ files }: { files: File[] }) {
  const [previews, setPreviews] = useState<{ file: File; url: string }[]>([]);
  const [activeFile, setActiveFile] = useState<File | null>(null);
  useEffect(() => {
    if (typeof URL.createObjectURL !== "function") return;
    let current = true;
    let next: { file: File; url: string }[] = [];
    Promise.resolve().then(() => {
      if (!current) return;
      next = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
      setPreviews(next);
    });
    return () => {
      current = false;
      next.forEach(({ url }) => URL.revokeObjectURL(url));
    };
  }, [files]);
  if (!files.length) return null;
  return (
    <div className="selected-image-previews">
      {files.map((file) => {
        const url = previews.find((item) => item.file === file)?.url;
        return (
          <div
            key={`${file.name}-${file.size}-${file.lastModified}`}
            className="selected-image-card"
          >
            {url && file.type !== "application/pdf" ? (
              <img src={url} alt={`Preview of ${file.name}`} />
            ) : (
              <FileImage aria-hidden="true" />
            )}
            <span>
              <strong>{file.name}</strong>
              <small>{(file.size / 1024 / 1024).toFixed(1)} MB</small>
            </span>
            {url && (
              <button
                type="button"
                onClick={() => setActiveFile(file)}
                aria-label={`Preview ${file.name}`}
              >
                <Eye size={17} /> Preview
              </button>
            )}
          </div>
        );
      })}
      {activeFile && previews.some(({ file }) => file === activeFile) && (
        <div
          className="image-viewer-backdrop"
          role="presentation"
          onClick={() => setActiveFile(null)}
        >
          <div
            className="image-viewer"
            role="dialog"
            aria-modal="true"
            aria-label={`Preview ${activeFile.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="image-viewer-header">
              <strong>{activeFile.name}</strong>
              <button
                type="button"
                onClick={() => setActiveFile(null)}
                aria-label="Close image preview"
              >
                <X size={20} />
              </button>
            </div>
            {activeFile.type === "application/pdf" ? (
              <iframe
                title={activeFile.name}
                src={previews.find(({ file }) => file === activeFile)?.url}
                style={{ width: "100%", height: "70vh", border: 0 }}
              />
            ) : (
              <img
                src={previews.find(({ file }) => file === activeFile)?.url}
                alt={activeFile.name}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SavedImageGallery({ documents }: { documents: DocumentRecord[] }) {
  const [active, setActive] = useState<DocumentRecord | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!active) return;
    let current = true;
    let objectUrl = "";
    readDocumentImage(active)
      .then((value) => {
        objectUrl = value;
        if (current) setUrl(value);
        else URL.revokeObjectURL(value);
      })
      .catch(() => {
        if (current) setError("Could not load this image.");
      });
    return () => {
      current = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [active]);
  const pages = usePagination(
    documents,
    JSON.stringify(documents.map((row) => row.id)),
    "attachments",
  );
  if (!documents.length) return null;
  function openPreview(document: DocumentRecord) {
    setUrl("");
    setError("");
    if (document.mime === "application/pdf" && document.file_path) {
      void openDocument(document.file_path).catch(() => setError("Could not open this PDF."));
      return;
    }
    setActive(document);
  }
  return (
    <div className="saved-image-gallery">
      {pages.controls}
      {error && !active && <p role="alert">{error}</p>}
      {pages.items.map((document) => (
        <button type="button" key={document.id} onClick={() => openPreview(document)}>
          <FileImage size={19} aria-hidden="true" />
          <span>{document.title}</span>
          <Eye size={16} aria-hidden="true" />
        </button>
      ))}
      {active && (
        <div className="image-viewer-backdrop" role="presentation" onClick={() => setActive(null)}>
          <div
            className="image-viewer"
            role="dialog"
            aria-modal="true"
            aria-label={`Preview ${active.title}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="image-viewer-header">
              <strong>{active.title}</strong>
              <button
                type="button"
                onClick={() => setActive(null)}
                aria-label="Close image preview"
              >
                <X size={20} />
              </button>
            </div>
            {error ? (
              <p role="alert">{error}</p>
            ) : url ? (
              <img src={url} alt={active.title} />
            ) : (
              <p>Loading image…</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
