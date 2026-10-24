import { z } from "zod";
import { execute, query } from "@/data/client";
import { now } from "@/data/ids";
import { BankAccountSchema } from "@/domain/bankAccount";
import { CreateProjectSchema } from "./projectsRepository";
import { ProjectSaleSchema, type ProjectSaleInput } from "./projectSalesRepository";
import { ActualCostInputSchema, type ActualCostInput } from "./projectFinanceRepository";
import {
  PartnerContributionSchema,
  type PartnerContributionInput,
} from "./projectPartnersRepository";
import { PartnerPayoutSchema, type PartnerPayoutInput } from "./projectPayoutsRepository";
import { LandAcquisitionSchema, type LandAcquisitionInput } from "./projectStageRepository";
import { listDocuments } from "./documentsRepository";
import { LandSaleSchema, type LandSaleInput } from "./landSalesRepository";

function found(result: { rowsAffected: number }) {
  if (result.rowsAffected !== 1)
    throw new Error("This record is no longer available. Reopen the sheet.");
}

export async function updateSheetDocument(
  projectId: string,
  id: string,
  input: { title: string; doc_date: string; notes: string },
) {
  const value = z
    .object({
      title: z.string().trim().min(1).max(250),
      doc_date: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/),
      notes: z.string().trim().max(2000),
    })
    .parse(input);
  if (!(await listDocuments()).some((d) => d.id === id && d.project_id === projectId))
    throw new Error("Document is not part of this project");
  found(
    await execute(
      "UPDATE documents SET title = ?, doc_date = ?, notes = ?, updated_at = ? WHERE id = ? AND archived = 0",
      [value.title, value.doc_date || null, value.notes || null, now(), id],
    ),
  );
}

export async function updateSheetProject(
  projectId: string,
  input: z.infer<typeof CreateProjectSchema>,
) {
  const v = CreateProjectSchema.parse(input);
  found(
    await execute(
      `UPDATE projects SET name = ?, location = ?, code = ?, description = ?, start_date = ?, updated_at = ? WHERE id = ? AND archived = 0`,
      [
        v.name,
        v.location,
        v.code || null,
        v.description || null,
        v.start_date || null,
        now(),
        projectId,
      ],
    ),
  );
}

export async function updateSheetLandSale(id: string, input: LandSaleInput) {
  const v = LandSaleSchema.parse(input);
  const land = await query<{ id: string }>(
    "SELECT id FROM land WHERE project_id = ? AND archived = 0 AND status = 'acquired' AND purchase_date <= ?",
    [v.project_id, v.sale_date],
  );
  if (!land.length)
    throw new Error("Acquire the land first. Sale date cannot precede acquisition.");
  found(
    await execute(
      `UPDATE project_sales SET buyer_name = ?, buyer_phone = ?, buyer_address = ?, sale_date = ?, price = ?, notes = ?, custom = json_set(custom, '$.received', ?, '$.account_key', ?, '$.method', ?, '$.reference', ?, '$.payment_details', json(?)), updated_at = ? WHERE id = ? AND project_id = ? AND kind = 'land' AND archived = 0`,
      [
        v.buyer_name,
        v.buyer_phone,
        v.buyer_address,
        v.sale_date,
        v.price,
        v.notes,
        v.received,
        v.account_key,
        v.method,
        v.reference,
        JSON.stringify(v.payment_details),
        now(),
        id,
        v.project_id,
      ],
    ),
  );
}

export async function updateSheetSale(id: string, input: ProjectSaleInput) {
  const v = ProjectSaleSchema.parse(input);
  if (v.kind === "land") throw new Error("Use the land sale workflow for land sales.");
  try {
    found(
      await execute(
        `UPDATE project_sales SET kind = ?, floor_index = ?, unit_number = ?, rooms = ?, buyer_name = ?, buyer_phone = ?, buyer_address = ?, sale_date = ?, price = ?, notes = ?, updated_at = ? WHERE id = ? AND project_id = ? AND kind IN ('flat', 'shop') AND archived = 0`,
        [
          v.kind,
          v.floor_index,
          v.unit_number,
          v.rooms,
          v.buyer_name,
          v.buyer_phone,
          v.buyer_address,
          v.sale_date,
          v.price,
          v.notes,
          now(),
          id,
          v.project_id,
        ],
      ),
    );
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(String(error)))
      throw Object.assign(new Error("This unit is already recorded as sold on the selected floor."), { cause: error });
    throw error;
  }
}

