import { execute, query } from "@/data/client";
import { newId, now } from "@/data/ids";
import { SalePaymentSchema, type SalePaymentInput } from "./salePaymentsRepository";
import type { ProjectSale } from "./projectSalesRepository";
export interface SaleEvent {
  id: string;
  sale_id: string;
  project_id: string;
  refunded: number;
  refund_payments: string;
  kind: "cancel" | "resell";
  date: string;
  buyer_name: string;
  received: number;
  rate_bp: number;
  fee: number;
  refund: number;
  resale_price: number;
  details: string;
}
export function percentageAmount(amount: number, rate: number) {
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    !Number.isFinite(rate) ||
    rate < 0 ||
    rate > 100 ||
    Math.abs(rate * 100 - Math.round(rate * 100)) > 0.000001
  )
    throw new Error("Enter a percentage from 0 to 100, with up to two decimal places");
  return Number((BigInt(amount) * BigInt(Math.round(rate * 100))) / 10000n);
}
export function listSaleEvents(projectId: string) {
  return query<SaleEvent>(
    "SELECT e.*, COALESCE((SELECT SUM(amount) FROM transactions WHERE type='sale_refund' AND archived=0 AND json_extract(custom,'$.event_id')=e.id),0) AS refunded, (SELECT json_group_array(json_object('id',id,'date',date,'amount',amount,'method',method,'reference',reference)) FROM (SELECT * FROM transactions WHERE type='sale_refund' AND archived=0 AND json_extract(custom,'$.event_id')=e.id ORDER BY date,created_at)) AS refund_payments FROM sale_events e WHERE project_id=? ORDER BY date DESC,created_at DESC",
    [projectId],
  );
}
export async function projectSaleFees(projectId: string) {
  const rows = await query<{ amount: number }>(
    "SELECT COALESCE(SUM(fee),0) AS amount FROM sale_events WHERE project_id=?",
    [projectId],
  );
  return rows[0]?.amount ?? 0;
}
export async function recordSaleEvent(
  sale: ProjectSale,
  input: {
    kind: "cancel" | "resell";
    date: string;
    received: number;
    rate: number;
    resale_price: number;
    new_buyer_name: string;
    new_buyer_phone: string;
    new_buyer_address: string;
    payment: SalePaymentInput | null;
  },
) {
  const fee = percentageAmount(
    input.kind === "cancel" ? input.received : input.resale_price,
    input.rate,
  );
  const refund = input.kind === "cancel" ? input.received - fee : 0;
  const movement = input.kind === "cancel" ? refund : fee;
  if (input.kind === "resell" && (!input.new_buyer_name.trim() || input.received !== sale.price))
    throw new Error("Enter the new buyer and settle all original instalments before resale");
  if (
    input.kind === "resell" &&
    (!Number.isSafeInteger(input.resale_price) || input.resale_price <= 0)
  )
    throw new Error("Enter a valid resale price");
  const parsedDate = new Date(input.date + "T00:00:00Z");
  if (isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== input.date)
    throw new Error("Choose a valid date");
  const payment =
    movement > 0 && (input.kind === "resell" || input.payment)
      ? SalePaymentSchema.parse({
          ...input.payment,
          amount: input.kind === "cancel" ? input.payment?.amount : movement,
          date: input.date,
        })
      : null;
  if (payment && input.kind === "cancel" && payment.amount > refund)
    throw new Error("Refund exceeds remaining balance");
  const details = JSON.stringify({
    new_buyer_name: input.new_buyer_name.trim(),
    new_buyer_phone: input.new_buyer_phone.trim(),
    new_buyer_address: input.new_buyer_address.trim(),
    unit_number: sale.unit_number,
    unit_kind: sale.kind,
    original_price: sale.price,
    payment,
  });
  await execute(
    "INSERT INTO sale_events(id,sale_id,project_id,kind,date,buyer_name,received,rate_bp,fee,refund,resale_price,details,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [
      newId(),
      sale.id,
      sale.project_id,
      input.kind,
      input.date,
      sale.buyer_name,
      input.received,
      Math.round(input.rate * 100),
      fee,
      refund,
      input.resale_price,
      details,
      now(),
    ],
  );
}

export async function addSaleRefund(event: SaleEvent, input: SalePaymentInput) {
  const payment = SalePaymentSchema.parse(input);
  if (payment.amount > event.refund - event.refunded || payment.date < event.date)
    throw new Error("Refund exceeds remaining balance or predates cancellation");
  const timestamp = now();
  await execute(
    "INSERT INTO transactions(id,date,amount,direction,type,method,reference,description,project_id,created_at,updated_at,archived,custom,account_key) VALUES(?,?,?,'out','sale_refund',?,?,?,?,?,?,0,?,?)",
    [
      newId(),
      payment.date,
      payment.amount,
      payment.method,
      payment.reference,
      `Cancellation refund · ${event.buyer_name}`,
      event.project_id,
      timestamp,
      timestamp,
      JSON.stringify({
        sale_id: event.sale_id,
        event_id: event.id,
        buyer_name: event.buyer_name,
        payment_details: payment.payment_details,
      }),
      payment.account_key,
    ],
  );
}
