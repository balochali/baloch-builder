import { useEffect, useRef, useState } from "react";
import {
  addFundingRound,
  allocateFunding,
  listFundingRounds,
  type FundingRound,
  type FundingAllocation,
} from "@/data/repositories/partnerFundingRepository";
import type { ProjectPartnerRow } from "@/data/repositories/projectPartnersRepository";
import { formatPKR } from "@/domain/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function PartnerConstructionFunding({
  projectId,
  partners,
  revision,
  onSaved,
}: {
  projectId: string;
  partners: ProjectPartnerRow[];
  revision: number;
  onSaved: () => void;
}) {
  const [rounds, setRounds] = useState<FundingRound[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    listFundingRounds(projectId)
      .then((rows) => {
        if (active) setRounds(rows);
      })
      .catch((cause) => {
        if (active) setError(String(cause));
      });
    return () => {
      active = false;
    };
  }, [projectId, revision]);
  let preview: FundingAllocation[] = [];
  let previewError = "";
  if (amount) {
    try {
      preview = allocateFunding(Number(amount.replace(/,/g, "")), partners);
    } catch (cause) {
      previewError = (cause as Error).message;
    }
  }
  return (
    <section className="partner-construction-funding">
      <div className="partner-funding-heading">
        <div>
          <h3>Extra construction funding</h3>
          <p>
            Buyer instalments normally fund construction. If more money is needed, request it from
            all partners according to their shares.
          </p>
        </div>
        <Button type="button" onClick={() => setOpen(!open)} disabled={busy}>
          {open ? "Close" : "Request construction money"}
        </Button>
      </div>
      {open && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            setError("");
            try {
              await addFundingRound(projectId, title, Number(amount.replace(/,/g, "")));
              setOpen(false);
              setTitle("");
              setAmount("");
              onSaved();
            } catch (cause) {
              setError((cause as Error).message);
            } finally {
              setBusy(false);
              lock.current = false;
            }
          }}
        >
          <div className="partner-funding-fields">
            <label>
              Request name
              <Input
                required
                maxLength={120}
                value={title}
                disabled={busy}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Second floor construction"
              />
            </label>
            <label>
              Total needed from all partners (Rs)
              <Input
                required
                inputMode="numeric"
                value={amount}
                disabled={busy}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
          </div>
          {previewError && <p role="alert">{previewError}</p>}
          <div className="partner-funding-allocations">
            {preview.map((p) => (
              <div key={p.partner_id}>
                <span>
                  {p.name} · {(p.share_bp / 100).toFixed(2)}%
                </span>
                <strong>{formatPKR(p.amount)}</strong>
              </div>
            ))}
          </div>
          <p>
            This creates a request, not a payment. Record each partner’s payment from their profile.
            The land agreement and ownership shares stay unchanged.
          </p>
          <Button type="submit" disabled={busy || !preview.length}>
            {busy ? "Saving…" : "Save construction request"}
          </Button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {rounds.length > 0 && (
        <details>
          <summary>
            {rounds.length} construction funding {rounds.length === 1 ? "request" : "requests"}
          </summary>
          {rounds.map((r) => (
            <details key={r.id}>
              <summary>
                {r.title} · {formatPKR(r.amount)}
              </summary>
              <div className="partner-funding-allocations">
                {(JSON.parse(r.allocations) as FundingAllocation[]).map((p) => (
                  <div key={p.partner_id}>
                    <span>
                      {p.name} · {(p.share_bp / 100).toFixed(2)}%
                    </span>
                    <strong>{formatPKR(p.amount)}</strong>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </details>
      )}
    </section>
  );
}