export async function updateSheetCost(
  id: string,
  input: ActualCostInput,
  type: "project_cost" | "construction_cost",
) {
  const v = ActualCostInputSchema.parse(input);
  const account = BankAccountSchema.parse(v.account_key);
  found(
    await execute(
      `UPDATE transactions SET date = ?, amount = ?, description = ?, method = ?, reference = ?, account_key = ?, custom = json_set(custom, '$.payment_details', json(?)), updated_at = ? WHERE id = ? AND project_id = ? AND type = ? AND direction = 'out' AND archived = 0`,
      [
        v.date,
        v.amount,
        v.description,
        v.method,
        v.reference,
        account,
        JSON.stringify(v.payment_details ?? {}),
        now(),
        id,
        v.project_id,
        type,
      ],
    ),
  );
}

async function partnerContact(projectId: string, partnerId: string) {
  const rows = await query<{ contact_id: string }>(
    `SELECT p.contact_id FROM partnerships pp JOIN partners p ON p.id = pp.partner_id AND p.archived = 0 WHERE pp.project_id = ? AND pp.partner_id = ? AND pp.archived = 0`,
    [projectId, partnerId],
  );
  if (!rows[0]) throw new Error("Partner is not part of this project");
  return rows[0].contact_id;
}

export async function updateSheetContribution(id: string, input: PartnerContributionInput) {
  const v = PartnerContributionSchema.parse(input);
  const account = BankAccountSchema.parse(v.account_key);
  const contact = await partnerContact(v.project_id, v.partner_id);
  found(
    await execute(
      `UPDATE transactions SET date = ?, amount = ?, description = ?, method = ?, reference = ?, account_key = ?, partner_id = ?, contact_id = ?, custom = json_set(custom, '$.payment_details', json(?), '$.contribution_purpose', ?, '$.funding_round_id', ?), updated_at = ? WHERE id = ? AND project_id = ? AND type = 'partner_contribution' AND direction = 'in' AND archived = 0`,
      [
        v.date,
        v.amount,
        v.description,
        v.method,
        v.reference,
        account,
        v.partner_id,
        contact,
        JSON.stringify(v.payment_details),
        v.contribution_purpose ?? "land",
        v.contribution_purpose === "construction" ? v.funding_round_id ?? null : null,
        now(),
        id,
        v.project_id,
      ],
    ),
  );
}

export async function updateSheetPayout(id: string, input: PartnerPayoutInput) {
  const v = PartnerPayoutSchema.parse(input);
  const contact = await partnerContact(v.project_id, v.partner_id);
  found(
    await execute(
      `UPDATE transactions SET date = ?, amount = ?, description = ?, method = ?, reference = ?, account_key = ?, partner_id = ?, contact_id = ?, custom = json_set(custom, '$.purpose', ?, '$.payment_details', json(?)), updated_at = ? WHERE id = ? AND project_id = ? AND type = 'partner_payout' AND direction = 'out' AND archived = 0`,
      [
        v.date,
        v.amount,
        v.notes,
        v.method,
        v.reference,
        v.account_key,
        v.partner_id,
        contact,
        v.purpose,
        JSON.stringify(v.payment_details ?? {}),
        now(),
        id,
        v.project_id,
      ],
    ),
  );
}

/** Editing purchase details must not rewind a project's construction/completion stage. */
export async function updateSheetLand(projectId: string, id: string, input: LandAcquisitionInput) {
  const v = LandAcquisitionSchema.parse(input);
  const earlierSale = await query<{ id: string }>(
    "SELECT id FROM project_sales WHERE project_id = ? AND kind = 'land' AND archived = 0 AND sale_date < ?",
    [projectId, v.purchase_date],
  );
  if (earlierSale.length) throw new Error("Purchase date cannot be after the recorded land sale");
  found(
    await execute(
      `UPDATE land SET title = ?, location = ?, purchase_date = ?, area_value = ?, area_unit = ?, price = ?, account_key = ?, notes = ?, custom = json_set(custom, '$.seller_name', ?, '$.payment_details', json(?)), updated_at = ? WHERE id = ? AND project_id = ? AND archived = 0`,
      [
        v.title,
        v.location,
        v.purchase_date,
        v.area_value,
        v.area_unit,
        v.price,
        v.account_key ?? null,
        v.notes,
        v.seller_name,
        JSON.stringify(v.payment_details ?? null),
        now(),
        id,
        projectId,
      ],
    ),
  );
}
