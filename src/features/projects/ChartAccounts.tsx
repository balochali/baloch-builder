import { Fragment, useEffect, useState } from "react";
import type { AccountRow } from "@baloch/shared";
import { api } from "@/data/api";
import { Input } from "@/components/ui/input";
import { FundingTable, Money } from "./FundingUI";
import { normalSide } from "./fundingView";
import "./projects.css";

export function ChartAccounts() {
  const [accounts, setAccounts] = useState<AccountRow[]>();
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    let active = true;
    api<AccountRow[]>("accounts")
      .then((rows) => {
        if (active) setAccounts(rows);
      })
      .catch((cause) => {
        if (active) setError(String(cause));
      });
    return () => {
      active = false;
    };
  }, []);
  const filtered =
    accounts?.filter((row) =>
      `${row.code} ${row.name} ${row.class}`.toLowerCase().includes(search.trim().toLowerCase()),
    ) ?? [];
  const classes = [...new Set(filtered.map((row) => row.class))];
  return (
    <section className="builder-projects">
      <header className="projects-heading">
        <div>
          <span className="projects-eyebrow">ACCOUNTING SETUP</span>
          <h1>Chart of Accounts</h1>
          <p>Balances calculated from the journal.</p>
        </div>
      </header>
      <label className="project-filters">
        Search accounts
        <Input
          type="search"
          placeholder="Code, name or class"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {error ? (
        <p role="alert">{error}</p>
      ) : !accounts ? (
        <p role="status">Loading accounts...</p>
      ) : !filtered.length ? (
        <p>No accounts match your search.</p>
      ) : (
        <FundingTable headers={["Code", "Name", "Class", "Debit balance", "Credit balance"]}>
          {classes.map((group) => (
            <Fragment key={group}>
              <tr className="funding-band">
                <th colSpan={5} scope="row">
                  {group}
                </th>
              </tr>
              {filtered
                .filter((row) => row.class === group)
                .map((row) => (
                  <tr key={row.code}>
                    <td>{row.code}</td>
                    <td>
                      {row.name}
                      {!row.isActive ? " (Inactive)" : ""}
                    </td>
                    <td>{row.class}</td>
                    <td className="funding-numeric">
                      {row.balance > 0 || (!row.balance && normalSide(row) === "Debit") ? (
                        <Money value={row.balance} />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="funding-numeric">
                      {row.balance < 0 || (!row.balance && normalSide(row) === "Credit") ? (
                        <Money value={Math.abs(row.balance)} />
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
            </Fragment>
          ))}
        </FundingTable>
      )}
    </section>
  );
}
