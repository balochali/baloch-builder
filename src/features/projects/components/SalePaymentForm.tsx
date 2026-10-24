import { PaymentAccountSelect, PaymentMethodSelect } from "@/components/PaymentChoices";
import { PartnerPaymentFields } from "@/components/PartnerPaymentFields";
import { emptyPaymentDetails } from "@/data/repositories/projectPartnersRepository";
import type { SalePaymentInput } from "@/data/repositories/salePaymentsRepository";
export type SalePaymentDraft = Omit<SalePaymentInput, "amount" | "account_key"> & {
  amount: string;
  account_key: "" | "personal" | "builder";
};
export function newSalePayment(date: string): SalePaymentDraft {
  return {
    amount: "",
    date,
    account_key: "",
    method: "cash",
    reference: "",
    payment_details: { ...emptyPaymentDetails },
  };
}
export function paymentInput(draft: SalePaymentDraft) {
  return { ...draft, amount: Number(draft.amount.replace(/,/g, "")) };
}
export function SalePaymentFields({
  value,
  onChange,
  disabled = false,
  direction = "in",
  fixedAmount = false,
}: {
  value: SalePaymentDraft;
  onChange: (value: SalePaymentDraft) => void;
  disabled?: boolean;
  direction?: "in" | "out";
  fixedAmount?: boolean;
}) {
  return (
    <div className="buyer-payment-fields">
      <div className="project-sale-fields">
        <label>
          Payment amount (Rs) *
          <input
            inputMode="numeric"
            readOnly={fixedAmount}
            value={value.amount}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, amount: e.target.value })}
          />
        </label>
        <label>
          Payment date *
          <input
            type="date"
            value={value.date}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, date: e.target.value })}
          />
        </label>
      </div>
      <PaymentAccountSelect
        value={value.account_key}
        onChange={(account_key) => onChange({ ...value, account_key })}
        direction={direction}
        disabled={disabled}
      />
      <PaymentMethodSelect
        value={value.method}
        onChange={(method) =>
          onChange({ ...value, method, reference: "", payment_details: { ...emptyPaymentDetails } })
        }
        disabled={disabled}
      >
        <PartnerPaymentFields
          method={value.method}
          value={value.payment_details}
          onChange={(payment_details) => onChange({ ...value, payment_details })}
          reference={value.reference}
          onReferenceChange={(reference) => onChange({ ...value, reference })}
          disabled={disabled}
        />
      </PaymentMethodSelect>
    </div>
  );
}
