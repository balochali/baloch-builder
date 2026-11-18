import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { can, type Role, type Project } from "@baloch/shared";
import { api } from "@/data/api";
import { SalesDialog, AddCustomer, friendlyError } from "@/features/projects/Sales";
export function GlobalActions({ role }: { role: Role }) {
  const [search, setSearch] = useState(false),
    [add, setAdd] = useState(false),
    [customer, setCustomer] = useState(false),
    [q, setQ] = useState(""),
    [results, setResults] = useState<{ id: string; kind: string; label: string; url: string }[]>(
      [],
    ),
    [projects, setProjects] = useState<Project[]>([]),
    [project, setProject] = useState(""),
    [error, setError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const current = location.pathname.match(/^\/projects\/([^/]+)/)?.[1];
  useEffect(() => {
    const fn = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch((v) => !v);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);
  useEffect(() => {
    if (!search) return;
    let live = true;
    const timer = setTimeout(
      () =>
        api<typeof results>(`search?q=${encodeURIComponent(q)}`)
          .then((r) => {
            if (live) setResults(r);
          })
          .catch((e) => {
            if (live) setError(friendlyError(e));
          }),
      180,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, search]);
  useEffect(() => {
    if (add)
      api<Project[] | { projects: Project[] }>("projects")
        .then((p) => setProjects(Array.isArray(p) ? p : p.projects))
        .catch((e) => setError(friendlyError(e)));
  }, [add]);
  function go(tab: string, action: string) {
    const id = current || project;
    if (!id) {
      setError("Choose a project first.");
      return;
    }
    navigate(`/projects/${id}/${tab}?action=${action}`);
    setAdd(false);
  }
  return (
    <>
      <button onClick={() => setSearch(true)} aria-label="Search workspace (Ctrl+K)">
        Search <kbd>Ctrl+K</kbd>
      </button>
      {can(role, "manageProjects") && (
        <button className="projects-primary" onClick={() => setAdd(true)}>
          + Add
        </button>
      )}
      {search && (
        <SalesDialog title="Search workspace" close={() => setSearch(false)}>
          <label>
            Find a project, unit, customer, partner or entry
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Type at least two characters"
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <ul className="global-search-results">
            {results.map((r) => (
              <li key={r.kind + r.id}>
                <button
                  onClick={() => {
                    navigate(r.url);
                    setSearch(false);
                  }}
                >
                  {r.label} <small>{r.kind}</small>
                </button>
              </li>
            ))}
          </ul>
          {q.length >= 2 && !results.length && <p>No matches. Try a name or number.</p>}
        </SalesDialog>
      )}
      {add && (
        <SalesDialog title="Add" close={() => setAdd(false)}>
          {!current && (
            <label>
              Project
              <select value={project} onChange={(e) => setProject(e.target.value)}>
                <option value="">Choose project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="sales-actions">
            <button onClick={() => go("sales", "receive")}>Receive payment</button>
            <button onClick={() => go("land", "pay-seller")}>Pay seller</button>
            <button onClick={() => go("partners", "money-in")}>Money in</button>
            <button
              onClick={() => {
                setAdd(false);
                setCustomer(true);
              }}
            >
              Add customer
            </button>
            <span title="Coming soon">
              <button disabled>Contractors · coming soon</button>
            </span>
            <span title="Coming soon">
              <button disabled>Expenses · coming soon</button>
            </span>
          </div>
          {error && <p role="alert">{error}</p>}
        </SalesDialog>
      )}
      {customer && <AddCustomer close={() => setCustomer(false)} done={() => setCustomer(false)} />}
    </>
  );
}
