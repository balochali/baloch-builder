import { useId, useState, type ReactNode } from "react";
import { Search, SlidersHorizontal, RotateCcw } from "lucide-react";
import { usePagination } from "./Pagination";

type Facet<T> = { label: string; value: (record: T) => string | null | undefined };
type Config<T> = {
  label: string;
  paginate?: boolean;
  sortable?: boolean;
  showSearch?: boolean;
  searchText: (record: T) => string;
  date?: (record: T) => string | null | undefined;
  dateLabel?: string;
  amount?: (record: T) => number;
  facets?: Facet<T>[];
};

/** One filter model for cards, tables and their matching result totals. */
export function useRecordFilters<T>(records: T[], config: Config<T>) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minimum, setMinimum] = useState("");
  const [maximum, setMaximum] = useState("");
  const [sort, setSort] = useState("original");
  const id = useId();
  const valid =
    (!from || !to || from <= to) && (!minimum || !maximum || Number(minimum) <= Number(maximum));
  const term = search.trim().toLocaleLowerCase();
  const visible = valid
    ? records.filter((record) => {
        const date = config.date?.(record)?.slice(0, 10);
        const amount = config.amount?.(record);
        return (
          config.searchText(record).toLocaleLowerCase().includes(term) &&
          (config.facets ?? []).every(
            (facet) =>
              !selected[facet.label] ||
              (facet.value(record) || "Not recorded") === selected[facet.label],
          ) &&
          (!from || (!!date && date >= from)) &&
          (!to || (!!date && date <= to)) &&
          (!minimum || (amount !== undefined && amount >= Number(minimum))) &&
          (!maximum || (amount !== undefined && amount <= Number(maximum)))
        );
      })
    : [];
  visible.sort((a, b) => {
    if (sort === "name") return config.searchText(a).localeCompare(config.searchText(b));
    if (sort === "highest") return (config.amount?.(b) ?? 0) - (config.amount?.(a) ?? 0);
    if (sort === "lowest") return (config.amount?.(a) ?? 0) - (config.amount?.(b) ?? 0);
    if (sort === "newest" || sort === "oldest") {
      const left = config.date?.(a) || "";
      const right = config.date?.(b) || "";
      if (!left || !right) return left ? -1 : right ? 1 : 0;
      return sort === "newest" ? right.localeCompare(left) : left.localeCompare(right);
    }
    return 0;
  });
  const active = Boolean(
    search ||
    from ||
    to ||
    minimum ||
    maximum ||
    sort !== "original" ||
    Object.values(selected).some(Boolean),
  );
  const pagination = usePagination(
    visible,
    JSON.stringify([
      search,
      selected,
      from,
      to,
      minimum,
      maximum,
      sort,
      records.map((record) => (record as { id?: string }).id),
    ]),
    config.label,
  );
  function reset() {
    setSearch("");
    setSelected({});
    setFrom("");
    setTo("");
    setMinimum("");
    setMaximum("");
    setSort("original");
  }
  const controls = (
    <section className="record-filters" aria-label={`${config.label} filters`}>
      <div className="filter-heading">
        <span>
          <SlidersHorizontal size={16} />
          Find & filter
        </span>
        <button type="button" onClick={reset} disabled={!active}>
          <RotateCcw size={14} />
          Reset filters
        </button>
      </div>
      <div className="filter-fields">
        {config.showSearch !== false && (
          <FilterField
            label={`Search ${config.label}`}
            id={`${id}-search`}
            className="filter-search"
          >
            <span>
              <Search size={17} />
              <input
                id={`${id}-search`}
                type="text"
                placeholder={`Search ${config.label}…`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </span>
          </FilterField>
        )}
        {(config.facets ?? []).map((facet, index) => (
          <FilterField key={facet.label} label={facet.label} id={`${id}-facet-${index}`}>
            <select
              id={`${id}-facet-${index}`}
              value={selected[facet.label] || ""}
              onChange={(event) => setSelected({ ...selected, [facet.label]: event.target.value })}
            >
              <option value="">All</option>
              {Array.from(new Set(records.map((record) => facet.value(record) || "Not recorded")))
                .sort()
                .map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
            </select>
          </FilterField>
        ))}
        {config.date && (
          <>
            <FilterField label={`${config.dateLabel || "Date"} from`} id={`${id}-from`}>
              <input
                id={`${id}-from`}
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </FilterField>
            <FilterField label={`${config.dateLabel || "Date"} to`} id={`${id}-to`}>
              <input
                id={`${id}-to`}
                type="date"
                min={from || undefined}
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </FilterField>
          </>
        )}
        {config.amount && (
          <>
            <FilterField label="Min amount (Rs)" id={`${id}-min`}>
              <input
                id={`${id}-min`}
                type="number"
                min="0"
                placeholder="No minimum"
                value={minimum}
                onChange={(event) => setMinimum(event.target.value)}
              />
            </FilterField>
            <FilterField label="Max amount (Rs)" id={`${id}-max`}>
              <input
                id={`${id}-max`}
                type="number"
                min="0"
                placeholder="No maximum"
                value={maximum}
                onChange={(event) => setMaximum(event.target.value)}
              />
            </FilterField>
          </>
        )}
        {config.sortable !== false && (
          <FilterField label="Sort by" id={`${id}-sort`}>
            <select
              id={`${id}-sort`}
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="original">Default order</option>
              <option value="name">Name A–Z</option>
              {config.date && (
                <>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </>
              )}
              {config.amount && (
                <>
                  <option value="highest">Amount: high to low</option>
                  <option value="lowest">Amount: low to high</option>
                </>
              )}
            </select>
          </FilterField>
        )}
      </div>
      <div className="filter-results" role="status">
        <span>
          {valid ? (
            <>
              <strong>{visible.length}</strong> of {records.length} records match
              {active && " · Filters applied"}
            </>
          ) : (
            "Check your range: the end must be on or after the start, and the maximum must be at least the minimum."
          )}
        </span>
      </div>
    </section>
  );
  return {
    pagination: config.paginate === false ? null : pagination.controls,
    visible,
    pageItems: pagination.items,
    controls,
    search,
    setSearch,
    active,
    reset,
  };
}

function FilterField({
  label,
  id,
  children,
  className = "",
}: {
  label: string;
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`filter-field ${className}`}>
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}
