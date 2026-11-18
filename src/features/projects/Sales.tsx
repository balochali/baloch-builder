import {formatPKR} from "./feasibilityFormat";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  agreementStatus,
  generateInstallments,
  amountInWords,
  type Installment,
  type SaleAgreement,
  type SalePayment,
  type SaleUnit,
  type SalesSheet,
} from "@baloch/shared";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api } from "@/data/api";
import { DataGrid, whole, type GridColumn } from "@/components/grid/DataGrid";
import "./sales.css";
const today = () => new Date().toLocaleDateString("en-CA");
export const friendlyError = (error: unknown) => {
  const s = error instanceof Error ? error.message : String(error);
  return /constraint|duplicate key|invalid input|Expected |Required|^\[/.test(s)
    ? "Some details are missing, invalid, or have changed. Check the form and refresh before trying again."
    : s.replace(/^Error: /, "");
};
export function MoneyInput({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
}) {
  return (
    <label>
      {label}
      <input
        inputMode="numeric"
        value={value ? whole(value) : ""}
        onChange={(e) => {
          const s = e.target.value.replace(/,/g, "");
          if (/^\d*$/.test(s) && Number.isSafeInteger(Number(s))) onChange(Number(s));
        }}
      />
    </label>
  );
}
function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  type?: string;
}) {
  return (
    <label>
      {label}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
export function SalesDialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogContent className="sales-dialog">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          Amounts are in whole Pakistani rupees. Your saved history stays recorded.
        </DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function AddCustomer({
  close,
  done,
}: {
  close: () => void;
  done: (c: { id: string; name: string; phone: string }) => void;
}) {
  const [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [cnic, setCnic] = useState(""),
    [address, setAddress] = useState(""),
    [second, setSecond] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <SalesDialog title="Add customer" close={close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          try {
            done(
              await api("parties", "POST", {
                name,
                phone,
                cnic,
                address,
                second_contact: second,
                type: "client",
                notes: "",
              }),
            );
            close();
          } catch (e) {
            setError(friendlyError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="sales-fields">
          <Field label="Customer name" value={name} onChange={setName} />
          <Field label="Phone" value={phone} onChange={setPhone} />
          <Field label="CNIC (optional)" value={cnic} onChange={setCnic} />
          <Field label="Address (optional)" value={address} onChange={setAddress} />
          <Field label="Second contact (optional)" value={second} onChange={setSecond} />
        </div>
        {error && <p role="alert">{error}</p>}
        <button className="projects-primary" disabled={!name.trim() || busy}>
          Save customer
        </button>
        {!name.trim() && <small>Enter the customer's name to save.</small>}
      </form>
    </SalesDialog>
  );
}
export function ScheduleEditor({
  rows,
  onChange,
}: {
  rows: Installment[];
  onChange: (r: Installment[]) => void;
}) {
  const values = rows.map((r, i) => ({ ...r, id: r.id ?? `new-${i}` }));
  return (
    <>
      <DataGrid
        name="Payment plan"
        rows={values}
        columns={[
          {
            key: "label",
            label: "Payment",
            value: (r) => r.label,
            editable: () => true,
            validate: (v) => !!v.trim(),
          },
          {
            key: "due_date",
            label: "Due date (YYYY-MM-DD)",
            value: (r) => r.due_date,
            editable: () => true,
            validate: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)),
          },
          {
            key: "amount",
            label: "Amount",
            value: (r) => r.amount,
            numeric: true,
            total: true,
            editable: () => true,
            validate: (v) =>
              Number.isSafeInteger(Number(v.replace(/,/g, ""))) && Number(v.replace(/,/g, "")) > 0,
          },
        ]}
        onChange={(changes) => {
          const next = rows.map((r) => ({ ...r }));
          for (const change of changes) {
            const i = values.findIndex((r) => r.id === change.id);
            if (change.key === "amount") next[i].amount = Number(change.value.replace(/,/g, ""));
            else if (change.key === "label") next[i].label = change.value;
            else next[i].due_date = change.value;
          }
          onChange(next);
        }}
      />
      <button
        type="button"
        onClick={() =>
          onChange([
            ...rows,
            {
              seq: Math.max(0, ...rows.map((r) => r.seq)) + 1,
              label: `Instalment ${rows.length + 1}`,
              due_date: today(),
              amount: 1,
            },
          ])
        }
      >
        Add payment row
      </button>
      <button type="button" disabled={!rows.length} onClick={() => onChange(rows.slice(0, -1))}>
        Remove last unpaid row
      </button>
    </>
  );
}
export function SellUnit({
  unit,
  customers,
  endpoint,
  close,
  done,
  existing,
}: {
  unit: SaleUnit;
  customers: SalesSheet["customers"];
  endpoint: string;
  close: () => void;
  done: () => void;
  existing?: SaleAgreement;
}) {
  const [step, setStep] = useState(1),
    [customer, setCustomer] = useState(existing?.customer_party_id ?? ""),
    [price, setPrice] = useState(existing?.total_price ?? unit.list_price),
    [plan, setPlan] = useState<"full" | "installments" | "custom">(existing?.plan_type ?? "full"),
    [date, setDate] = useState(existing?.agreement_date ?? today()),
    [rows, setRows] = useState<Installment[]>(
      existing?.schedule ?? [
        { seq: 1, label: "Full payment", due_date: today(), amount: unit.list_price },
      ],
    ),
    [down, setDown] = useState(20),
    [percent, setPercent] = useState(true),
    [count, setCount] = useState(10),
    [interval, setInterval] = useState(1),
    [days, setDays] = useState(false),
    [first, setFirst] = useState(today()),
    [possession, setPossession] = useState(0),
    [quick, setQuick] = useState(false),
    [people, setPeople] = useState(customers),
    [notes, setNotes] = useState(existing?.notes ?? ""),
    [second, setSecond] = useState(existing?.second_buyer_name ?? ""),
    [reference, setReference] = useState(existing?.reference ?? ""),
    [initial, setInitial] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const difference = price - rows.reduce((s, r) => s + r.amount, 0);
  const reason =
    step === 1 && !customer
      ? "Select or add a customer."
      : step === 2 && price <= 0
        ? "Enter a price greater than zero."
        : step >= 3 && (difference !== 0 || rows.some((r) => r.amount <= 0))
          ? `Total must equal price (difference: ${whole(difference)}).`
          : "";
  function generate() {
    try {
      setRows(
        generateInstallments({
          price,
          downPayment: percent ? Math.round((price * down) / 100) : down,
          count,
          firstDueDate: first,
          intervalMonths: days ? undefined : interval,
          intervalDays: days ? interval : undefined,
          possession,
        }),
      );
      setError("");
    } catch (e) {
      setError(friendlyError(e));
    }
  }
  async function save() {
    if (reason || busy) return;
    setBusy(true);
    try {
      await api<{ id: string }>(
        endpoint + "/agreements" + (existing ? "/" + existing.id : ""),
        existing ? "PUT" : "POST",
        {
          unit_id: unit.id,
          customer_party_id: customer,
          agreement_date: date,
          total_price: price,
          discount: Math.max(0, unit.list_price - price),
          plan_type: plan,
          notes,
          second_buyer_name: second,
          reference,
          schedule: rows,
          version: existing?.version,
          firstPayment:
            initial && !existing
              ? {
                  received_on: date,
                  amount: rows[0].amount,
                  method: "bank_transfer",
                  deposited_to: "bank",
                  notes: "First payment",
                }
              : undefined,
        },
      );
      done();
      close();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SalesDialog
      title={`${existing ? "Edit payment plan" : "Sell this unit"} · ${unit.unit_no}`}
      close={close}
    >
      <ol className="sales-steps">
        {["Customer", "Price", "Payment plan", "Review"].map((s, i) => (
          <li key={s} aria-current={step === i + 1 ? "step" : undefined}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      {step === 1 && (
        <>
          <label>
            Customer
            <select
              disabled={!!existing}
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
            >
              <option value="">Choose customer</option>
              {people.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => setQuick(true)}>+ Add new customer</button>
          <Field label="Second buyer (optional)" value={second} onChange={setSecond} />
        </>
      )}
      {step === 2 && (
        <>
          <MoneyInput
            label="Agreed price"
            value={price}
            onChange={(n) => {
              setPrice(n);
              if (plan === "full")
                setRows([{ seq: 1, label: "Full payment", due_date: date, amount: n }]);
            }}
          />
          <p>Discount from list price: {whole(Math.max(0, unit.list_price - price))}</p>
          <Field label="Agreement date" type="date" value={date} onChange={setDate} />
          <Field label="Reference (optional)" value={reference} onChange={setReference} />
        </>
      )}
      {step === 3 && (
        <>
          <div className="sales-plan-cards">
            {(["full", "installments", "custom"] as const).map((p) => (
              <label key={p}>
                <input
                  type="radio"
                  checked={plan === p}
                  onChange={() => {
                    setPlan(p);
                    if (p === "full")
                      setRows([{ seq: 1, label: "Full payment", due_date: date, amount: price }]);
                  }}
                />
                {p === "full"
                  ? "Full payment"
                  : p === "installments"
                    ? "Instalments"
                    : "Custom plan"}
              </label>
            ))}
          </div>
          {plan === "installments" && (
            <>
              <p>
                Split the price into smaller payments on agreed dates.{" "}
                <span title="An instalment is one scheduled part of the sale price.">ⓘ</span>
              </p>
              <div className="sales-fields">
                <MoneyInput
                  label={percent ? "Down payment percent" : "Down payment amount"}
                  value={down}
                  onChange={setDown}
                />
                <label>
                  <input
                    type="checkbox"
                    checked={percent}
                    onChange={(e) => setPercent(e.target.checked)}
                  />
                  Use percent
                </label>
                <MoneyInput label="Number of instalments" value={count} onChange={setCount} />
                <MoneyInput
                  label={days ? "Days between payments" : "Months between payments"}
                  value={interval}
                  onChange={setInterval}
                />
                <label>
                  <input
                    type="checkbox"
                    checked={days}
                    onChange={(e) => setDays(e.target.checked)}
                  />
                  Use days
                </label>
                <Field label="First due date" type="date" value={first} onChange={setFirst} />
                <MoneyInput
                  label="On possession (optional)"
                  value={possession}
                  onChange={setPossession}
                />
              </div>
              <button onClick={generate}>Preview schedule</button>
            </>
          )}
          <ScheduleEditor rows={rows} onChange={setRows} />
          <p role="status" className={difference ? "sales-overdue" : ""}>
            Total must equal price (difference: {whole(difference)})
          </p>
        </>
      )}
      {step === 4 && (
        <>
          <p>
            <strong>{people.find((c) => c.id === customer)?.name}</strong> · {unit.unit_no}
          </p>
          <p>
            Price: PKR {whole(price)} · {rows.length} planned payments
          </p>
          <Field label="Notes (optional)" value={notes} onChange={setNotes} />
          {!existing && (
            <label>
              <input
                type="checkbox"
                checked={initial}
                onChange={(e) => setInitial(e.target.checked)}
              />
              Record the first payment now ({whole(rows[0]?.amount ?? 0)} into Bank)
            </label>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <footer className="sales-actions">
        {step > 1 && <button onClick={() => setStep(step - 1)}>Back</button>}
        <button
          className="projects-primary"
          disabled={!!reason || busy}
          onClick={() => (step < 4 ? setStep(step + 1) : void save())}
        >
          {busy ? "Saving…" : step < 4 ? "Continue" : "Confirm sale"}
        </button>
        {reason && <small>{reason}</small>}
      </footer>
      {quick && (
        <AddCustomer
          close={() => setQuick(false)}
          done={(c) => {
            setPeople([...people, c]);
            setCustomer(c.id);
          }}
        />
      )}
    </SalesDialog>
  );
}
export function ReceivePayment({
  agreement,
  endpoint,
  close,
  done,
  payment,
}: {
  agreement: SaleAgreement;
  endpoint: string;
  close: () => void;
  done: (id: string) => void;
  payment?: SalePayment;
}) {
  const state = agreementStatus(agreement);
  const remaining = state.remaining + (payment?.amount ?? 0);
  const [amount, setAmount] = useState(
      payment?.amount ?? state.schedule.find((s) => s.remaining > 0)?.remaining ?? remaining,
    ),
    [date, setDate] = useState(payment?.received_on ?? today()),
    [method, setMethod] = useState(() => {
      try {
        return payment?.method ?? localStorage.getItem("sales:last-method") ?? "bank_transfer";
      } catch {
        return "bank_transfer";
      }
    }),
    [bank, setBank] = useState(payment?.deposited_to ?? "bank"),
    [reference, setReference] = useState(payment?.reference ?? ""),
    [notes, setNotes] = useState(payment?.notes ?? ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const reason =
    amount <= 0
      ? "Enter an amount greater than zero."
      : amount > remaining
        ? `You cannot receive more than the PKR ${whole(remaining)} still owed.`
        : "";
  return (
    <SalesDialog title={payment ? "Edit payment" : "Receive payment"} close={close}>
      <p>
        {agreement.customer_name} · Still to receive: {whole(remaining)}
      </p>
      <MoneyInput label="Amount received" value={amount} onChange={setAmount} />
      <p role="status">Remaining after this payment: {whole(remaining - amount)}</p>
      <div className="sales-fields">
        <Field label="Date" type="date" value={date} onChange={setDate} />
        <label>
          Payment method
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {["cash", "bank_transfer", "cheque", "online", "other"].map((m) => (
              <option key={m} value={m}>
                {m.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Deposited to
          <select value={bank} onChange={(e) => setBank(e.target.value as "bank" | "cash")}>
            <option value="bank">Bank</option>
            <option value="cash">Cash</option>
          </select>
        </label>
        <Field label="Reference" value={reference} onChange={setReference} />
        <Field label="Notes" value={notes} onChange={setNotes} />
      </div>
      {error && <p role="alert">{error}</p>}
      <button
        className="projects-primary"
        disabled={!!reason || busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await api<{ id: string }>(
              endpoint + "/payments" + (payment ? "/" + payment.id : ""),
              payment ? "PUT" : "POST",
              {
                agreement_id: agreement.id,
                received_on: date,
                amount,
                method,
                deposited_to: bank,
                reference,
                notes,
                expectedVoucherId: payment?.voucher_id,
              },
            );
            try {
              localStorage.setItem("sales:last-method", method);
            } catch {
              /* optional */
            }
            done(r.id);
            close();
          } catch (e) {
            setError(friendlyError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Save payment
      </button>
      {reason && <p>{reason}</p>}
    </SalesDialog>
  );
}
export function Receipt({
  endpoint,
  id,
  close,
}: {
  endpoint: string;
  id: string;
  close: () => void;
}) {
  const [data, setData] = useState<{
      company: string;
      payment: SalePayment;
      agreement: SaleAgreement;
      unit: SaleUnit;
      remaining: number;
    }>(),
    [error, setError] = useState("");
  useEffect(() => {
    api<typeof data>(`${endpoint}/payments/${id}/receipt`)
      .then(setData)
      .catch((e) => setError(friendlyError(e)));
  }, [endpoint, id]);
  return (
    <SalesDialog title="Payment receipt" close={close}>
      {error && <p role="alert">{error}</p>}
      {data ? (
        <>
          <article className="sales-receipt">
            <h2>{data.company}</h2>
            <h3>
              {data.payment.receipt_no} {data.payment.status === "void" ? "— Voided" : ""}
            </h3>
            <p>Date: {data.payment.received_on}</p>
            <p>Received from: {data.agreement.customer_name}</p>
            <p>Unit: {data.unit.unit_no}</p>
            <h2>PKR {whole(data.payment.amount)}</h2>
            <p>{amountInWords(data.payment.amount)}</p>
            <p>
              Method: {data.payment.method.replace("_", " ")} · Reference:{" "}
              {data.payment.reference || "—"}
            </p>
            <p>Current remaining amount: PKR {whole(data.remaining)}</p>
            <hr />
            <p>Received by __________________</p>
          </article>
          <button onClick={() => window.print()}>Print receipt</button>
        </>
      ) : (
        <p>Loading receipt…</p>
      )}
    </SalesDialog>
  );
}
function UnitEditor({
  unit,
  endpoint,
  close,
  done,
}: {
  unit?: SaleUnit;
  endpoint: string;
  close: () => void;
  done: () => void;
}) {
  const [d, setD] = useState({
      unit_no: "",
      category: "Flat",
      floor_label: "",
      size_sqft: 0,
      bedrooms: 0,
      bathrooms: 0,
      facing: "",
      list_price: 0,
      notes: "",
      is_active: true,
      ...unit,
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <SalesDialog title={unit ? "Edit unit" : "Add unit"} close={close}>
      <div className="sales-fields">
        <Field label="Unit number" value={d.unit_no} onChange={(v) => setD({ ...d, unit_no: v })} />
        <label>
          Type
          <select value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })}>
            {["Flat", "Shop", "Office", "Other"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <Field
          label="Floor"
          value={d.floor_label}
          onChange={(v) => setD({ ...d, floor_label: v })}
        />
        <MoneyInput
          label="Size (sq ft)"
          value={d.size_sqft}
          onChange={(v) => setD({ ...d, size_sqft: v })}
        />
        <MoneyInput
          label="List price"
          value={d.list_price}
          onChange={(v) => setD({ ...d, list_price: v })}
        />
        <MoneyInput
          label="Bedrooms"
          value={d.bedrooms}
          onChange={(v) => setD({ ...d, bedrooms: v })}
        />
        <MoneyInput
          label="Bathrooms"
          value={d.bathrooms}
          onChange={(v) => setD({ ...d, bathrooms: v })}
        />
        <Field label="Facing" value={d.facing} onChange={(v) => setD({ ...d, facing: v })} />
        <Field label="Notes" value={d.notes} onChange={(v) => setD({ ...d, notes: v })} />
      </div>
      {error && <p role="alert">{error}</p>}
      <button
        className="projects-primary"
        disabled={!d.unit_no.trim() || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api(endpoint + "/units" + (unit ? "/" + unit.id : ""), unit ? "PUT" : "POST", d);
            done();
            close();
          } catch (e) {
            setError(friendlyError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Save unit
      </button>
      {!d.unit_no.trim() && <small>Enter a unit number to save.</small>}
    </SalesDialog>
  );
}
export function Sales({ id, manage }: { id: string; manage: boolean }) {
  const endpoint = `projects/${id}/sales`;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [sheet, setSheet] = useState<SalesSheet>(),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [view, setView] = useState("table"),
    [filter, setFilter] = useState(""),
    [category, setCategory] = useState(""),
    [floor, setFloor] = useState(""),
    [showVoided, setShowVoided] = useState(false),
    [modal, setModal] = useState(""),
    [receipt, setReceipt] = useState(""),
    [editingPayment, setEditingPayment] = useState<SalePayment>(),
    [prefix, setPrefix] = useState(""),
    [start, setStart] = useState(1),
    [bulkPrice, setBulkPrice] = useState(0),
    [perSqft, setPerSqft] = useState(false),
    [actionDate, setActionDate] = useState(today()),
    [refund, setRefund] = useState(0),
    [forfeit, setForfeit] = useState(0),
    [paidFrom, setPaidFrom] = useState("bank"),
    [reason, setReason] = useState(""),
    [confirmZero, setConfirmZero] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const refresh = () => setRevision((n) => n + 1);
  useEffect(() => {
    let live = true;
    api<SalesSheet>(endpoint)
      .then((s) => {
        if (live) {
          setSheet(s);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(friendlyError(e));
      });
    return () => {
      live = false;
    };
  }, [endpoint, revision]);
  async function action(path: string, body: unknown) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(endpoint + path, "POST", body);
      refresh();
      setModal("");
      setNotice("Saved. Your previous records remain in history.");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  const unit = sheet?.units.find((u) => u.id === params.get("unit"));
  const agreement = sheet?.agreements.find((a) => a.unit_id === unit?.id && a.status === "active");
  const open = (uid: string) => setParams({ ...Object.fromEntries(params), unit: uid });
  if (!sheet) return <p role={error ? "alert" : "status"}>{error || "Loading sales…"}</p>;
  const rows = sheet.units
    .map((u) => {
      const a = sheet.agreements.find((a) => a.unit_id === u.id && a.status === "active");
      const status = a ? agreementStatus(a) : undefined;
      return {
        ...u,
        agreement: a,
        state: status,
        status: status?.unitStatus ?? "Available",
        customer: a?.customer_name ?? "",
        total: a?.total_price ?? 0,
        received: a?.received ?? 0,
        remaining: status?.remaining ?? 0,
      };
    })
    .filter(
      (u) =>
        (showVoided || u.is_active) &&
        (!filter || u.status === filter) &&
        (!category || u.category === category) &&
        (!floor || u.floor_label === floor),
    );
  const columns: GridColumn<(typeof rows)[number]>[] = [
    {
      key: "unit_no",
      label: "Unit no",
      value: (u) => u.unit_no,
      render: (u) => <button onClick={() => open(u.id)}>{u.unit_no}</button>,
    },
    { key: "category", label: "Type", value: (u) => u.category },
    { key: "floor", label: "Floor", value: (u) => u.floor_label },
    { key: "size", label: "Size (sq ft)", value: (u) => u.size_sqft, numeric: true, total: true },
    {
      key: "list_price",
      label: "List price",
      value: (u) => u.list_price,
      numeric: true,
      total: true,
      editable: (u) => manage && !u.agreement,
      validate: (v) =>
        Number.isSafeInteger(Number(v.replace(/,/g, ""))) && Number(v.replace(/,/g, "")) >= 0,
    },
    {
      key: "status",
      label: "Status",
      value: (u) => u.status,
      render: (u) => (
        <span className={`sales-status status-${u.status.toLowerCase().replace(/ /g, "-")}`}>
          {u.is_active ? u.status : "Inactive"}
        </span>
      ),
    },
    { key: "customer", label: "Customer", value: (u) => u.customer },
    { key: "total", label: "Total price", value: (u) => u.total, numeric: true, total: true },
    { key: "received", label: "Received", value: (u) => u.received, numeric: true, total: true },
    { key: "remaining", label: "Remaining", value: (u) => u.remaining, numeric: true, total: true },
    {
      key: "progress",
      label: "Paid %",
      value: (u) => Math.round(u.state?.percentPaid ?? 0),
      render: (u) => (
        <progress
          max={100}
          value={u.state?.percentPaid ?? 0}
          aria-label={`${u.unit_no} percent paid`}
        />
      ),
    },
    {
      key: "open",
      label: "Details",
      value: () => "",
      render: (u) => <button onClick={() => open(u.id)}>Open</button>,
    },
  ];
  const overdue = sheet.agreements
    .filter((a) => a.status === "active")
    .flatMap((a) =>
      agreementStatus(a)
        .schedule.filter((s) => s.status === "overdue")
        .map((s) => ({ ...s, agreement: a })),
    );
  return (
    <div className="sales-page">
      <header className="project-section-heading">
        <div>
          <h2>Sales</h2>
          <p>Units, customers and money received.</p>
        </div>
        {manage && (
          <div className="sales-actions">
            <button onClick={() => setModal("generate")}>Generate units from Building</button>
            <button onClick={() => setModal("unit")}>Add unit manually</button>
            <button onClick={() => setModal("customer")}>Add customer</button>
          </div>
        )}
      </header>
      {error && <p role="alert">{error}</p>}
      {notice && (
        <p role="status">
          {notice} <Link to={`/projects/${id}/transactions`}>View in ledger</Link>
          {receipt && <button onClick={() => setModal("receipt")}>Print receipt</button>}
        </p>
      )}
      <div className="sales-summary">
        {Object.entries({
          "Total units": sheet.totals.total,
          Available: sheet.totals.available,
          Sold: sheet.totals.sold,
          "Fully paid": sheet.totals.fullyPaid,
          "Handed over": sheet.totals.handedOver,
          "Total sale value": sheet.totals.saleValue,
          "Money received": sheet.totals.received,
          "Still to receive": sheet.totals.remaining,
          Overdue: sheet.totals.overdue,
        }).map(([label, value]) => (
          <Link
            key={label}
            to={
              ["Total units", "Available", "Sold", "Fully paid", "Handed over"].includes(label)
                ? `?${label === "Total units" ? "" : "status=" + encodeURIComponent(label)}`
                : `/projects/${id}/transactions?account=${label === "Total sale value" ? "4000" : label === "Money received" ? "1010" : "1100"}`
            }
            onClick={() => {
              if (["Available", "Sold", "Fully paid", "Handed over"].includes(label))
                setFilter(label);
            }}
          >
            <span>{label}</span>
            <strong title={whole(value)}>{whole(value)}</strong>
          </Link>
        ))}
      </div>
      {sheet.expectedSales && <p title={`Sold ${whole(sheet.totals.saleValue)} of expected ${whole(sheet.expectedSales.min)} - ${whole(sheet.expectedSales.max)}`}>Sold {formatPKR(sheet.totals.saleValue)} of expected {formatPKR(sheet.expectedSales.min)} - {formatPKR(sheet.expectedSales.max)} ({sheet.expectedSales.min?Math.round(sheet.totals.saleValue/sheet.expectedSales.min*100):0}% - {sheet.expectedSales.max?Math.round(sheet.totals.saleValue/sheet.expectedSales.max*100):0}%)</p>}
      {overdue.length > 0 && (
        <aside className="sales-overdue">
          <strong>
            {overdue.length} overdue payments · PKR {whole(sheet.totals.overdue)}
          </strong>
          {overdue.slice(0, 5).map((s) => (
            <button key={s.agreement.id + ":" + s.seq} onClick={() => open(s.agreement.unit_id)}>
              {s.agreement.customer_name}: {s.label} · {whole(s.remaining)}
            </button>
          ))}
        </aside>
      )}
      {!sheet.units.length && (
        <div className="projects-empty">
          <p>Create sellable units from your Building details</p>
          {manage && (
            <button className="projects-primary" onClick={() => setModal("generate")}>
              Generate units from Building
            </button>
          )}
        </div>
      )}
      <div className="sales-actions">
        <label>
          Status
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All</option>
            {["Available", "Booked", "Sold", "Fully paid", "Handed over"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All</option>
            {["Flat", "Shop", "Office", "Other"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Floor
          <select value={floor} onChange={(e) => setFloor(e.target.value)}>
            <option value="">All</option>
            {[...new Set(sheet.units.map((u) => u.floor_label))].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <button onClick={() => setView(view === "table" ? "floor" : "table")}>
          {view === "table" ? "Floor grid" : "Table"}
        </button>
        <label>
          <input
            type="checkbox"
            checked={showVoided}
            onChange={(e) => setShowVoided(e.target.checked)}
          />
          Show voided / inactive
        </label>
      </div>
      {view === "table" ? (
        <DataGrid
          name="Units"
          rows={rows}
          columns={columns}
          onTotal={() => {
            navigate(`/projects/${id}/transactions`);
          }}
          onChange={async (changes) => {
            await api(endpoint + "/units/bulk-price", "POST", {
              rows: changes.map((c) => ({
                id: c.id,
                version: sheet.units.find((u) => u.id === c.id)!.version,
                price: Number(c.value.replace(/,/g, "")),
              })),
            });
            setSheet(await api<SalesSheet>(endpoint));
          }}
          bulk={
            manage
              ? (ids, clear) => (
                  <>
                    <MoneyInput label="Set list price" value={bulkPrice} onChange={setBulkPrice} />
                    <label>
                      <input
                        type="checkbox"
                        checked={perSqft}
                        onChange={(e) => setPerSqft(e.target.checked)}
                      />
                      Per sq ft
                    </label>
                    <button
                      onClick={() =>
                        void action("/units/bulk-price", {
                          rows: ids.map((uid) => ({
                            id: uid,
                            version: sheet.units.find((u) => u.id === uid)!.version,
                            price: bulkPrice,
                          })),
                          perSqft,
                        }).then(clear)
                      }
                    >
                      Set price
                    </button>
                    <button
                      onClick={() => {
                        setReason(ids.join(","));
                        setModal("deactivate");
                      }}
                    >
                      Deactivate
                    </button>
                  </>
                )
              : undefined
          }
        />
      ) : (
        <div>
          {[...new Set(rows.map((u) => u.floor_label))].map((f) => (
            <section key={f}>
              <h3>Floor {f || "Unspecified"}</h3>
              <div className="sales-floor">
                {rows
                  .filter((u) => u.floor_label === f)
                  .map((u) => (
                    <button
                      key={u.id}
                      className={`sales-status status-${u.status.toLowerCase().replace(/ /g, "-")}`}
                      onClick={() => open(u.id)}
                    >
                      <strong>{u.unit_no}</strong>
                      <span>{u.status}</span>
                      <span>{u.customer || whole(u.list_price)}</span>
                    </button>
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <h3>Customers</h3>
      <DataGrid
        name="Customers"
        rows={sheet.customers.map((c) => {
          const aa = sheet.agreements.filter(
            (a) => a.customer_party_id === c.id && a.status === "active",
          );
          return {
            ...c,
            units: aa.map((a) => sheet.units.find((u) => u.id === a.unit_id)?.unit_no).join(", "),
            total: aa.reduce((s, a) => s + a.total_price, 0),
            received: aa.reduce((s, a) => s + a.received, 0),
            first: aa[0]?.unit_id,
          };
        })}
        columns={[
          {
            key: "name",
            label: "Customer",
            value: (c) => c.name,
            render: (c) => <button onClick={() => c.first && open(c.first)}>{c.name}</button>,
          },
          { key: "units", label: "Units", value: (c) => c.units },
          { key: "total", label: "Total price", value: (c) => c.total, numeric: true, total: true },
          {
            key: "received",
            label: "Received",
            value: (c) => c.received,
            numeric: true,
            total: true,
          },
          {
            key: "remaining",
            label: "Remaining",
            value: (c) => c.total - c.received,
            numeric: true,
            total: true,
          },
        ]}
        emptyAction={manage && <button onClick={() => setModal("customer")}>Add customer</button>}
      />
      {unit && (
        <SalesDialog
          title={unit.unit_no}
          close={() => {
            const p = new URLSearchParams(params);
            p.delete("unit");
            setParams(p);
          }}
        >
          <div className="sales-detail">
            <p>
              <span
                className={`sales-status status-${(agreement ? agreementStatus(agreement).unitStatus : "Available").toLowerCase().replace(/ /g, "-")}`}
              >
                {agreement ? agreementStatus(agreement).unitStatus : "Available"}
              </span>{" "}
              ·{" "}
              {agreement
                ? agreementStatus(agreement).remaining === 0
                  ? "Fully paid"
                  : `Remaining: ${whole(agreementStatus(agreement).remaining)}`
                : `List price: ${whole(unit.list_price)}`}
            </p>
            <p>
              {unit.category} · Floor {unit.floor_label || "—"} · {whole(unit.size_sqft)} sq ft ·{" "}
              {unit.bedrooms} bedrooms · {unit.bathrooms} bathrooms
            </p>
            {manage && !agreement && (
              <div className="sales-actions">
                <button className="projects-primary" onClick={() => setModal("sell")}>
                  Sell this unit
                </button>
                <button onClick={() => setModal("edit-unit")}>Edit unit</button>
              </div>
            )}
            {agreement && (
              <>
                <h3>{agreement.customer_name}</h3>
                <div className="sales-actions">
                  {manage && (
                    <>
                      <button
                        className="projects-primary"
                        disabled={agreementStatus(agreement).remaining <= 0}
                        onClick={() => {
                          setEditingPayment(undefined);
                          setModal("payment");
                        }}
                      >
                        Receive payment
                      </button>
                      {!agreement.handover_date && (
                        <button onClick={() => setModal("edit-plan")}>Edit payment plan</button>
                      )}
                      <button
                        onClick={() =>
                          setModal(agreement.handover_date ? "undo-handover" : "handover")
                        }
                      >
                        {agreement.handover_date ? "Undo handover" : "Mark as handed over"}
                      </button>
                      {!agreement.handover_date && (
                        <button
                          onClick={() => {
                            setRefund(agreement.received);
                            setForfeit(0);
                            setModal("cancel");
                          }}
                        >
                          Cancel sale
                        </button>
                      )}
                    </>
                  )}
                </div>
                <DataGrid
                  name="Payment schedule"
                  rows={agreementStatus(agreement).schedule.map((s) => ({
                    ...s,
                    id: s.id ?? String(s.seq),
                  }))}
                  columns={[
                    { key: "label", label: "Payment", value: (s) => s.label },
                    { key: "due", label: "Due date", value: (s) => s.due_date },
                    {
                      key: "amount",
                      label: "Amount",
                      value: (s) => s.amount,
                      numeric: true,
                      total: true,
                    },
                    {
                      key: "paid",
                      label: "Paid",
                      value: (s) => s.paid,
                      numeric: true,
                      total: true,
                    },
                    {
                      key: "remaining",
                      label: "Remaining",
                      value: (s) => s.remaining,
                      numeric: true,
                      total: true,
                    },
                    {
                      key: "status",
                      label: "Status",
                      value: (s) => s.status,
                      render: (s) => (
                        <span className={s.status === "overdue" ? "sales-overdue" : ""}>
                          {
                            (
                              {
                                paid: "Paid",
                                partial: "Partly paid",
                                pending: "Pending",
                                overdue: "Overdue",
                              } as Record<string, string>
                            )[s.status]
                          }
                        </span>
                      ),
                    },
                  ]}
                />
                <h3>Payments</h3>
                {sheet.payments
                  .filter(
                    (p) => p.agreement_id === agreement.id && (showVoided || p.status === "posted"),
                  )
                  .map((p) => (
                    <div
                      key={p.id}
                      className={`sales-payment ${p.status === "void" ? "sales-void" : ""}`}
                    >
                      <span>
                        {p.receipt_no} · {p.received_on} · PKR {whole(p.amount)}{" "}
                        {p.status === "void" ? "Voided" : ""}
                      </span>
                      <Link to={`/projects/${id}/transactions?voucher=${p.voucher_id}`}>
                        View in ledger
                      </Link>
                      <button
                        onClick={() => {
                          setReceipt(p.id);
                          setModal("receipt");
                        }}
                      >
                        Print receipt
                      </button>
                      {manage && p.status === "posted" && (
                        <>
                          <button
                            onClick={() => {
                              setEditingPayment(p);
                              setModal("payment");
                            }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              setEditingPayment(p);
                              setReason("");
                              setModal("void");
                            }}
                          >
                            Void
                          </button>
                        </>
                      )}
                    </div>
                  ))}
              </>
            )}
            {showVoided &&
              sheet.agreements
                .filter((a) => a.unit_id === unit.id && a.status === "cancelled")
                .map((a) => (
                  <p className="sales-void" key={a.id}>
                    Cancelled sale · {a.customer_name} · {whole(a.total_price)} · Received{" "}
                    {whole(a.received)} (retained as history)
                  </p>
                ))}
          </div>
        </SalesDialog>
      )}
      {params.get("action") === "receive" && !unit && manage && (
        <SalesDialog title="Receive payment" close={() => setParams({})}>
          <p>Choose a customer's unit.</p>
          {sheet.agreements
            .filter((a) => a.status === "active" && a.received < a.total_price)
            .map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  open(a.unit_id);
                  setEditingPayment(undefined);
                  setModal("payment");
                }}
              >
                {a.customer_name} · {sheet.units.find((u) => u.id === a.unit_id)?.unit_no} ·
                Remaining {whole(a.total_price - a.received)}
              </button>
            ))}
          {!sheet.agreements.some((a) => a.status === "active" && a.received < a.total_price) && (
            <p>No unpaid sales. Sell a unit first.</p>
          )}
        </SalesDialog>
      )}
      {modal === "customer" && <AddCustomer close={() => setModal("")} done={() => refresh()} />}
      {(modal === "unit" || modal === "edit-unit") && (
        <UnitEditor
          unit={modal === "edit-unit" ? unit : undefined}
          endpoint={endpoint}
          close={() => setModal("")}
          done={refresh}
        />
      )}
      {(modal === "sell" || modal === "edit-plan") && unit && (
        <SellUnit
          unit={unit}
          customers={sheet.customers}
          endpoint={endpoint}
          existing={modal === "edit-plan" ? agreement : undefined}
          close={() => setModal("")}
          done={() => {
            refresh();
            setNotice("Sale saved.");
          }}
        />
      )}
      {modal === "payment" && agreement && (
        <ReceivePayment
          agreement={agreement}
          endpoint={endpoint}
          payment={editingPayment}
          close={() => setModal("")}
          done={(pid) => {
            refresh();
            setReceipt(pid);
            setNotice(`Payment received from ${agreement.customer_name}.`);
          }}
        />
      )}
      {modal === "receipt" && receipt && (
        <Receipt endpoint={endpoint} id={receipt} close={() => setModal("")} />
      )}
      {modal === "generate" && (
        <SalesDialog title="Generate units from Building" close={() => setModal("")}>
          <Field label="Number prefix (optional)" value={prefix} onChange={setPrefix} />
          <MoneyInput label="Start number" value={start} onChange={setStart} />
          <p>
            Preview:{" "}
            {sheet.building.units
              .flatMap((t) => Array.from({ length: t.count }, () => t))
              .slice(0, 5)
              .map(
                (t, i) => `${prefix}${t.floorsText || "G"}-${String(start + i).padStart(3, "0")}`,
              )
              .join(", ") || "Add unit types in Building first."}
          </p>
          <p>Existing units stay unchanged. Only missing units are added.</p>
          <button
            className="projects-primary"
            disabled={busy || start < 1 || !sheet.building.units.some((t) => t.count > 0)}
            onClick={() => void action("/generate-units", { prefix, start })}
          >
            Generate units
          </button>
          {error && <p role="alert">{error}</p>}
        </SalesDialog>
      )}
      {["handover", "undo-handover", "cancel", "void", "deactivate"].includes(modal) && (
        <SalesDialog
          title={
            modal === "cancel"
              ? "Cancel sale"
              : modal === "void"
                ? "Void payment"
                : modal === "deactivate"
                  ? "Deactivate units"
                  : modal === "handover"
                    ? "Handover"
                    : "Undo handover"
          }
          close={() => setModal("")}
        >
          <p>
            {modal === "cancel"
              ? "The unit becomes available. The sale, payments, refund and retained amount stay recorded."
              : modal === "void"
                ? "This payment will stop counting toward money received. Its original entry and reversal stay recorded."
                : modal === "handover"
                  ? "The unit will count as revenue. Any unpaid amount stays owed by the customer."
                  : modal === "undo-handover"
                    ? "Revenue recognition will be reversed. The sale and its payments stay recorded."
                    : "Selected units will be hidden from available inventory. Units with any sale history cannot be deactivated."}
          </p>
          {modal !== "deactivate" && (
            <Field label="Date" type="date" value={actionDate} onChange={setActionDate} />
          )}{" "}
          {(modal === "cancel" || modal === "void") && (
            <Field label="Reason" value={reason} onChange={setReason} />
          )}{" "}
          {modal === "cancel" && (
            <>
              <MoneyInput label="Refund amount" value={refund} onChange={setRefund} />
              <MoneyInput label="Amount retained" value={forfeit} onChange={setForfeit} />
              <label>
                Refund paid from
                <select value={paidFrom} onChange={(e) => setPaidFrom(e.target.value)}>
                  <option value="bank">Bank</option>
                  <option value="cash">Cash</option>
                </select>
              </label>
              <p>Difference: {whole((agreement?.received ?? 0) - refund - forfeit)}</p>
            </>
          )}
          {modal === "handover" && agreement?.received === 0 && (
            <label>
              <input
                type="checkbox"
                checked={confirmZero}
                onChange={(e) => setConfirmZero(e.target.checked)}
              />
              I confirm handover with no money received
            </label>
          )}
          {error && <p role="alert">{error}</p>}
          <button
            className="projects-primary"
            disabled={
              busy ||
              (modal === "cancel" &&
                (refund + forfeit !== agreement?.received || !reason.trim())) ||
              (modal === "void" && !reason.trim()) ||
              (modal === "handover" && agreement?.received === 0 && !confirmZero)
            }
            onClick={async () => {
              if (modal === "deactivate") {
                setBusy(true);
                try {
                  for (const uid of reason.split(",")) {
                    const u = sheet.units.find((u) => u.id === uid)!;
                    await api(endpoint + `/units/${uid}/deactivate`, "POST", {
                      version: u.version,
                    });
                  }
                  refresh();
                  setModal("");
                } catch (e) {
                  setError(friendlyError(e));
                } finally {
                  setBusy(false);
                }
                return;
              }
              if (modal === "void" && editingPayment)
                await action(`/payments/${editingPayment.id}/void`, {
                  reason,
                  expectedVoucherId: editingPayment.voucher_id,
                });
              else if (agreement)
                await action(
                  `/agreements/${agreement.id}/` +
                    (modal === "cancel"
                      ? "cancel"
                      : modal === "undo-handover"
                        ? "handover/void"
                        : "handover"),
                  modal === "cancel"
                    ? {
                        cancelled_on: actionDate,
                        reason,
                        refund_amount: refund,
                        forfeited_amount: forfeit,
                        refund_paid_from: paidFrom,
                        version: agreement.version,
                      }
                    : { date: actionDate, version: agreement.version, confirmZero },
                );
            }}
          >
            Confirm
          </button>
          {modal === "cancel" && (refund + forfeit !== agreement?.received || !reason.trim()) && (
            <small>Enter a reason; refund plus retained amount must equal money received.</small>
          )}
        </SalesDialog>
      )}
    </div>
  );
}
