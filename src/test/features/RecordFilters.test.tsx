import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRecordFilters } from "@/components/RecordFilters";

const rows = [
  { name: "Alpha", date: "2026-09-01", amount: 100, status: "Open" },
  { name: "Beta", date: "2026-09-30", amount: 300, status: "Open" },
  { name: "Gamma", date: null, amount: 200, status: "Closed" },
];
function Harness() {
  const { visible, controls } = useRecordFilters(rows, {
    label: "records",
    searchText: (row) => row.name,
    date: (row) => row.date,
    amount: (row) => row.amount,
    facets: [{ label: "Status", value: (row) => row.status }],
  });
  return (
    <>
      {controls}
      <ul>
        {visible.map((row) => (
          <li key={row.name}>{row.name}</li>
        ))}
      </ul>
    </>
  );
}
describe("record filters", () => {
  it("intersects text, facet, inclusive date and amount filters, then resets everything", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Search records"), { target: { value: "  BETA " } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "Open" } });
    fireEvent.change(screen.getByLabelText("Date from"), { target: { value: "2026-09-30" } });
    fireEvent.change(screen.getByLabelText("Date to"), { target: { value: "2026-09-30" } });
    fireEvent.change(screen.getByLabelText("Min amount (Rs)"), { target: { value: "300" } });
    fireEvent.change(screen.getByLabelText("Max amount (Rs)"), { target: { value: "300" } });
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Beta"]);
    expect(screen.getByRole("status")).toHaveTextContent("1 of 3 records shown");
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByLabelText("Date from")).toHaveValue("");
    expect(screen.getByLabelText("Min amount (Rs)")).toHaveValue(null);
    expect(screen.getByRole("button", { name: "Reset filters" })).toBeDisabled();
  });
  it("excludes undated records when a date bound is set and explains reversed ranges", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Date from"), { target: { value: "2026-09-01" } });
    expect(screen.queryByText("Gamma")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Date to"), { target: { value: "2026-08-31" } });
    expect(screen.getByRole("status")).toHaveTextContent("Check your range");
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
  it("sorts by numeric amount without changing the source and keeps missing dates last", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "highest" } });
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Beta",
      "Gamma",
      "Alpha",
    ]);
    expect(rows.map((row) => row.name)).toEqual(["Alpha", "Beta", "Gamma"]);
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "oldest" } });
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
    ]);
    fireEvent.change(screen.getByLabelText("Min amount (Rs)"), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText("Max amount (Rs)"), { target: { value: "100" } });
    expect(screen.getByRole("status")).toHaveTextContent("Check your range");
  });
});
