import type pg from "pg";
import { randomUUID } from "node:crypto";
import {
  landPurchaseSchema,
  landPaymentSchema,
  landCostSchema,
  landContributionSchema,
  landSourceLines,
  splitTotal,
  fundingBreakdown,
  type LandSource,
  type LandParcel,
  type LandPayment,
  type LandCost,
  type LandPurchase,
  type LandContribution,
  type LandSheet,
  type LandFigures,
} from "@baloch/shared";
import { audit } from "./db";
import { postVoucher, voidVoucher, accountingError as fail } from "./journal";
const active = "v.status='posted' AND v.reversal_of IS NULL";
const tables = {
  purchase: "land_purchases",
  payment: "land_payments",
  cost: "land_costs",
  contribution: "land_contributions",
} as const;
export type LandKind = keyof typeof tables;
export async function lockLandProject(client: pg.PoolClient, projectId: string) {
  const project = (
    await client.query("SELECT id,details FROM projects WHERE id=$1 FOR UPDATE", [projectId])
  ).rows[0];
  if (!project) throw fail("Project not found.", 404);
  return project;
}
async function recordAudit(client: pg.PoolClient, kind: string, id: string, value: unknown) {
  const actor = (await client.query("SELECT nullif(current_setting('app.actor_id',true),'') AS id"))
    .rows[0].id;
  await audit(actor, kind, "land", id, value, client);
}
async function resolveSources(client: pg.PoolClient, projectId: string, sources: LandSource[]) {
  const result: LandSource[] = [];
  for (const source of sources) {
    const s = { ...source };
    if (s.sourceType === "owner_direct") {
      const owner = (await client.query("SELECT id FROM partners WHERE role='Owner'")).rows[0];
      if (!owner) throw fail("Owner partner is missing.");
      s.partnerId = owner.id;
    }
    if (
      s.sourceType === "partner_direct" &&
      !(
        await client.query(
          "SELECT 1 FROM project_partner_links WHERE project_id=$1 AND partner_id=$2",
          [projectId, s.partnerId],
        )
      ).rowCount
    )
      throw fail("Select a partner linked to this project.");
    if (s.sourceType === "loan_direct") {
      if (
        !(
          await client.query("SELECT 1 FROM parties WHERE id=$1 AND type='lender'", [
            s.lenderPartyId,
          ])
        ).rowCount
      )
        throw fail("Select a valid lender.");
      if (
        s.loanFundingId &&
        !(
          await client.query(
            "SELECT 1 FROM project_money_entries WHERE id=$1 AND project_id=$2 AND status='posted' AND data->>'sourceType'='loan' AND data->>'lenderPartyId'=$3",
            [s.loanFundingId, projectId, s.lenderPartyId],
          )
        ).rowCount
      )
        throw fail("Select an active loan belonging to this lender and project.");
    }
    result.push(s);
  }
  return result;
}
export async function landAvailable(client: Pick<pg.PoolClient, "query">, projectId: string) {
  const rows = (
    await client.query(
      `SELECT l.account_code,coalesce(sum(l.debit-l.credit),0) AS amount FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id WHERE ${active} AND l.project_id=$1 AND l.account_code IN ('1000','1010') GROUP BY l.account_code`,
      [projectId],
    )
  ).rows;
  return {
    bank: Number(rows.find((r) => r.account_code === "1010")?.amount ?? 0),
    cash: Number(rows.find((r) => r.account_code === "1000")?.amount ?? 0),
  };
}
export async function checkLandFunds(
  client: pg.PoolClient,
  projectId: string,
  sources: LandSource[] = [],
) {
  const available = await landAvailable(client, projectId);
  for (const type of ["bank", "cash"] as const) {
    const needed = splitTotal(sources.filter((s) => s.sourceType === type));
    if (needed > available[type])
      throw fail(
        `Insufficient ${type} funds. Available balance: PKR ${available[type].toLocaleString("en-PK")}.`,
        409,
      );
  }
}
async function purchase(client: pg.PoolClient, projectId: string, id: string) {
  const row = (
    await client.query(
      "SELECT * FROM land_purchases WHERE id=$1 AND project_id=$2 AND status='posted'",
      [id, projectId],
    )
  ).rows[0];
  if (!row) throw fail("Purchase not found or no longer posted. Refresh and try again.", 409);
  return row;
}
async function paid(client: pg.PoolClient, purchaseId: string) {
  return Number(
    (
      await client.query(
        `SELECT coalesce(sum(l.debit),0) AS amount FROM land_payments p JOIN journal_vouchers v ON v.id=p.voucher_id JOIN journal_lines l ON l.voucher_id=v.id WHERE p.purchase_id=$1 AND p.status='posted' AND ${active} AND l.account_code='2010'`,
        [purchaseId],
      )
    ).rows[0].amount,
  );
}
export async function voidLand(
  client: pg.PoolClient,
  projectId: string,
  kind: LandKind,
  id: string,
  reason: string,
  expectedVoucherId?: string,
) {
  await lockLandProject(client, projectId);
  const table = tables[kind];
  const row = (
    await client.query(
      `SELECT r.* FROM ${table} r ${kind === "payment" ? "JOIN land_purchases p ON p.id=r.purchase_id" : ""} WHERE r.id=$1 AND ${kind === "payment" ? "p" : "r"}.project_id=$2`,
      [id, projectId],
    )
  ).rows[0];
  if (
    !row ||
    row.status !== "posted" ||
    (expectedVoucherId && row.voucher_id !== expectedVoucherId)
  )
    throw fail("This record has changed or is already void. Refresh and try again.", 409);
  if (
    kind === "purchase" &&
    (
      await client.query(
        "SELECT 1 FROM land_payments WHERE purchase_id=$1 AND status='posted' UNION ALL SELECT 1 FROM land_costs WHERE purchase_id=$1 AND status='posted' LIMIT 1",
        [id],
      )
    ).rowCount
  )
    throw fail(
      "Void posted payments and related costs before voiding or editing the purchase.",
      409,
    );
  await voidVoucher(client, row.voucher_id, reason);
  await client.query("SELECT void_land_record($1,$2)", [kind, id]);
  await recordAudit(client, "land_" + kind + "_void", id, { reason });
  return row;
}
export async function postLand(
  client: pg.PoolClient,
  projectId: string,
  kind: LandKind,
  input: unknown,
  replaceId?: string,
) {
  const project = await lockLandProject(client, projectId);
  const id = randomUUID();
  const parcels = (project.details.landParcels ?? []) as LandParcel[];
  const data =
    kind === "purchase"
      ? landPurchaseSchema.parse(input)
      : kind === "payment"
        ? landPaymentSchema.parse(input)
        : kind === "cost"
          ? landCostSchema.parse(input)
          : landContributionSchema.parse(input);
  if (replaceId) {
    const old = await voidLand(
      client,
      projectId,
      kind,
      replaceId,
      "Entry edited",
      "expectedVoucherId" in data ? data.expectedVoucherId : undefined,
    );
    if ("parcelId" in data && old.parcel_id !== data.parcelId)
      throw fail("An edit cannot change the parcel.", 409);
    if (kind === "payment" && "purchaseId" in data && old.purchase_id !== data.purchaseId)
      throw fail("An edit cannot change the purchase.", 409);
  }
  let voucherId: string;
  if (kind === "purchase") {
    const d = landPurchaseSchema.parse(data);
    const parcel = parcels.find((p) => p.id === d.parcelId);
    if (parcel?.acquisitionType !== "purchase")
      throw fail("Select a parcel purchased from a seller.");
    if (
      !(
        await client.query("SELECT 1 FROM parties WHERE id=$1 AND type='seller'", [d.sellerPartyId])
      ).rowCount
    )
      throw fail("Select a valid seller.");
    if (
      (
        await client.query(
          "SELECT 1 FROM land_purchases WHERE project_id=$1 AND parcel_id=$2 AND status='posted'",
          [projectId, d.parcelId],
        )
      ).rowCount
    )
      throw fail("This parcel already has a posted purchase.", 409);
    voucherId = await postVoucher(client, {
      date: d.agreementDate,
      projectId,
      narration: `Land purchase: ${parcel.name}`,
      source: { module: "land_purchase", refId: id },
      lines: [
        {
          accountCode: "1400",
          debit: d.agreedPrice,
          credit: 0,
          projectId,
          partyId: d.sellerPartyId,
        },
        {
          accountCode: "2010",
          debit: 0,
          credit: d.agreedPrice,
          projectId,
          partyId: d.sellerPartyId,
        },
      ],
    });
    await client.query(
      "INSERT INTO land_purchases(id,project_id,parcel_id,seller_party_id,agreed_price,agreement_date,notes,voucher_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        id,
        projectId,
        d.parcelId,
        d.sellerPartyId,
        d.agreedPrice,
        d.agreementDate,
        d.notes,
        voucherId,
      ],
    );
  } else if (kind === "payment") {
    const d = landPaymentSchema.parse(data);
    const p = await purchase(client, projectId, d.purchaseId);
    const remaining = Number(p.agreed_price) - (await paid(client, p.id));
    const sources = await resolveSources(client, projectId, d.sources);
    if (splitTotal(sources) > remaining)
      throw fail(
        `Payment exceeds the remaining amount of PKR ${remaining.toLocaleString("en-PK")}.`,
        409,
      );
    await checkLandFunds(client, projectId, sources);
    voucherId = await postVoucher(client, {
      date: d.paidOn,
      projectId,
      narration: "Land payment" + (d.reference ? `: ${d.reference}` : ""),
      source: { module: "land_payment", refId: id },
      lines: landSourceLines(sources, projectId, "2010", p.seller_party_id),
    });
    await client.query(
      "INSERT INTO land_payments(id,purchase_id,paid_on,notes,reference,voucher_id) VALUES($1,$2,$3,$4,$5,$6)",
      [id, p.id, d.paidOn, d.notes, d.reference, voucherId],
    );
    for (const s of sources)
      await client.query(
        "INSERT INTO land_payment_sources(payment_id,source_type,amount,partner_id,lender_party_id,loan_funding_id) VALUES($1,$2,$3,$4,$5,$6)",
        [
          id,
          s.sourceType,
          s.amount,
          s.partnerId ?? null,
          s.lenderPartyId ?? null,
          s.loanFundingId ?? null,
        ],
      );
  } else if (kind === "cost") {
    const d = landCostSchema.parse(data);
    if (d.purchaseId) await purchase(client, projectId, d.purchaseId);
    const [source] = await resolveSources(client, projectId, [d.source]);
    await checkLandFunds(client, projectId, [source]);
    voucherId = await postVoucher(client, {
      date: d.paidOn,
      projectId,
      narration: `Land cost: ${d.category}`,
      source: { module: "land_cost", refId: id },
      lines: landSourceLines([source], projectId, "1400"),
    });
    await client.query(
      "INSERT INTO land_costs(id,project_id,purchase_id,category,amount,paid_on,paid_from,partner_id,lender_party_id,loan_funding_id,notes,voucher_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
      [
        id,
        projectId,
        d.purchaseId ?? null,
        d.category,
        source.amount,
        d.paidOn,
        source.sourceType,
        source.partnerId ?? null,
        source.lenderPartyId ?? null,
        source.loanFundingId ?? null,
        d.notes,
        voucherId,
      ],
    );
  } else {
    const d = landContributionSchema.parse(data);
    const parcel = parcels.find((p) => p.id === d.parcelId);
    if (parcel?.acquisitionType !== "partner_contribution" || !parcel.contributingPartnerId)
      throw fail("Select a partner-contributed parcel.");
    if (
      (
        await client.query(
          "SELECT 1 FROM land_contributions WHERE project_id=$1 AND parcel_id=$2 AND status='posted'",
          [projectId, d.parcelId],
        )
      ).rowCount
    )
      throw fail("This parcel already has a contribution.", 409);
    await client.query(
      "INSERT INTO project_partner_links(project_id,partner_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [projectId, parcel.contributingPartnerId],
    );
    voucherId = await postVoucher(client, {
      date: d.contributedOn,
      projectId,
      narration: `Land contribution: ${parcel.name}`,
      source: { module: "land_contribution", refId: id },
      lines: landSourceLines(
        [
          {
            sourceType: "partner_direct",
            amount: d.agreedValue,
            partnerId: parcel.contributingPartnerId,
          },
        ],
        projectId,
        "1400",
      ),
    });
    await client.query(
      "INSERT INTO land_contributions(id,project_id,parcel_id,partner_id,agreed_value,contributed_on,notes,voucher_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        id,
        projectId,
        d.parcelId,
        parcel.contributingPartnerId,
        d.agreedValue,
        d.contributedOn,
        d.notes,
        voucherId,
      ],
    );
  }
  await checkLandFunds(client, projectId);
  await recordAudit(client, "land_" + kind + "_post", id, {
    ...data,
    voucherId,
    replaces: replaceId,
  });
  return { id, voucherId };
}

