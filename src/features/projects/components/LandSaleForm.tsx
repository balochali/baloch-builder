import { listProjectSales } from "@/data/repositories/projectSalesRepository";
import { updateProjectStatus } from "@/data/repositories/projectsRepository";
import { useEffect, useState } from "react";
import { newId } from "@/data/ids";
import { format } from "date-fns";
import { LandSaleSchema, recordLandSale } from "@/data/repositories/landSalesRepository";
import { emptyPaymentDetails } from "@/data/repositories/projectPartnersRepository";
import { saveProjectSaleImage } from "@/data/repositories/documentsRepository";
import { AttachmentUpload } from "@/components/AttachmentUpload";
import {
  PaymentAccountSelect,
  PaymentMethodSelect,
  type PaymentMethod,
} from "@/components/PaymentChoices";
import { PartnerPaymentFields } from "@/components/PartnerPaymentFields";
import { Button } from "@/components/ui/button";
import "./land-sale.css";

export function LandSaleForm({
  projectId,
  acquiredDate,
  onSaved,
  onBusy,
}: {
  projectId: string;
  acquiredDate: string;
  onSaved: () => Promise<void>;
  onBusy: (busy: boolean) => void;
}) {
  const [id, setId] = useState(newId);
  const [loading, setLoading] = useState(true);
  const [buyer, setBuyer] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [price, setPrice] = useState("");
  const [received, setReceived] = useState("");
  const [notes, setNotes] = useState("");
  const [account, setAccount] = useState<"personal" | "builder">("personal");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [details, setDetails] = useState({ ...emptyPaymentDetails });
  const [reference, setReference] = useState("");
  const [documents, setDocuments] = useState<File[]>([]);
  const [receipts, setReceipts] = useState<File[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    listProjectSales(projectId)
      .then((rows) => {
        if (!active) return;
        const existing = rows.find((row) => row.kind === "land");
        if (existing) {
          const payment = JSON.parse(existing.custom || "{}");
          setId(existing.id);
          setBuyer(existing.buyer_name);
          setPhone(existing.buyer_phone || "");
          setAddress(existing.buyer_address || "");
          setDate(existing.sale_date);
          setPrice(String(existing.price));
          setReceived(String(payment.received || 0));
          setNotes(existing.notes || "");
          setAccount(payment.account_key || "personal");
          setMethod(payment.method || "cash");
          setReference(payment.reference || "");
          setDetails({ ...emptyPaymentDetails, ...payment.payment_details });
          setSaved(true);
        }
        setLoading(false);
      })
      .catch(() => {
        if (active)
          setError("Could not check existing land sales. Reopen this dialog to try again.");
      });
    return () => {
      active = false;
    };
  }, [projectId]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || loading) return;
    const result = LandSaleSchema.safeParse({
      project_id: projectId,
      buyer_name: buyer,
      buyer_phone: phone,
      buyer_address: address,
      sale_date: date,
      price: Number(price),
      received: Number(received),
      account_key: account,
      method,
      reference,
      payment_details: details,
      notes,
    });
    if (!result.success) return setError(result.error.issues[0].message);
    if (date < acquiredDate)
      return setError("Sale date cannot be before the land acquisition date.");
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      if (!saved) {
        await recordLandSale(id, result.data);
        setSaved(true);
      }
      const pendingDocs: File[] = [],
        pendingReceipts: File[] = [];
      for (const file of documents) {
        try {
          await saveProjectSaleImage(id, file, date);
        } catch {
          pendingDocs.push(file);
        }
      }
      for (const file of receipts) {
        try {
          await saveProjectSaleImage(id, file, date, "land_sale_receipt");
        } catch {
          pendingReceipts.push(file);
        }
      }
      setDocuments(pendingDocs);
      setReceipts(pendingReceipts);
      if (pendingDocs.length + pendingReceipts.length) {
        setError(
          "Sale and status saved. Some attachments failed. Retry to upload the remaining files without creating another sale.",
        );
        return;
      }
      if (saved) await updateProjectStatus(projectId, "land sold");
      await onSaved();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <form className="land-sale-form" onSubmit={submit}>
      <div>
        <h3>Sell acquired land</h3>
        <p>
          Record the buyer and agreement. Only money received is added to Bank. Partner payouts are
          recorded separately in Profit & Loss.
        </p>
      </div>
      {loading && <p role="status">Checking saved land sales…</p>}
      {saved && (
        <p>
          The land sale is already recorded. You can attach additional documents below; the sale
          will not be duplicated.
        </p>
      )}
      <fieldset disabled={busy || saved || loading}>
        <div className="land-sale-fields">
          <label>
            Buyer name *<input required value={buyer} onChange={(e) => setBuyer(e.target.value)} />
          </label>
          <label>
            Buyer phone
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="is-wide">
            Buyer address
            <input value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
          <label>
            Sale date *
            <input
              type="date"
              required
              min={acquiredDate}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Sale price (Rs) *
            <input
              type="number"
              required
              min="1"
              step="1"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          <label>
            Amount received (Rs) *
            <input
              type="number"
              required
              min="0"
              max={price || undefined}
              step="1"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
            />
          </label>
          <div className="land-sale-balance">
            Still to receive
            <strong>Rs {Math.max(0, Number(price) - Number(received)).toLocaleString()}</strong>
          </div>
        </div>
        {Number(received) > 0 && (
          <>
            <PaymentAccountSelect
              direction="in"
              value={account}
              onChange={setAccount}
              disabled={busy || saved}
            />
            <PaymentMethodSelect value={method} onChange={setMethod} disabled={busy || saved}>
              <PartnerPaymentFields
                method={method}
                value={details}
                onChange={setDetails}
                reference={reference}
                onReferenceChange={setReference}
                disabled={busy || saved}
              />
            </PaymentMethodSelect>
          </>
        )}
        <label>
          Sale notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </fieldset>
      <AttachmentUpload
        title="Sale documents (optional)"
        description="Sale agreement, transfer deed or buyer documents. Images and PDFs are supported."
        label="Add sale documents"
        files={documents}
        onChange={setDocuments}
        allowPdf
        mode="append"
        disabled={busy}
      />
      {Number(received) > 0 && (
        <AttachmentUpload
          title="Payment proof (optional)"
          description="Receipt, transfer confirmation or cheque copy for the money received."
          label="Add payment proof"
          files={receipts}
          onChange={setReceipts}
          allowPdf
          mode="append"
          disabled={busy}
        />
      )}
      {error && <p role="alert">{error}</p>}
      <Button type="submit" disabled={busy || loading}>
        {busy ? "Saving…" : saved ? "Retry attachments / finish" : "Save sale & mark Land Sold"}
      </Button>
    </form>
  );
}
