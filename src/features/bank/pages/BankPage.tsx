import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Landmark, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useRecordFilters } from "@/components/RecordFilters";
import { accountName, type BankAccount } from "@/domain/bankAccount";
import { formatPKR } from "@/domain/money";
import { formatDate } from "@/lib/dates";
import {
  listBankEntries,
  assignBankAccount,
  type BankEntry,
} from "@/data/repositories/bankRepository";

export function BankPage() {
  const [entries, setEntries] = useState<BankEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [account, setAccount] = useState("all");
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setEntries(await listBankEntries());
    } catch {
      setError("Could not load accounts. Restart the updated desktop app, then refresh.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    listBankEntries()
      .then((rows) => {
        if (active) setEntries(rows);
      })
      .catch(() => {
        if (active)
          setError("Could not load accounts. Restart the updated desktop app, then refresh.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const { visible, controls } = useRecordFilters(
    entries.filter((row) => account === "all" || (row.account_key ?? "unassigned") === account),
    {
      label: "bank transactions",
      searchText: (row) => [row.person, row.description, row.project, row.category].join(" "),
      date: (row) => row.date,
      amount: (row) => row.amount,
      facets: [
        { label: "Direction", value: (row) => (row.direction === "in" ? "Money in" : "Money out") },
        { label: "Category", value: (row) => row.category },
        { label: "Project", value: (row) => row.project || "No project" },
        { label: "Method", value: (row) => row.method },
      ],
    },
  );
  async function changeAccount(row: BankEntry, value: BankAccount) {
    setSaving(row.id);
    setError("");
    try {
      await assignBankAccount(row, value);
      setEntries(await listBankEntries());
    } catch {
      setError(
        "Could not update the account. Refresh to check the latest saved data, then try again.",
      );
    } finally {
      setSaving(null);
    }
  }
  const sums = (rows: BankEntry[]) => ({
    incoming: rows
      .filter((row) => row.direction === "in")
      .reduce((sum, row) => sum + row.amount, 0),
    outgoing: rows
      .filter((row) => row.direction === "out")
      .reduce((sum, row) => sum + row.amount, 0),
  });
  const totals = sums(visible);
  return (
    <div className="space-y-6">
      <PageHeader title="Bank" description="Personal and Builder funds, together in one place." />
      <div className="grid gap-4 md:grid-cols-2">
        {(["personal", "builder"] as const).map((key) => {
          const total = sums(entries.filter((row) => row.account_key === key));
          return (
            <section key={key} className="rounded-2xl border bg-card p-6 shadow-sm">
              <Landmark className="mb-3 text-teal-600" />
              <h2 className="text-lg font-semibold">{accountName(key)}</h2>
              <p className="mt-3 text-sm text-muted-foreground">Net recorded movement · all time</p>
              <strong className="text-2xl">{formatPKR(total.incoming - total.outgoing)}</strong>
              <div className="mt-5 grid grid-cols-2 gap-4">
                <div>
                  <span className="flex items-center gap-1 text-sm">
                    <ArrowDownLeft size={16} />
                    Money in
                  </span>
                  <strong>{formatPKR(total.incoming)}</strong>
                </div>
                <div>
                  <span className="flex items-center gap-1 text-sm">
                    <ArrowUpRight size={16} />
                    Money out
                  </span>
                  <strong>{formatPKR(total.outgoing)}</strong>
                </div>
              </div>
            </section>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">
        These totals reflect saved activity, not a live bank balance. No opening balances are
        assumed. Land acquisition uses its recorded purchase price; estimates and promised
        contributions are excluded.
      </p>
      {entries.some((row) => !row.account_key) && (
        <p className="rounded-xl border bg-amber-500/10 p-4 text-sm">
          {entries.filter((row) => !row.account_key).length} older transactions have no account.
          Choose Unassigned below and assign each payment to the correct account.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-3 font-medium">
          Account
          <select
            aria-label="Account"
            className="rounded-lg border bg-background p-2"
            value={account}
            onChange={(event) => setAccount(event.target.value)}
          >
            <option value="all">All accounts</option>
            <option value="personal">Personal Account</option>
            <option value="builder">Builder Account</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </label>
        <Button variant="outline" onClick={refresh} disabled={loading || !!saving}>
          Refresh
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {controls}
      <p className="text-sm">
        Filtered totals: received <strong>{formatPKR(totals.incoming)}</strong> · sent{" "}
        <strong>{formatPKR(totals.outgoing)}</strong> · net{" "}
        <strong>{formatPKR(totals.incoming - totals.outgoing)}</strong>
      </p>
      {loading ? (
        <p>Loading bank transactions…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                {["Date", "Person / description", "Source", "Money in", "Money out", "Account"].map(
                  (title) => (
                    <th key={title} className="p-3 font-medium">
                      {title}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id + row.account_key} className="border-b last:border-0">
                  <td className="whitespace-nowrap p-3">{formatDate(row.date)}</td>
                  <td className="min-w-48 p-3">
                    <strong>{row.person || row.description}</strong>
                    {row.person && <p className="text-muted-foreground">{row.description}</p>}
                    <small>{row.method}</small>
                  </td>
                  <td className="p-3">
                    <Link
                      className="text-teal-700 underline dark:text-teal-300"
                      to={
                        row.project_id
                          ? `/projects/${row.project_id}`
                          : row.source === "personal_expenses"
                            ? "/personal-expense"
                            : "/credit-udhaar"
                      }
                    >
                      {row.category}
                    </Link>
                    <p>{row.project}</p>
                  </td>
                  <td className="whitespace-nowrap p-3 text-emerald-700 dark:text-emerald-400">
                    {row.direction === "in" ? formatPKR(row.amount) : "—"}
                  </td>
                  <td className="whitespace-nowrap p-3">
                    {row.direction === "out" ? formatPKR(row.amount) : "—"}
                  </td>
                  <td className="p-3">
                    <select
                      aria-label={`Account for ${row.person || row.description} on ${row.date}`}
                      value={row.account_key ?? ""}
                      disabled={!!saving}
                      onChange={(event) =>
                        void changeAccount(row, event.target.value as BankAccount)
                      }
                      className="rounded-lg border bg-background p-2"
                    >
                      <option value="" disabled>
                        Unassigned
                      </option>
                      <option value="personal">Personal Account</option>
                      <option value="builder">Builder Account</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && (
            <p className="p-8 text-center text-muted-foreground">
              No transactions match these filters.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
