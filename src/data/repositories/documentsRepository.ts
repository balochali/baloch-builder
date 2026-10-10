import { validateAttachment } from "@/domain/attachments";
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
  project_id?: string | null;
  source_name?: string | null;
  created_at: string;
}

export async function listDocuments(): Promise<DocumentRecord[]> {
  return query<DocumentRecord>(
    `SELECT d.id, d.title, d.doc_type, d.doc_date, COALESCE(d.notes, t.method) AS notes, d.file_path, d.mime, d.size,
       d.owner_type, d.owner_id, p.id AS project_id, p.name AS project_name, d.created_at,
       CASE WHEN d.owner_type = 'land' THEN l.title
            WHEN d.owner_type = 'project_sale' THEN s.buyer_name || ' · ' || s.kind || ' ' || s.unit_number
            ELSE COALESCE(c.name, t.description) END AS source_name
     FROM documents d
     LEFT JOIN land l ON d.owner_type = 'land' AND l.id = d.owner_id
     LEFT JOIN transactions t ON d.owner_type = 'transaction' AND t.id = d.owner_id
     LEFT JOIN project_sales s ON d.owner_type = 'project_sale' AND s.id = d.owner_id
     LEFT JOIN partnerships ps ON d.owner_type = 'partnership' AND ps.id = d.owner_id
     LEFT JOIN partners partner ON partner.id = COALESCE(t.partner_id, ps.partner_id)
     LEFT JOIN contacts c ON c.id = COALESCE(t.contact_id, partner.contact_id)
     LEFT JOIN projects p ON p.id = COALESCE(l.project_id, t.project_id, s.project_id, ps.project_id, CASE WHEN d.owner_type = 'project' THEN d.owner_id END)
     WHERE d.archived = 0 ORDER BY d.created_at DESC`,
  );
}

export async function listLandPaymentReceipts(): Promise<DocumentRecord[]> {
  return (await listDocuments()).filter((document) => document.doc_type === "land_payment_receipt");
}

export async function listBankPaymentReceipts(): Promise<DocumentRecord[]> {
  const kinds = new Set([
    "amanat_deposit_receipt",
    "amanat_return_receipt",
    "land_payment_receipt",
    "land_sale_receipt",
    "project_cost_receipt",
    "construction_cost_receipt",
    "partner_contribution_receipt",
    "partner_payout_receipt",
  ]);
  return (await listDocuments()).filter(
    (document) => document.doc_type && kinds.has(document.doc_type),
  );
}

export async function listProjectSaleDocuments(projectId: string): Promise<DocumentRecord[]> {
  return query<DocumentRecord>(
    `SELECT d.id, d.title, d.doc_type, d.doc_date, d.notes, d.file_path, d.mime, d.size,
       d.owner_type, d.owner_id, p.name AS project_name, d.created_at
     FROM documents d
     JOIN project_sales s ON d.owner_type = 'project_sale' AND s.id = d.owner_id
     JOIN projects p ON p.id = s.project_id
     WHERE d.archived = 0 AND s.archived = 0 AND s.project_id = ? ORDER BY d.created_at DESC`,
    [projectId],
  );
}

export async function saveProjectSaleImage(
  saleId: string,
  file: File,
  date: string,
  docType: "project_sale_document" | "land_sale_receipt" = "project_sale_document",
): Promise<DocumentRecord> {
  if (!saleId) throw new Error("Sale record is missing");
  validateAttachment(file, true);
  const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
  const path = await invoke<string>("save_image_attachment", { bytes, mime: file.type });
  const id = newId();
  const timestamp = now();
  await execute(
    `INSERT INTO documents (id, title, doc_type, doc_date, notes, file_path, mime, size,
       owner_type, owner_id, created_at, updated_at, archived, custom)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 'project_sale', ?, ?, ?, 0, '{}')`,
    [id, file.name, docType, date, path, file.type, file.size, saleId, timestamp, timestamp],
  );
  const rows = await query<DocumentRecord>(`SELECT * FROM documents WHERE id = ?`, [id]);
  if (!rows[0]) throw new Error("Image was saved but could not be loaded");
  return rows[0];
}

export async function listProjectCostDocuments(projectId: string): Promise<DocumentRecord[]> {
  return query<DocumentRecord>(
    `SELECT d.id, d.title, d.doc_type, d.doc_date, COALESCE(d.notes, t.method) AS notes, d.file_path, d.mime, d.size,
       d.owner_type, d.owner_id, p.name AS project_name, d.created_at
     FROM documents d
     JOIN transactions t ON d.owner_type = 'transaction' AND t.id = d.owner_id
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE d.archived = 0 AND d.doc_type IN ('construction_cost_receipt', 'construction_supplier_bill', 'project_cost_receipt', 'project_cost_bill')
       AND t.project_id = ? ORDER BY d.created_at DESC`,
    [projectId],
  );
}

