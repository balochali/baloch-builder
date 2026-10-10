import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import {
  listLandDocuments,
  readDocumentImage,
  type DocumentRecord,
} from "@/data/repositories/documentsRepository";
import elevation from "@/assets/building-elevation.svg";

export function LandPhotoSlider({
  landId,
  title,
  documentType = "land_image",
}: {
  landId: string;
  title: string;
  documentType?: "land_image" | "land_payment_receipt";
}) {
  const [preview, setPreview] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [photos, setPhotos] = useState<DocumentRecord[]>([]);
  const [index, setIndex] = useState(0);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setLoading(true);
        setError("");
        setPhotos([]);
        setIndex(0);
      }
    });
    listLandDocuments(landId)
      .then((rows) => {
        if (active) {
          setPhotos(
            rows.filter(
              (row) =>
                row.doc_type === documentType && row.mime?.startsWith("image/") && row.file_path,
            ),
          );
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError("Photos could not be loaded.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [landId, retry, documentType]);
  const photo = photos[index];
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    queueMicrotask(() => {
      if (active) {
        setUrl("");
        if (photo) {
          setLoading(true);
          setError("");
        }
      }
    });
    if (!photo)
      return () => {
        active = false;
      };
    readDocumentImage(photo)
      .then((value) => {
        objectUrl = value;
        if (active) {
          setUrl(value);
          setLoading(false);
        } else URL.revokeObjectURL(value);
      })
      .catch(() => {
        if (active) {
          setError("This image is unavailable.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo]);
  return (
    <section className="land-photo-slider" aria-label={`Photos of ${title}`}>
      {url ? (
        <button
          type="button"
          className="land-photo-open"
          aria-label={`Preview ${photo?.title || title}`}
          onClick={() => setPreview(true)}
        >
          <img
            className="land-property-photo"
            src={url}
            alt={`${title} — ${photo?.title || `photo ${index + 1}`}`}
            onError={() => {
              setUrl("");
              setError("This image is unavailable.");
            }}
          />
        </button>
      ) : (
        <div className="land-photo-placeholder">
          <img src={elevation} alt="" />
          <span role="status">
            {loading
              ? "Loading property photos…"
              : error ||
                (documentType === "land_payment_receipt"
                  ? "No receipt images added"
                  : "No property photos added")}
          </span>
          {error && (
            <button type="button" onClick={() => setRetry((value) => value + 1)}>
              Retry photos
            </button>
          )}
        </div>
      )}
      {photos.length > 0 && (
        <div className="land-photo-caption">
          <span>{photo?.title}</span>
          <span aria-live="polite">
            {index + 1} / {photos.length}
          </span>
        </div>
      )}
      {photo?.file_path && (
        <button
          type="button"
          className="land-photo-download"
          aria-label={`Download ${photo.title}`}
          title="Download image"
          disabled={downloading}
          onClick={async () => {
            setDownloading(true);
            try {
              await invoke("download_attachment", {
                path: photo.file_path,
                filename: title + "-" + photo.title,
              });
              toast.success("Image saved to Downloads");
            } catch {
              toast.error("Could not download the image. Please try again.");
            } finally {
              setDownloading(false);
            }
          }}
        >
          <Download size={18} />
        </button>
      )}
      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent
          className="land-slider-preview"
          aria-describedby={undefined}
          onClick={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>{photo?.title || title}</DialogTitle>
          </DialogHeader>
          {url && <img src={url} alt={photo?.title || title} />}
        </DialogContent>
      </Dialog>
      {photos.length > 1 && (
        <>
          <button
            className="land-photo-prev"
            type="button"
            aria-label={`Previous photo of ${title}`}
            onClick={() => setIndex((value) => (value - 1 + photos.length) % photos.length)}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            className="land-photo-next"
            type="button"
            aria-label={`Next photo of ${title}`}
            onClick={() => setIndex((value) => (value + 1) % photos.length)}
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}
    </section>
  );
}
