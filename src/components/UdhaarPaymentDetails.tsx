import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emptyPaymentDetails, type PaymentDetails } from "@/domain/udhaarPaymentDetails";
export function UdhaarPaymentDetails({
  value,
  onChange,
}: {
  value: PaymentDetails;
  onChange: (value: PaymentDetails) => void;
}) {
  const id = useId();
  const field = (
    key: "received_by" | "provider" | "account" | "reference",
    label: string,
    required = false,
  ) => (
    <div className="space-y-1">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      <Input
        id={`${id}-${key}`}
        value={value[key]}
        maxLength={120}
        required={required}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
      />
    </div>
  );
  return (
    <fieldset className="space-y-3 rounded-xl border bg-muted/30 p-4">
      <legend className="px-1 text-sm font-semibold">Payment details</legend>
      <div className="space-y-1">
        <Label htmlFor={`${id}-method`}>How was it paid? *</Label>
        <select
          id={`${id}-method`}
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          value={value.method}
          onChange={(e) =>
            onChange({
              ...emptyPaymentDetails,
              received_by: value.received_by,
              method: e.target.value as PaymentDetails["method"],
            })
          }
        >
          <option value="cash">Cash</option>
          <option value="bank">Bank transfer</option>
          <option value="digital">Digital wallet</option>
          <option value="cheque">Cheque</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("received_by", "Received by *", true)}
        {value.method !== "cash" &&
          field(
            "provider",
            value.method === "digital"
              ? "Wallet / app name *"
              : value.method === "other"
                ? "Payment service / method *"
                : "Bank name *",
            true,
          )}
        {value.method !== "cash" && field("account", "Recipient account / mobile (optional)")}
        {field(
          "reference",
          value.method === "cash"
            ? "Receipt no. (optional)"
            : value.method === "cheque"
              ? "Cheque / receipt no. (optional)"
              : "Transaction / receipt no. (optional)",
        )}
      </div>
    </fieldset>
  );
}