export async function readLand(
  client: Pick<pg.PoolClient, "query">,
  projectId: string,
): Promise<LandSheet> {
  const project = (await client.query("SELECT details FROM projects WHERE id=$1", [projectId]))
    .rows[0];
  if (!project) throw fail("Project not found.", 404);
  const purchases = (
    await client.query(
      'SELECT id,parcel_id AS "parcelId",seller_party_id AS "sellerPartyId",agreed_price AS "agreedPrice",agreement_date::text AS "agreementDate",notes,voucher_id AS "voucherId",status FROM land_purchases WHERE project_id=$1 ORDER BY created_at',
      [projectId],
    )
  ).rows.map((r) => ({ ...r, agreedPrice: Number(r.agreedPrice) })) as LandPurchase[];
  const payments = (
    await client.query(
      `SELECT p.id,p.purchase_id AS "purchaseId",p.paid_on::text AS "paidOn",p.notes,p.reference,p.voucher_id AS "voucherId",p.status,(SELECT sum(l.debit) FROM journal_lines l WHERE l.voucher_id=p.voucher_id AND l.account_code='2010') AS amount FROM land_payments p JOIN land_purchases a ON a.id=p.purchase_id WHERE a.project_id=$1 ORDER BY p.created_at`,
      [projectId],
    )
  ).rows.map((r) => ({ ...r, amount: Number(r.amount), sources: [] })) as LandPayment[];
  const sources = (
    await client.query(
      'SELECT s.payment_id AS "paymentId",s.source_type AS "sourceType",s.amount,s.partner_id AS "partnerId",s.lender_party_id AS "lenderPartyId",s.loan_funding_id AS "loanFundingId" FROM land_payment_sources s JOIN land_payments p ON p.id=s.payment_id JOIN land_purchases a ON a.id=p.purchase_id WHERE a.project_id=$1 ORDER BY s.id',
      [projectId],
    )
  ).rows;
  for (const s of sources) {
    const row = payments.find((p) => p.id === s.paymentId);
    row?.sources.push({
      sourceType: s.sourceType,
      amount: Number(s.amount),
      partnerId: s.partnerId ?? undefined,
      lenderPartyId: s.lenderPartyId ?? undefined,
      loanFundingId: s.loanFundingId ?? undefined,
    });
  }
  const costs = (
    await client.query(
      "SELECT *,paid_on::text AS paid_on_text FROM land_costs WHERE project_id=$1 ORDER BY created_at",
      [projectId],
    )
  ).rows.map((r) => ({
    id: r.id,
    purchaseId: r.purchase_id,
    category: r.category,
    paidOn: r.paid_on_text,
    notes: r.notes,
    voucherId: r.voucher_id,
    status: r.status,
    amount: Number(r.amount),
    source: {
      sourceType: r.paid_from,
      amount: Number(r.amount),
      partnerId: r.partner_id ?? undefined,
      lenderPartyId: r.lender_party_id ?? undefined,
      loanFundingId: r.loan_funding_id ?? undefined,
    },
  })) as LandCost[];
  const contributions = (
    await client.query(
      'SELECT id,parcel_id AS "parcelId",partner_id AS "partnerId",agreed_value AS "agreedValue",contributed_on::text AS "contributedOn",notes,voucher_id AS "voucherId",status FROM land_contributions WHERE project_id=$1 ORDER BY created_at',
      [projectId],
    )
  ).rows.map((r) => ({ ...r, agreedValue: Number(r.agreedValue) })) as LandContribution[];
  const partners = (
    await client.query(
      "SELECT p.id,p.name,p.role FROM partners p WHERE p.role='Owner' OR EXISTS(SELECT 1 FROM project_partner_links l WHERE l.partner_id=p.id AND l.project_id=$1) ORDER BY p.name",
      [projectId],
    )
  ).rows;
  const lenders = (
    await client.query("SELECT id,name FROM parties WHERE type='lender' ORDER BY name")
  ).rows;
  const sellers = (
    await client.query("SELECT id,name FROM parties WHERE type='seller' ORDER BY name")
  ).rows;
  const journal = (
    await client.query(
      `SELECT l.voucher_id,l.account_code,sum(l.debit-l.credit) AS amount FROM journal_lines l JOIN journal_vouchers v ON v.id=l.voucher_id WHERE l.project_id=$1 AND ${active} GROUP BY l.voucher_id,l.account_code`,
      [projectId],
    )
  ).rows;
  const value = (voucher: string, account: string) =>
    Number(
      journal.find((r) => r.voucher_id === voucher && r.account_code === account)?.amount ?? 0,
    );
  const label = (s: LandSource) =>
    s.sourceType === "owner_direct"
      ? "Owner"
      : s.sourceType === "partner_direct"
        ? (partners.find((p) => p.id === s.partnerId)?.name ?? "Partner")
        : s.sourceType === "loan_direct"
          ? (lenders.find((p) => p.id === s.lenderPartyId)?.name ?? "Lender")
          : s.sourceType === "bank"
            ? "Bank"
            : "Cash";
  const figures = (parcelId?: string): LandFigures => {
    const ps = purchases.filter(
      (p) => p.status === "posted" && (!parcelId || p.parcelId === parcelId),
    );
    const ids = new Set(ps.map((p) => p.id));
    const pay = payments.filter((p) => p.status === "posted" && ids.has(p.purchaseId));
    const cs = costs.filter(
      (c) => c.status === "posted" && (!parcelId || (!!c.purchaseId && ids.has(c.purchaseId))),
    );
    const contribution = contributions.filter(
      (c) => c.status === "posted" && (!parcelId || c.parcelId === parcelId),
    );
    const agreedPrice =
      ps.reduce((s, p) => s + value(p.voucherId, "1400"), 0) +
      contribution.reduce((s, c) => s + value(c.voucherId, "1400"), 0);
    const totalPaid =
      pay.reduce((s, p) => s + value(p.voucherId, "2010"), 0) +
      contribution.reduce((s, c) => s + value(c.voucherId, "1400"), 0);
    const relatedCosts = cs.reduce((s, c) => s + value(c.voucherId, "1400"), 0);
    const allSources = [
      ...pay.flatMap((p) => p.sources),
      ...contribution.map((c) => ({
        sourceType: "partner_direct" as const,
        amount: value(c.voucherId, "1400"),
        partnerId: c.partnerId,
      })),
    ];
    return {
      agreedPrice,
      totalPaid,
      remaining: agreedPrice - totalPaid,
      relatedCosts,
      totalLandCost: agreedPrice + relatedCosts,
      breakdown: fundingBreakdown(allSources.map((s) => ({ ...s, label: label(s) }))),
    };
  };
  return {
    purchases,
    payments,
    costs,
    contributions,
    partners,
    lenders,
    sellers,
    available: await landAvailable(client, projectId),
    parcels: ((project.details.landParcels ?? []) as LandParcel[]).map((p) => ({
      id: p.id,
      ...figures(p.id),
    })),
    totals: figures(),
  };
}
