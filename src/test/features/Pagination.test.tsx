import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useRecordFilters } from "@/components/RecordFilters";
import { usePagination } from "@/components/Pagination";
import { DataTable } from "@/components/DataTable";

const records = Array.from({ length: 30 }, (_, index) => ({
  id: String(index),
  name: `Record ${String(index + 1).padStart(2, "0")}`,
  amount: index + 1,
}));
function FilteredList() {
  const filter = useRecordFilters(records, {
    label: "test records",
    searchText: (row) => row.name,
    amount: (row) => row.amount,
  });
  return (
    <>
      {filter.controls}
      {filter.pagination}
      <output aria-label="Matching total">
        {filter.visible.reduce((sum, row) => sum + row.amount, 0)}
      </output>
      <ul>
        {filter.pageItems.map((row) => (
          <li key={row.id}>{row.name}</li>
        ))}
      </ul>
    </>
  );
}
function List({ count }: { count: number }) {
  const pages = usePagination(records.slice(0, count), "same selection", "test");
  return (
    <>
      {pages.controls}
      <ul>
        {pages.items.map((row) => (
          <li key={row.id}>{row.name}</li>
        ))}
      </ul>
    </>
  );
}
describe("Pagination", () => {
  it("pages filtered records without changing totals and resets after search and sorting", () => {
    render(<FilteredList />);
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Record 13");
    expect(screen.getByLabelText("Matching total")).toHaveTextContent("465");
    fireEvent.change(screen.getByLabelText("Search test records"), {
      target: { value: "Record 30" },
    });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByLabelText("Matching total")).toHaveTextContent("30");
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "highest" } });
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Record 30");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Per page"), { target: { value: "24" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(24);
  });
  it("clamps the page after deletions and hides navigation for short lists", () => {
    const view = render(<List count={30} />);
    fireEvent.click(screen.getByRole("button", { name: "Last page" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    view.rerender(<List count={14} />);
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    view.rerender(<List count={0} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    view.rerender(<List count={30} />);
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Record 01");
  });
  it("sorts the entire table before selecting the page", () => {
    render(<DataTable columns={[{ accessorKey: "amount", header: "Amount" }]} data={records} />);
    expect(screen.getAllByRole("row")).toHaveLength(13);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: /Amount/ }));
    expect(screen.getAllByRole("cell")[0]).toHaveTextContent("30");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });
});
