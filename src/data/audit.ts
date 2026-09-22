/**
 * data/audit.ts — Write audit_log rows for financial table writes.
 * Called by repositories; never called directly from UI.
 */
import { execute } from "@/data/client";
import { newId, now } from "@/data/ids";

export type AuditAction = "create" | "update" | "archive" | "delete";

/**
 * Write a single audit_log row.
 * @param entityType  The table name (e.g. "transactions")
 * @param entityId    The row id
 * @param action      What happened
 * @param oldData     Snapshot before (null for creates)
 * @param newData     Snapshot after (null for hard deletes — we don't do those)
 */
export async function writeAudit(
  entityType: string,
  entityId: string,
  action: AuditAction,
  oldData: object | null,
  newData: object | null,
): Promise<void> {
  await execute(
    `INSERT INTO audit_log
       (id, entity_type, entity_id, action, changed_at, old_json, new_json, actor)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId(),
      entityType,
      entityId,
      action,
      now(),
      oldData ? JSON.stringify(oldData) : null,
      newData ? JSON.stringify(newData) : null,
      null, // actor — will be a user/device identifier in a later version
    ],
  );
}
