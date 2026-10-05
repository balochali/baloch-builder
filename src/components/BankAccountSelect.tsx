import { PaymentAccountSelect } from "./PaymentChoices";

export function BankAccountSelect({ value, onChange, direction = "out" }: {
  value: string;
  onChange: (value: string) => void;
  direction?: "in" | "out";
}) {
  return <PaymentAccountSelect value={value} onChange={onChange} direction={direction} />;
}
