import { useId, useState, type ReactNode } from "react";
import "./pagination.css";

export function PaginatedRecords<T>({
  items,
  label,
  children,
}: {
  items: T[];
  label: string;
  children: (item: T) => ReactNode;
}) {
  const pages = usePagination(items, JSON.stringify(items), label);
  return (
    <>
      {pages.controls}
      {pages.items.map(children)}
    </>
  );
}

export function usePagination<T>(items: T[], resetKey: string, label = "records") {
  const [size, setSize] = useState(12);
  const [position, setPosition] = useState({ key: resetKey, page: 1 });
  const count = Math.max(1, Math.ceil(items.length / size));
  const page = position.key === resetKey ? Math.min(position.page, count) : 1;
  // Persist resets and clamping so a later data refresh cannot revive an old page.
  if (position.key !== resetKey || position.page !== page) setPosition({ key: resetKey, page });
  const id = useId();
  const move = (next: number) =>
    setPosition({ key: resetKey, page: Math.max(1, Math.min(next, count)) });
  const controls =
    items.length > 12 ? (
      <nav className="record-pagination" aria-label={`${label} pagination`}>
        <span role="status">
          Showing {(page - 1) * size + 1}–{Math.min(page * size, items.length)} of {items.length}
        </span>
        <label htmlFor={id}>
          Per page{" "}
          <select
            id={id}
            value={size}
            onChange={(event) => {
              setSize(Number(event.target.value));
              move(1);
            }}
          >
            {[12, 24, 48].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <div>
          <button
            type="button"
            disabled={page === 1}
            onClick={() => move(1)}
            aria-label="First page"
          >
            First
          </button>
          <button type="button" disabled={page === 1} onClick={() => move(page - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {count}
          </span>
          <button type="button" disabled={page === count} onClick={() => move(page + 1)}>
            Next
          </button>
          <button
            type="button"
            disabled={page === count}
            onClick={() => move(count)}
            aria-label="Last page"
          >
            Last
          </button>
        </div>
      </nav>
    ) : null;
  return { items: items.slice((page - 1) * size, page * size), controls };
}
