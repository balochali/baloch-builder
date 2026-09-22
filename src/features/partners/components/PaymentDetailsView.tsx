import type { Transaction } from "@/domain/types";
import { readPaymentDetails } from "@/data/repositories/projectPartnersRepository";

export function PaymentDetailsView({ transaction }: { transaction: Transaction }) {
  const details = readPaymentDetails(transaction.custom);
  if (!details) return null;
  const fields = [
    ["Receipt no.", details.receipt_no],
    [transaction.method === "cheque" ? "Issuing bank" : "Sender bank", details.from_bank],
    [transaction.method === "cheque" ? "Account holder" : "Sender account", details.from_account_name],
    ["Sender account / IBAN", details.from_account_no],
    [transaction.method === "cheque" ? "Deposited to bank" : "Receiving bank", details.to_bank],
    ["Receiving account", details.to_account_name], ["Receiving account / IBAN", details.to_account_no],
    ["Cheque no.", details.cheque_no], ["Cheque date", details.cheque_date],
    ["Payable to", details.cheque_payee], ["Received by", details.received_by],
  ].filter(([, value]) => value);
  if (fields.length === 0) return null;
  return <details className="mt-1 text-xs"><summary className="cursor-pointer text-primary">Payment details</summary>
    <div className="mt-1 space-y-0.5 text-muted-foreground">{fields.map(([label, value]) =>
      <p key={label}><span className="font-medium">{label}:</span> {value}</p>)}</div>
  </details>;
}
