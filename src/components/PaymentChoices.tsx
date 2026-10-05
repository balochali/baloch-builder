import { useId } from "react";
import { Banknote, Building2, CircleDollarSign, CreditCard, Landmark, ReceiptText, Wallet, type LucideIcon } from "lucide-react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import "./payment-modal.css";

export type PaymentMethod = "cash" | "bank" | "digital" | "cheque" | "other";
const methods = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "bank", label: "Bank transfer", icon: Landmark },
  { value: "digital", label: "Digital wallet", icon: Wallet },
  { value: "cheque", label: "Cheque", icon: ReceiptText },
  { value: "other", label: "Other", icon: CircleDollarSign },
] as const;

export function PaymentMethodSelect({ value, onChange, label = "How was it paid?", disabled = false }: {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  label?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return <div className="payment-method-section">
    <div className="payment-choice-title" id={id}><CreditCard size={19} /><span>{label}</span></div>
    <div className="payment-method-options" role="group" aria-labelledby={id}>
      {methods.map(({ value: key, label: title, icon: Icon }) => <button key={key} type="button" disabled={disabled} aria-pressed={value === key} className={value === key ? "is-selected" : ""} onClick={() => onChange(key)}><Icon size={20} /><span>{title}</span></button>)}
    </div>
  </div>;
}

export function PaymentAccountSelect({ value, onChange, direction = "out", disabled = false }: {
  value: string;
  onChange: (account: "personal" | "builder") => void;
  direction?: "in" | "out";
  disabled?: boolean;
}) {
  const id = useId();
  return <fieldset className="payment-account-section" disabled={disabled}>
    <legend><Wallet size={19} />{direction === "in" ? "Receive into account *" : "Pay from account *"}</legend>
    <div className="payment-account-options">
      {(["personal", "builder"] as const).map((account) => <label key={account} className={value === account ? "is-selected" : ""}>
        <input type="radio" name={id} value={account} checked={value === account} onChange={() => onChange(account)} required />
        <span>{account === "personal" ? <Wallet size={22} /> : <Building2 size={22} />}</span>
        <strong>{account === "personal" ? "Personal Account" : "Builder Account"}</strong>
      </label>)}
    </div>
    <p>{direction === "in" ? "Choose which account receives this money, including cash and cheque payments." : "Choose whose funds are used, including cash and cheque payments."}</p>
  </fieldset>;
}

export function PaymentModalHeader({ title, eyebrow, description, icon: Icon = Wallet }: { title: string; eyebrow: string; description: string; icon?: LucideIcon }) {
  return <DialogHeader className="payment-modal-header"><span className="payment-modal-icon"><Icon size={27} /></span><div><small>{eyebrow}</small><DialogTitle>{title}</DialogTitle><p>{description}</p></div></DialogHeader>;
}
