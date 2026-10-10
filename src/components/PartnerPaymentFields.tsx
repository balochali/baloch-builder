import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PaymentMethod } from "@/components/PaymentChoices";
import type { PaymentDetails } from "@/data/repositories/projectPartnersRepository";
import "./partner-payment-fields.css";
type Field = { key: keyof PaymentDetails; label: string; placeholder?: string; required?: boolean };
const fields: Record<PaymentMethod, Field[]> = {
  cash: [
    {
      key: "receipt_no",
      label: "Receipt number (optional)",
      placeholder: "If you have a cash receipt",
    },
  ],
  bank: [
    { key: "from_bank", label: "Sending bank *", placeholder: "e.g. Meezan Bank", required: true },
    { key: "to_bank", label: "Receiving bank *", placeholder: "Recipient’s bank", required: true },
    { key: "from_account_no", label: "Sender account number" },
    { key: "to_account_no", label: "Receiver account number" },
  ],
  digital: [
    {
      key: "from_bank",
      label: "Wallet or service *",
      placeholder: "e.g. Easypaisa",
      required: true,
    },
    { key: "to_account_no", label: "Recipient wallet number" },
  ],
  cheque: [
    { key: "from_bank", label: "Issuing bank *", required: true },
    { key: "cheque_no", label: "Cheque number *", required: true },
    { key: "cheque_date", label: "Cheque date *", required: true },
    { key: "cheque_payee", label: "Payable to *", required: true },
  ],
  other: [],
};
/** Partner payment schema adapter. Other domains retain their own persisted schemas. */
export function PartnerPaymentFields({
  method,
  value,
  onChange,
  reference,
  onReferenceChange,
  disabled = false,
}: {
  method: PaymentMethod;
  value: PaymentDetails;
  onChange: (value: PaymentDetails) => void;
  reference: string;
  onReferenceChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <fieldset disabled={disabled} className="shared-partner-payment-fields">
      {fields[method].map((field) => (
        <div key={field.key}>
          <Label htmlFor={id + field.key}>{field.label}</Label>
          <Input
            id={id + field.key}
            type={field.key === "cheque_date" ? "date" : "text"}
            maxLength={120}
            required={field.required}
            placeholder={field.placeholder}
            value={value[field.key]}
            onChange={(e) => onChange({ ...value, [field.key]: e.target.value })}
          />
        </div>
      ))}
      {method !== "cash" && (
        <div className="shared-payment-reference">
          <Label htmlFor={id + "reference"}>
            {method === "digital"
              ? "Transaction ID *"
              : method === "bank"
                ? "Transfer reference *"
                : method === "cheque"
                  ? "Deposit reference (optional)"
                  : "Reference (optional)"}
          </Label>
          <Input
            id={id + "reference"}
            value={reference}
            maxLength={120}
            placeholder="Enter the payment reference"
            required={method === "bank" || method === "digital"}
            onChange={(e) => onReferenceChange(e.target.value)}
          />
        </div>
      )}
    </fieldset>
  );
}