export async function listPartnerPaymentDocuments(
  projectId: string,
  partnerId: string,
): Promise<DocumentRecord[]> {
  return query<DocumentRecord>(
    `SELECT d.id, d.title, d.doc_type, d.doc_date, COALESCE(d.notes, t.method) AS notes,
       d.file_path, d.mime, d.size, d.owner_type, d.owner_id, p.name AS project_name, d.created_at
     FROM documents d JOIN transactions t ON d.owner_type = 'transaction' AND t.id = d.owner_id
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE d.archived = 0 AND t.archived = 0 AND t.project_id = ? AND t.partner_id = ?
       AND d.doc_type IN ('partner_contribution_receipt', 'partner_payout_receipt')
     ORDER BY d.created_at DESC`,
    [projectId, partnerId],
  );
}

export async function saveConstructionCostReceipt(
  transactionId: string,
  file: File,
  date: string,
  method: string,
): Promise<DocumentRecord> {
  return saveProjectCostAttachment(transactionId, file, date, "construction_cost_receipt", method);
}

export async function saveConstructionSupplierBill(
  transactionId: string,
  file: File,
  date: string,
): Promise<DocumentRecord> {
  return saveProjectCostAttachment(transactionId, file, date, "construction_supplier_bill", null);
}

export async function saveActualCostReceipt(
  transactionId: string,
  file: File,
  date: string,
  method: string,
): Promise<DocumentRecord> {
  return saveProjectCostAttachment(transactionId, file, date, "project_cost_receipt", method);
}

export async function saveActualCostBill(
  transactionId: string,
  file: File,
  date: string,
): Promise<DocumentRecord> {
  return saveProjectCostAttachment(transactionId, file, date, "project_cost_bill", null);
}

export async function savePartnerContributionReceipt(
  transactionId: string,
  file: File,
  date: string,
  method: string,
): Promise<DocumentRecord> {
  return saveProjectCostAttachment(
    transactionId,
    file,
    date,
    "partner_contribution_receipt",
    method,
  );
}

export async function savePartnerPayoutReceipt(
  transactionId: string,
  file: File,
  date: string,
  method: string,
): Promise<DocumentRecord> {
  return saveProjectCostAttachment(transactionId, file, date, "partner_payout_receipt", method);
}

async function saveProjectCostAttachment(
  transactionId: string,
  file: File,
  date: string,
  type:
    | "construction_cost_receipt"
    | "construction_supplier_bill"
    | "project_cost_receipt"
    | "project_cost_bill"
    | "partner_contribution_receipt"
    | "partner_payout_receipt",
  method: string | null,
): Promise<DocumentRecord> {
  if (!transactionId) throw new Error("Payment is missing");
  if (type.startsWith("partner_")) validatePartnerDocument(file);
  else validateImage(file);
  const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
  const path = await invoke<string>("save_image_attachment", { bytes, mime: file.type });
  const id = newId();
  const timestamp = now();
  await execute(
    `INSERT INTO documents (id, title, doc_type, doc_date, notes, file_path, mime, size,
       owner_type, owner_id, created_at, updated_at, archived, custom)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'transaction', ?, ?, ?, 0, '{}')`,
    [
      id,
      file.name,
      type,
      date,
      method,
      path,
      file.type,
      file.size,
      transactionId,
      timestamp,
      timestamp,
    ],
  );
  const rows = await query<DocumentRecord>(`SELECT * FROM documents WHERE id = ?`, [id]);
  if (type.startsWith("partner_")) window.dispatchEvent(new Event("partner-receipts-updated"));
  if (!rows[0]) throw new Error("Receipt was saved but could not be loaded");
  return rows[0];
}

export async function listLandDocuments(landId: string): Promise<DocumentRecord[]> {
  return query<DocumentRecord>(
    `SELECT d.id, d.title, d.doc_type, d.doc_date, d.notes, d.file_path, d.mime, d.size,
       d.owner_type, d.owner_id, p.name AS project_name, d.created_at
     FROM documents d
     JOIN land l ON l.id = d.owner_id AND d.owner_type = 'land'
     LEFT JOIN projects p ON p.id = l.project_id
     WHERE d.archived = 0 AND d.owner_id = ? ORDER BY d.created_at DESC`,
    [landId],
  );
}

