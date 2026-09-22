import { describe, it, expect, vi, beforeEach } from "vitest";
import * as client from "@/data/client";
import {
  createContact,
  listContacts,
  getContactById,
  updateContact,
  archiveContact,
} from "@/data/repositories/contactsRepository";
import type { Contact } from "@/domain/types";

describe("contactsRepository", () => {
  let contactsStore: Contact[] = [];

  beforeEach(() => {
    contactsStore = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Ali Baloch",
        phone: "03001234567",
        phone2: null,
        address: "Quetta",
        notes: "Land seller",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        archived: 0,
        custom: "{}",
      },
    ];

    vi.spyOn(client, "query").mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("WHERE id = ?")) {
        const id = params[0] as string;
        return contactsStore.filter((c) => c.id === id) as unknown[];
      }
      if (sql.includes("SELECT * FROM contacts")) {
        if (params.length > 0 && typeof params[0] === "string" && params[0].includes("%")) {
          const search = (params[0] as string).replace(/%/g, "").toLowerCase();
          return contactsStore.filter(
            (c) =>
              c.archived === 0 &&
              (c.name.toLowerCase().includes(search) ||
                (c.phone && c.phone.includes(search)) ||
                (c.address && c.address.toLowerCase().includes(search))),
          ) as unknown[];
        }
        return contactsStore.filter((c) => c.archived === 0) as unknown[];
      }
      return [] as unknown[];
    });

    vi.spyOn(client, "execute").mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("INSERT INTO contacts")) {
        // Note: archived and custom are NOT bound params here — the real
        // repository writes them as literals ("0" and "'{}'") in the SQL
        // text for a new contact, so they are hardcoded below instead of
        // being read from `params`.
        const [id, name, phone, phone2, address, notes, created_at, updated_at] = params;
        contactsStore.push({
          id: id as string,
          name: name as string,
          phone: (phone as string) || null,
          phone2: (phone2 as string) || null,
          address: (address as string) || null,
          notes: (notes as string) || null,
          created_at: created_at as string,
          updated_at: updated_at as string,
          archived: 0,
          custom: "{}",
        });
        return { rowsAffected: 1 };
      }
      if (sql.includes("UPDATE contacts SET archived = 1")) {
        const [updated_at, id] = params;
        const target = contactsStore.find((c) => c.id === id);
        if (target) {
          target.archived = 1;
          target.updated_at = updated_at as string;
          return { rowsAffected: 1 };
        }
      }
      if (sql.startsWith("UPDATE contacts SET") && !sql.includes("archived = 1")) {
        // The real repository builds its SET clause dynamically (only the
        // fields actually passed in, "updated_at" always first), so this
        // mock parses the column names out of the SQL instead of assuming
        // a fixed positional order.
        const setPart = sql.slice(sql.indexOf("SET") + 3, sql.indexOf("WHERE")).trim();
        const columns = setPart.split(",").map((c) => c.trim().split("=")[0].trim());
        const id = params[params.length - 1] as string;
        const target = contactsStore.find((c) => c.id === id);
        if (target) {
          const record = target as unknown as Record<string, unknown>;
          columns.forEach((col, i) => {
            record[col] = params[i] ?? null;
          });
          return { rowsAffected: 1 };
        }
      }
      return { rowsAffected: 0 };
    });
  });

  it("lists active contacts", async () => {
    const list = await listContacts();
    expect(list.length).toBe(1);
    expect(list[0].name).toBe("Ali Baloch");
  });

  it("filters contacts by search term", async () => {
    const matches = await listContacts("Ali");
    expect(matches.length).toBe(1);

    const none = await listContacts("Karachi");
    expect(none.length).toBe(0);
  });

  it("creates a new contact with validated inputs", async () => {
    const newContact = await createContact({
      name: "Tariq Khan",
      phone: "03339876543",
      address: "Hub Chowki",
    });

    expect(newContact.name).toBe("Tariq Khan");
    expect(newContact.phone).toBe("03339876543");
    expect(newContact.address).toBe("Hub Chowki");
    expect(newContact.archived).toBe(0);
    expect(newContact.id).toBeDefined();

    const all = await listContacts();
    expect(all.length).toBe(2);
  });

  it("updates an existing contact", async () => {
    const updated = await updateContact({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Ali Baloch Updated",
      phone: "03009999999",
    });

    expect(updated.name).toBe("Ali Baloch Updated");
    expect(updated.phone).toBe("03009999999");
  });

  it("gets a single contact by id", async () => {
    const found = await getContactById("11111111-1111-4111-8111-111111111111");
    expect(found?.name).toBe("Ali Baloch");

    const missing = await getContactById("does-not-exist");
    expect(missing).toBeNull();
  });

  it("soft-deletes (archives) a contact", async () => {
    await archiveContact("11111111-1111-4111-8111-111111111111");
    const active = await listContacts();
    expect(active.length).toBe(0);
  });
});
