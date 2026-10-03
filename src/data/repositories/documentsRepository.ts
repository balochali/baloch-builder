import { invoke } from "@tauri-apps/api/core";
import { execute, query } from "@/data/client";
import { newId, now } from "@/data/ids";

export interface DocumentRecord {
  id: string;
  title: string;
  doc_type: string | null;
  doc_date: string | null;
  notes: string | null;
  file_path: string | null;
  mime: string | null;
  size: number | null;
  owner_type: string | null;
  owner_id: string | null;
  project_name: string | null;
  created_at: string;
}

export async function listDocuments(): Promise<DocumentRecord[]> {
  return query<DocumentRecord>(
    `SELECT d.id, d.title, d.doc_type, d.doc_date, d.notes, d.file_path, d.mime, d.size,
       d.owner_type, d.owner_id, p.name AS project_name, d.created_at
     FROM documents d
     LEFT JOIN land l ON d.owner_type = 'land' AND l.id = d.owner_id
     LEFT JOIN projects p ON p.id = l.project_id
     WHERE d.archived = 0 ORDER BY d.created_at DESC`,
  );
}

export async function saveLandImage(
  landId: string,
  file: File,
  acquiredDate: string,
): Promise<void> {
  if (!landId) throw new Error("Land record is missing");
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type))
    throw new Error("Choose a JPEG, PNG, WebP or GIF image");
  if (!file.size || file.size > 10 * 1024 * 1024)
    throw new Error("Image must be smaller than 10 MB");
  const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
  const path = await invoke<string>("save_image_attachment", { bytes, mime: file.type });
  const timestamp = now();
  await execute(
    `INSERT INTO documents (id, title, doc_type, doc_date, notes, file_path, mime, size,
       owner_type, owner_id, created_at, updated_at, archived, custom)
     VALUES (?, ?, 'land_image', ?, NULL, ?, ?, ?, 'land', ?, ?, ?, 0, '{}')`,
    [newId(), file.name, acquiredDate, path, file.type, file.size, landId, timestamp, timestamp],
  );
}

export async function openDocument(path: string): Promise<void> {
  await invoke("open_file", { path });
}
