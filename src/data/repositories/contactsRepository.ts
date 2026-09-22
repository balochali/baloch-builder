/**
 * data/repositories/contactsRepository.ts
 *
 * All SQL for the contacts table lives here.
 * Returns plain typed objects. Validates inputs with zod before writing.
 * Architecture rule: UI never writes SQL; it calls these functions.
 */
import { z } from "zod";
import { query, execute } from "@/data/client";
import { newId, now } from "@/data/ids";
import type { Contact } from "@/domain/types";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

export const CreateContactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().nullable().optional(),
  phone2: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const UpdateContactSchema = CreateContactSchema.partial().extend({
  id: z.string().uuid(),
});

export type CreateContactInput = z.infer<typeof CreateContactSchema>;
export type UpdateContactInput = z.infer<typeof UpdateContactSchema>;

// ---------------------------------------------------------------------------
// Repository functions
// ---------------------------------------------------------------------------

/** List all non-archived contacts, ordered by name */
export async function listContacts(search?: string): Promise<Contact[]> {
  if (search && search.trim()) {
    return query<Contact>(
      `SELECT * FROM contacts
       WHERE archived = 0
         AND (name LIKE ? OR phone LIKE ? OR address LIKE ?)
       ORDER BY name ASC`,
      [`%${search}%`, `%${search}%`, `%${search}%`],
    );
  }
  return query<Contact>(
    `SELECT * FROM contacts WHERE archived = 0 ORDER BY name ASC`,
  );
}

/** Get a single contact by id */
export async function getContactById(id: string): Promise<Contact | null> {
  const rows = await query<Contact>(`SELECT * FROM contacts WHERE id = ?`, [id]);
  return rows[0] ?? null;
}

/** Create a new contact */
export async function createContact(input: CreateContactInput): Promise<Contact> {
  const data = CreateContactSchema.parse(input);
  const id = newId();
  const ts = now();

  await execute(
    `INSERT INTO contacts (id, name, phone, phone2, address, notes, created_at, updated_at, archived, custom)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, '{}')`,
    [
      id,
      data.name,
      data.phone ?? null,
      data.phone2 ?? null,
      data.address ?? null,
      data.notes ?? null,
      ts,
      ts,
    ],
  );

  const contact = await getContactById(id);
  if (!contact) throw new Error("Failed to create contact");
  return contact;
}

/** Update an existing contact */
export async function updateContact(input: UpdateContactInput): Promise<Contact> {
  const data = UpdateContactSchema.parse(input);
  const { id, ...fields } = data;
  const ts = now();

  const setClauses: string[] = ["updated_at = ?"];
  const values: unknown[] = [ts];

  if (fields.name !== undefined) {
    setClauses.push("name = ?");
    values.push(fields.name);
  }
  if (fields.phone !== undefined) {
    setClauses.push("phone = ?");
    values.push(fields.phone ?? null);
  }
  if (fields.phone2 !== undefined) {
    setClauses.push("phone2 = ?");
    values.push(fields.phone2 ?? null);
  }
  if (fields.address !== undefined) {
    setClauses.push("address = ?");
    values.push(fields.address ?? null);
  }
  if (fields.notes !== undefined) {
    setClauses.push("notes = ?");
    values.push(fields.notes ?? null);
  }

  values.push(id);

  await execute(
    `UPDATE contacts SET ${setClauses.join(", ")} WHERE id = ?`,
    values,
  );

  const contact = await getContactById(id);
  if (!contact) throw new Error("Contact not found after update");
  return contact;
}

/** Archive a contact (soft delete) */
export async function archiveContact(id: string): Promise<void> {
  await execute(
    `UPDATE contacts SET archived = 1, updated_at = ? WHERE id = ?`,
    [now(), id],
  );
}
