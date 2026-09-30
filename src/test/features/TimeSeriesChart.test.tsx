import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { chartScale, datePosition, smoothPath } from "@/components/charts/chartMath";

const points = [
  { key: "2026-09-01", values: { received: 100000, spent: 50000 } },
  { key: "2026-09-10", values: { received: 150000, spent: 20000 } },
  { key: "2026-09-28", values: { received: 200000, spent: 90000 } },
];
const series = [
  { key: "received", label: "Received", color: "blue" },
  { key: "spent", label: "Spent", color: "orange" },
];
describe("shared charts", () => {
  it("shows exact amounts, supports keyboard inspection, and changes chart type", () => {
    render(<TimeSeriesChart points={points} series={series} ariaLabel="Line chart. Activity" />);
    const plot = screen.getByRole("group", { name: /Explore chart/ });
    const readout = within(screen.getByRole("status", { name: "Selected chart values" }));
    expect(readout.getByText("Rs 200,000")).toBeInTheDocument();
    fireEvent.keyDown(plot, { key: "ArrowLeft" });
    expect(readout.getByText("Rs 150,000")).toBeInTheDocument();
    fireEvent.keyDown(plot, { key: "Home" });
    expect(readout.getByText("Rs 100,000")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show bar chart" }));
    expect(screen.getByRole("img", { name: "Bar chart. Activity" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Spent" }));
    expect(screen.getByRole("button", { name: "Received" })).toBeDisabled();
    fireEvent.click(screen.getByText(/View chart data/));
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).queryByRole("columnheader", { name: "Spent" })).not.toBeInTheDocument();
  });
  it("handles zero values and a single date without an invented trend", () => {
    render(
      <TimeSeriesChart
        points={[{ key: "2026-09-01", values: { received: 0 } }]}
        series={[series[0]]}
        ariaLabel="Zero activity"
      />,
    );
    expect(screen.getByText(/One recorded date/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Zero activity" }).innerHTML).not.toMatch(
      /NaN|Infinity/,
    );
    expect(screen.getByRole("button", { name: "Previous chart date" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next chart date" })).toBeDisabled();
  });
  it("includes all amounts in rounded scales and spaces dates by elapsed time", () => {
    for (const values of [[0], [10, 500000], [-5000, 500], [1, 2]]) {
      const axis = chartScale(values);
      expect(axis.min).toBeLessThanOrEqual(Math.min(...values));
      expect(axis.max).toBeGreaterThanOrEqual(Math.max(...values));
      expect(axis.max).toBeGreaterThan(axis.min);
      expect(axis.ticks).toContain(0);
    }
    expect(datePosition("2026-09-28") - datePosition("2026-09-10")).toBe(
      2 * (datePosition("2026-09-10") - datePosition("2026-09-01")),
    );
  });
  it("keeps the smooth curve inside each pair of recorded values", () => {
    const data = [
      { x: 0, y: 0 },
      { x: 10, y: 100 },
      { x: 30, y: 101 },
      { x: 80, y: 20 },
    ];
    const path = smoothPath(data);
    const parts = path.split(" C ").slice(1);
    parts.forEach((part, index) => {
      const numbers = part.replace(/,/g, "").split(" ").map(Number);
      const start = data[index].y,
        end = data[index + 1].y;
      for (let step = 0; step <= 20; step++) {
        const t = step / 20;
        const value =
          (1 - t) ** 3 * start +
          3 * (1 - t) ** 2 * t * numbers[1] +
          3 * (1 - t) * t * t * numbers[3] +
          t ** 3 * end;
        expect(value).toBeGreaterThanOrEqual(Math.min(start, end) - 0.00001);
        expect(value).toBeLessThanOrEqual(Math.max(start, end) + 0.00001);
      }
    });
  });
});