export async function readDocumentImage(document: DocumentRecord): Promise<string> {
  if (!document.file_path || !document.mime?.startsWith("image/"))
    throw new Error("Image is unavailable");
  const bytes = await invoke<number[]>("read_image_attachment", { path: document.file_path });
  return URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: document.mime }));
}

export async function saveLandImage(
  landId: string,
  file: File,
  acquiredDate: string,
): Promise<void> {
  return saveLandAttachment(landId, file, acquiredDate, "land_image", null);
}

export async function saveLandPaymentReceipt(
  landId: string,
  file: File,
  acquiredDate: string,
  paymentMethod: string,
): Promise<void> {
  return saveLandAttachment(landId, file, acquiredDate, "land_payment_receipt", paymentMethod);
}

async function saveLandAttachment(
  landId: string,
  file: File,
  acquiredDate: string,
  type: "land_image" | "land_payment_receipt",
  notes: string | null,
): Promise<void> {
  if (!landId) throw new Error("Land record is missing");
  validateAttachment(file, true);
  const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
  const path = await invoke<string>("save_image_attachment", { bytes, mime: file.type });
  const timestamp = now();
  await execute(
    `INSERT INTO documents (id, title, doc_type, doc_date, notes, file_path, mime, size,
       owner_type, owner_id, created_at, updated_at, archived, custom)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'land', ?, ?, ?, 0, '{}')`,
    [
      newId(),
      file.name,
      type,
      acquiredDate,
      notes,
      path,
      file.type,
      file.size,
      landId,
      timestamp,
      timestamp,
    ],
  );
}

function validateImage(file: File): void {
  validateAttachment(file);
}

export async function openDocument(path: string): Promise<void> {
  await invoke("open_file", { path });
}

export async function listAmanatReceipts(ownerId: string): Promise<DocumentRecord[]> {
  return query<DocumentRecord>(
    "SELECT *, NULL AS project_name FROM documents WHERE owner_id = ? AND owner_type IN ('personal_deposit', 'deposit_return') AND archived = 0 ORDER BY created_at",
    [ownerId],
  );
}
export async function saveAmanatReceipt(
  ownerId: string,
  ownerType: "personal_deposit" | "deposit_return",
  file: File,
  date: string,
  method: string,
): Promise<void> {
  validateImage(file);
  const table = ownerType === "personal_deposit" ? "personal_deposits" : "deposit_returns";
  if (!(await query<{ id: string }>(`SELECT id FROM ${table} WHERE id = ?`, [ownerId])).length)
    throw new Error("Payment not found");
  const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
  const path = await invoke<string>("save_image_attachment", { bytes, mime: file.type });
  const timestamp = now();
  await execute(
    `INSERT INTO documents (id, title, doc_type, doc_date, notes, file_path, mime, size, owner_type, owner_id, created_at, updated_at, archived, custom) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '{}')`,
    [
      newId(),
      file.name,
      ownerType === "personal_deposit" ? "amanat_deposit_receipt" : "amanat_return_receipt",
      date,
      method,
      path,
      file.type,
      file.size,
      ownerType,
      ownerId,
      timestamp,
      timestamp,
    ],
  );
}

export function validatePartnerDocument(file: File): void {
  validateAttachment(file, true);
}
export async function savePartnerDocument(partnershipId: string, file: File): Promise<void> {
  validatePartnerDocument(file);
  const owners = await query<{ id: string }>(
    "SELECT id FROM partnerships WHERE id = ? AND archived = 0",
    [partnershipId],
  );
  if (!owners.length) throw new Error("Partner agreement not found");
  const path = await invoke<string>("save_image_attachment", {
    bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
    mime: file.type,
  });
  const stamp = now();
  await execute(
    "INSERT INTO documents (id, title, doc_type, file_path, mime, size, owner_type, owner_id, created_at, updated_at, archived, custom) VALUES (?, ?, 'partner_document', ?, ?, ?, 'partnership', ?, ?, ?, 0, '{}')",
    [newId(), file.name, path, file.type, file.size, partnershipId, stamp, stamp],
  );
}

export async function listTransactionReceipts(transactionId: string): Promise<DocumentRecord[]> {
  return query<DocumentRecord>(
    "SELECT * FROM documents WHERE archived = 0 AND owner_type = 'transaction' AND owner_id = ? AND doc_type IN ('partner_contribution_receipt', 'partner_payout_receipt') ORDER BY created_at DESC",
    [transactionId],
  );
}
