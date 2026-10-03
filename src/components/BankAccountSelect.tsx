import { useId } from "react";
import { Label } from "@/components/ui/label";
export function BankAccountSelect({
  value,
  onChange,
  direction = "out",
}: {
  value: string;
  onChange: (value: string) => void;
  direction?: "in" | "out";
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {direction === "in" ? "Receive into account *" : "Pay from account *"}
      </Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="" disabled>
          Choose an account
        </option>
        <option value="personal">Personal Account</option>
        <option value="builder">Builder Account</option>
      </select>
      <p className="text-xs text-muted-foreground">
        {direction === "in"
          ? "Choose which account receives this money, including cash and cheque payments."
          : "Choose whose funds this payment uses, including cash and cheque payments."}
      </p>
    </div>
  );
}
