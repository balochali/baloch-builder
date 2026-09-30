import { useEffect, useId, useRef, useState } from "react";
import { ChartColumn, ChartSpline, ChevronLeft, ChevronRight, Table2 } from "lucide-react";
import { formatPKR } from "@/domain/money";
import { chartDate, chartScale, compactAxis, datePosition, smoothPath } from "./chartMath";

export type ChartSeries = { key: string; label: string; color: string };
export type ChartPoint = { key: string; label?: string; values: Record<string, number> };
export const chartColors = {
  blue: "#3986e8",
  green: "#19aa82",
  coral: "#ed745f",
  gold: "#e6ac43",
  purple: "#9473d8",
};

export function TimeSeriesChart({
  points,
  series,
  ariaLabel,
  defaultMode = "line",
  pointLabel,
  caption,
}: {
  points: ChartPoint[];
  series: ChartSeries[];
  ariaLabel: string;
  defaultMode?: "line" | "bar";
  pointLabel?: (point: ChartPoint) => string;
  caption?: string;
}) {
  const [mode, setMode] = useState(defaultMode);
  const [hidden, setHidden] = useState<string[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [width, setWidth] = useState(640);
  const container = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, "");
  useEffect(() => {
    if (!container.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(280, entry.contentRect.width)),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const visibleSeries = series.filter((item) => !hidden.includes(item.key));
  const rows = [...points].sort((a, b) => a.key.localeCompare(b.key));
  const foundIndex = rows.findIndex((point) => point.key === selectedKey);
  const selectedIndex = foundIndex >= 0 ? foundIndex : rows.length - 1;
  const selected = rows.find((point) => point.key === selectedKey) ?? rows[rows.length - 1];
  const values = rows.flatMap((point) => visibleSeries.map((item) => point.values[item.key] ?? 0));
  const { min, max, ticks } = chartScale(values);
  const height = 300,
    left = width < 420 ? 52 : 66,
    right = 24,
    top = 24,
    bottom = 54;
  const plotWidth = width - left - right,
    plotHeight = height - top - bottom;
  const dates = rows.map((point) => datePosition(point.key));
  const start = dates[0] || 0,
    end = dates[dates.length - 1] || 0;
  const x = (i: number) =>
    rows.length <= 1
      ? left + plotWidth / 2
      : left + 12 + ((dates[i] - start) / (end - start || 1)) * (plotWidth - 24);
  const y = (value: number) => top + ((max - value) / (max - min)) * plotHeight;
  const tickStep = Math.max(
    1,
    Math.ceil((rows.length - 1) / Math.max(1, Math.floor(plotWidth / 100))),
  );
  const minSpacing = Math.min(plotWidth, ...rows.slice(1).map((_, i) => x(i + 1) - x(i)));
  const barWidth = Math.max(
    1,
    Math.min(26, (minSpacing * 0.7) / Math.max(1, visibleSeries.length)),
  );
  function move(direction: number) {
    const current = selectedKey ? selectedIndex : rows.length - 1;
    setSelectedKey(rows[Math.max(0, Math.min(rows.length - 1, current + direction))]?.key ?? null);
  }
  if (!rows.length)
    return <div className="viz-empty">No records in this selection. Try another date range.</div>;
  return (
    <div className="time-series-chart" ref={container}>
      <div className="viz-toolbar">
        <div className="viz-series" aria-label="Chart series">
          {series.map((item) => (
            <button
              type="button"
              key={item.key}
              aria-pressed={!hidden.includes(item.key)}
              disabled={visibleSeries.length === 1 && !hidden.includes(item.key)}
              onClick={() =>
                setHidden((current) =>
                  current.includes(item.key)
                    ? current.filter((key) => key !== item.key)
                    : [...current, item.key],
                )
              }
            >
              <i style={{ background: item.color }} />
              {item.label}
            </button>
          ))}
        </div>
        <div className="viz-mode" role="group" aria-label="Chart display">
          <button
            type="button"
            aria-label="Show line chart"
            aria-pressed={mode === "line"}
            onClick={() => setMode("line")}
          >
            <ChartSpline size={15} />
            Line
          </button>
          <button
            type="button"
            aria-label="Show bar chart"
            aria-pressed={mode === "bar"}
            onClick={() => setMode("bar")}
          >
            <ChartColumn size={15} />
            Bars
          </button>
        </div>
      </div>
      <div
        className="viz-plot"
        tabIndex={0}
        role="group"
        aria-label="Explore chart. Use left and right arrow keys to inspect dates."
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            move(event.key === "ArrowLeft" ? -1 : 1);
          }
          if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            setSelectedKey(rows[event.key === "Home" ? 0 : rows.length - 1].key);
          }
        }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel.replace(
            /^(Line|Bar) chart/,
            mode === "line" ? "Line chart" : "Bar chart",
          )}
        >
          <defs>
            {visibleSeries.map((item) => (
              <linearGradient key={item.key} id={`${id}-${item.key}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={item.color} stopOpacity=".16" />
                <stop offset="1" stopColor={item.color} stopOpacity=".01" />
              </linearGradient>
            ))}
          </defs>
          <text x={left - 10} y={12} textAnchor="end" className="viz-unit">
            Rs
          </text>
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={left}
                x2={width - right}
                y1={y(tick)}
                y2={y(tick)}
                className={tick === 0 ? "viz-baseline" : "viz-gridline"}
              />
              <text x={left - 10} y={y(tick) + 4} textAnchor="end" className="viz-tick">
                {compactAxis(tick)}
              </text>
            </g>
          ))}
          {rows.map(
            (point, i) =>
              ((i % tickStep === 0 && i < rows.length - 1 - tickStep / 2) ||
                i === rows.length - 1) && (
                <text
                  key={point.key}
                  x={x(i)}
                  y={height - 22}
                  textAnchor={i === 0 ? "start" : i === rows.length - 1 ? "end" : "middle"}
                  className="viz-tick"
                >
                  {point.label || chartDate(point.key)}
                </text>
              ),
          )}
          {mode === "line" &&
            visibleSeries.map((item, si) => {
              const coordinates = rows.map((point, i) => ({
                x: x(i),
                y: y(point.values[item.key] ?? 0),
              }));
              const path = smoothPath(coordinates);
              return (
                <g key={item.key}>
                  {visibleSeries.length === 1 && rows.length > 1 && (
                    <path
                      d={`${path} L ${x(rows.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`}
                      fill={`url(#${id}-${item.key})`}
                    />
                  )}
                  <path
                    d={path}
                    fill="none"
                    stroke={item.color}
                    strokeWidth="2.8"
                    strokeDasharray={si % 2 ? "7 4" : undefined}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {coordinates.map((point, i) => (
                    <circle
                      key={rows[i].key}
                      cx={point.x}
                      cy={point.y}
                      r={selected?.key === rows[i].key ? 5 : 3.3}
                      fill="var(--card)"
                      stroke={item.color}
                      strokeWidth="2"
                    />
                  ))}
                </g>
              );
            })}
          {mode === "bar" &&
            rows.map((point, i) => (
              <g
                key={point.key}
                role={pointLabel ? "img" : undefined}
                aria-label={pointLabel?.(point)}
              >
                {visibleSeries.map((item, si) => (
                  <rect
                    key={item.key}
                    x={x(i) - (visibleSeries.length * barWidth) / 2 + si * barWidth}
                    y={Math.min(y(0), y(point.values[item.key] ?? 0))}
                    width={Math.max(0.5, barWidth - 3)}
                    height={Math.abs(y(0) - y(point.values[item.key] ?? 0))}
                    rx="3"
                    fill={item.color}
                    opacity={selected?.key === point.key ? 1 : 0.8}
                  />
                ))}
              </g>
            ))}
          {selected && (
            <line
              x1={x(rows.indexOf(selected))}
              x2={x(rows.indexOf(selected))}
              y1={top}
              y2={height - bottom}
              className="viz-crosshair"
            />
          )}
          {rows.map((point, i) => (
            <rect
              key={point.key}
              x={i === 0 ? left : (x(i - 1) + x(i)) / 2}
              y={top}
              width={
                (i === rows.length - 1 ? width - right : (x(i) + x(i + 1)) / 2) -
                (i === 0 ? left : (x(i - 1) + x(i)) / 2)
              }
              height={plotHeight}
              fill="transparent"
              onPointerEnter={() => setSelectedKey(point.key)}
              onClick={() => setSelectedKey(point.key)}
            >
              <title>
                {point.label || chartDate(point.key)}
                {visibleSeries
                  .map((item) => ` · ${item.label}: ${formatPKR(point.values[item.key] ?? 0)}`)
                  .join("")}
              </title>
            </rect>
          ))}
        </svg>
      </div>
      {selected && (
        <div
          className="viz-readout"
          role="status"
          aria-label="Selected chart values"
          aria-live="polite"
        >
          <div>
            <button
              type="button"
              aria-label="Previous chart date"
              disabled={selected === rows[0]}
              onClick={() => move(-1)}
            >
              <ChevronLeft size={16} />
            </button>
            <strong>{selected.label || chartDate(selected.key)}</strong>
            <button
              type="button"
              aria-label="Next chart date"
              disabled={selected === rows[rows.length - 1]}
              onClick={() => move(1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          {visibleSeries.map((item) => (
            <span key={item.key}>
              <i style={{ background: item.color }} />
              <span>
                {item.label}
                <strong>{formatPKR(selected.values[item.key] ?? 0)}</strong>
              </span>
            </span>
          ))}
        </div>
      )}
      <div className="viz-footnote">
        <span>
          {caption || "Hover, tap, or use arrow keys to see exact amounts."}
          {rows.length === 1 ? " One recorded date; more dates are needed to show a trend." : ""}
        </span>
        <span>k = thousand · L = lakh · cr = crore</span>
      </div>
      <details className="viz-data">
        <summary>
          <Table2 size={14} />
          View chart data ({rows.length} dates)
        </summary>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                {visibleSeries.map((item) => (
                  <th key={item.key}>{item.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((point) => (
                <tr key={point.key}>
                  <td>{point.label || chartDate(point.key)}</td>
                  {visibleSeries.map((item) => (
                    <td key={item.key}>{formatPKR(point.values[item.key] ?? 0)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
