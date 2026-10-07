import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  listLandDocuments,
  readDocumentImage,
  type DocumentRecord,
} from "@/data/repositories/documentsRepository";
import elevation from "@/assets/building-elevation.svg";

export function LandPhotoSlider({ landId, title }: { landId: string; title: string }) {
  const [photos, setPhotos] = useState<DocumentRecord[]>([]);
  const [index, setIndex] = useState(0);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setPhotos([]);
    setIndex(0);
    listLandDocuments(landId)
      .then((rows) => {
        if (active) {
          setPhotos(
            rows.filter(
              (row) =>
                row.doc_type === "land_image" && row.mime?.startsWith("image/") && row.file_path,
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
  }, [landId, retry]);
  const photo = photos[index];
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setUrl("");
    if (!photo) return;
    setLoading(true);
    setError("");
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
        <img
          className="land-property-photo"
          src={url}
          alt={`${title} — ${photo?.title || `photo ${index + 1}`}`}
          onError={() => {
            setUrl("");
            setError("This image is unavailable.");
          }}
        />
      ) : (
        <div className="land-photo-placeholder">
          <img src={elevation} alt="" />
          <span role="status">
            {loading ? "Loading property photos…" : error || "No property photos added"}
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
