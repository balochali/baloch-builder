import { useEffect, useId, useRef, useState } from "react";
import { ChartColumn, ChartSpline, ChevronLeft, ChevronRight, Table2 } from "lucide-react";
import { formatPKR } from "@/domain/money";
import { chartDate, chartScale, compactAxis, datePosition, smoothPath } from "./chartMath";

export type ChartSeries = { key: string; label: string; color: string };
export type ChartPoint = { key: string; label?: string; values: Record<string, number> };
export const chartColors = {
  blue: "#3b82f6",
  green: "#10b981",
  coral: "#f43f5e",
  gold: "#f59e0b",
  purple: "#8b5cf6",
};

export function TimeSeriesChart({
  points,
  series,
  ariaLabel,
  defaultMode = "line",
  pointLabel,
  caption,
  axisLabel,
  fillWidth = false,
}: {
  points: ChartPoint[];
  series: ChartSeries[];
  ariaLabel: string;
  defaultMode?: "line" | "bar";
  pointLabel?: (point: ChartPoint) => string;
  caption?: string;
  axisLabel?: (point: ChartPoint) => string;
  fillWidth?: boolean;
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
      setWidth(Math.max(260, entry.contentRect.width)),
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

  const height = 240;
  const left = width < 380 ? 46 : 56;
  const right = 20;
  const top = 18;
  const bottom = 44;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const dates = rows.map((point) => datePosition(point.key));
  const start = dates[0] || 0;
  const end = dates[dates.length - 1] || 0;

  // Spacing calculation: Prevents bars from spreading too far when there are few data points (1, 2, etc.)
  // While smoothly scaling to full width when there are many data points.
  const availableWidth = plotWidth - 48;
  const targetSpacing = mode === "bar" ? 84 : 96;
  const desiredSpan =
    rows.length <= 1
      ? 0
      : fillWidth
        ? availableWidth
        : Math.min(availableWidth, Math.max(64, (rows.length - 1) * targetSpacing));
  const startX = left + 24 + (availableWidth - desiredSpan) / 2;

  const timeRatio = (i: number) => {
    if (rows.length <= 1) return 0.5;
    if (end <= start) return i / (rows.length - 1);
    // Bar charts use discrete category spacing for balanced bars
    if (mode === "bar") return i / (rows.length - 1);
    // Line charts with varied dates can reflect time ratio if desired, or smooth index
    const t = (dates[i] - start) / (end - start);
    return Number.isFinite(t) ? t : i / (rows.length - 1);
  };

  const x = (i: number) =>
    rows.length <= 1 ? left + plotWidth / 2 : startX + timeRatio(i) * desiredSpan;

  const y = (value: number) => top + ((max - value) / (max - min || 1)) * plotHeight;

  // Dates can cluster even when there are only a few points. Reserve the last
  // label, then fit earlier labels using their actual positions and text width.
  const tickLabels = rows.map((point) => axisLabel?.(point) ?? point.label ?? chartDate(point.key));
  const labelHalfWidth = (i: number) => tickLabels[i].length * 3.5;
  const visibleTicks = new Set<number>();
  const last = rows.length - 1;
  let previousRight = -Infinity;
  for (let i = 0; i < last; i++) {
    const labelLeft = x(i) - labelHalfWidth(i);
    const labelRight = x(i) + labelHalfWidth(i);
    if (labelLeft >= previousRight + 12 && labelRight + 12 <= x(last) - labelHalfWidth(last)) {
      visibleTicks.add(i);
      previousRight = labelRight;
    }
  }
  if (last >= 0) visibleTicks.add(last);

  // Bar sizing calculation
  const spacing =
    rows.length <= 1 ? 84 : Math.min(...rows.slice(1).map((_, i) => Math.max(16, x(i + 1) - x(i))));

  const numSeries = Math.max(1, visibleSeries.length);
  const maxSingleBarWidth = numSeries === 1 ? 32 : 22;
  const groupAllocation = Math.min(68, spacing * 0.65);
  const barGap = numSeries > 1 ? 3 : 0;
  const barWidth = Math.max(
    4,
    Math.min(maxSingleBarWidth, (groupAllocation - (numSeries - 1) * barGap) / numSeries),
  );
  const totalGroupWidth = numSeries * barWidth + (numSeries - 1) * barGap;

  function move(direction: number) {
    const current = selectedKey ? selectedIndex : rows.length - 1;
    setSelectedKey(rows[Math.max(0, Math.min(rows.length - 1, current + direction))]?.key ?? null);
  }

  if (!rows.length)
    return <div className="viz-empty">No records in this selection. Try another date range.</div>;

  return (
    <div className="time-series-chart" ref={container}>
      {/* Toolbar */}
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
              title={`Toggle ${item.label}`}
            >
              <i style={{ background: item.color }} />
              <span>{item.label}</span>
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
            <ChartSpline size={13} />
            <span>Line</span>
          </button>
          <button
            type="button"
            aria-label="Show bar chart"
            aria-pressed={mode === "bar"}
            onClick={() => setMode("bar")}
          >
            <ChartColumn size={13} />
            <span>Bars</span>
          </button>
        </div>
      </div>

      {/* SVG Plot */}
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
              <linearGradient
                key={`area-${item.key}`}
                id={`${id}-area-${item.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={item.color} stopOpacity="0.30" />
                <stop offset="70%" stopColor={item.color} stopOpacity="0.06" />
                <stop offset="100%" stopColor={item.color} stopOpacity="0.0" />
              </linearGradient>
            ))}
            {visibleSeries.map((item) => (
              <linearGradient
                key={`bar-${item.key}`}
                id={`${id}-bar-${item.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={item.color} stopOpacity="0.95" />
                <stop offset="100%" stopColor={item.color} stopOpacity="0.75" />
              </linearGradient>
            ))}
            <clipPath id={`${id}-clip`}>
              <rect x={left} y={top} width={plotWidth} height={plotHeight} rx="8" />
            </clipPath>
            <filter id={`${id}-glow`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.25" />
            </filter>
          </defs>

          {/* Plot background surface */}
          <rect
            x={left}
            y={top}
            width={plotWidth}
            height={plotHeight}
            rx="8"
            className="viz-plot-bg"
          />

          {/* Y-axis Unit */}
          <text x={left - 8} y={top - 4} textAnchor="end" className="viz-unit">
            Rs
          </text>

          {/* Grid lines + Y ticks */}
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={left}
                x2={left + plotWidth}
                y1={y(tick)}
                y2={y(tick)}
                className={tick === 0 ? "viz-baseline" : "viz-gridline"}
              />
              <text x={left - 8} y={y(tick) + 4} textAnchor="end" className="viz-tick">
                {compactAxis(tick)}
              </text>
            </g>
          ))}

          {/* X-axis date labels */}
          {rows.map((point, i) => {
            if (!visibleTicks.has(i)) return null;
            const isSelected = selected?.key === point.key;
            return (
              <text
                key={point.key}
                x={x(i)}
                y={height - 12}
                textAnchor="middle"
                className={`viz-tick ${isSelected ? "viz-tick-active" : ""}`}
              >
                {tickLabels[i]}
              </text>
            );
          })}

          {/* LINE MODE */}
          {mode === "line" &&
            visibleSeries.map((item, si) => {
              const coordinates = rows.map((point, i) => ({
                x: x(i),
                y: y(point.values[item.key] ?? 0),
              }));
              const path = smoothPath(coordinates);
              return (
                <g key={item.key}>
                  {/* Fill under the curve */}
                  {visibleSeries.length === 1 && rows.length > 1 && (
                    <path
                      d={`${path} L ${x(rows.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`}
                      fill={`url(#${id}-area-${item.key})`}
                      clipPath={`url(#${id}-clip)`}
                    />
                  )}
                  {/* Line stroke */}
                  <path
                    d={path}
                    fill="none"
                    stroke={item.color}
                    strokeWidth="2.5"
                    strokeDasharray={si % 2 ? "6 4" : undefined}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Data points */}
                  {coordinates.map((point, i) => {
                    const isSelected = selected?.key === rows[i].key;
                    return (
                      <g key={rows[i].key}>
                        {isSelected && (
                          <circle cx={point.x} cy={point.y} r={8} fill={item.color} opacity={0.2} />
                        )}
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r={isSelected ? 5.5 : rows.length <= 5 ? 4.5 : 3.5}
                          fill="var(--card)"
                          stroke={item.color}
                          strokeWidth={isSelected ? "2.5" : "2"}
                        />
                      </g>
                    );
                  })}
                </g>
              );
            })}

          {/* BAR MODE */}
          {mode === "bar" &&
            rows.map((point, i) => {
              const isSelected = selected?.key === point.key;
              const groupStartX = x(i) - totalGroupWidth / 2;
              return (
                <g
                  key={point.key}
                  role={pointLabel ? "img" : undefined}
                  aria-label={pointLabel?.(point)}
                  className={`viz-bar-group ${isSelected ? "viz-bar-group-active" : ""}`}
                >
                  {visibleSeries.map((item, si) => {
                    const barX = groupStartX + si * (barWidth + barGap);
                    const val = point.values[item.key] ?? 0;
                    const barTop = Math.min(y(0), y(val));
                    const barH = Math.max(val === 0 ? 0 : 2, Math.abs(y(0) - y(val)));
                    const cornerRadius = Math.min(4, barWidth / 2);
                    return (
                      <rect
                        key={item.key}
                        x={barX}
                        y={barTop}
                        width={barWidth}
                        height={barH}
                        rx={cornerRadius}
                        fill={`url(#${id}-bar-${item.key})`}
                        filter={isSelected ? `url(#${id}-glow)` : undefined}
                        opacity={isSelected ? 1 : 0.72}
                        className="viz-bar"
                      />
                    );
                  })}
                </g>
              );
            })}

          {/* Crosshair indicator */}
          {selected && (
            <line
              x1={x(rows.indexOf(selected))}
              x2={x(rows.indexOf(selected))}
              y1={top}
              y2={top + plotHeight}
              className="viz-crosshair"
            />
          )}

          {/* Transparent hit areas for hover / tap selection */}
          {rows.map((point, i) => {
            const hitW = Math.max(totalGroupWidth + 20, Math.min(spacing, 96));
            return (
              <rect
                key={point.key}
                x={x(i) - hitW / 2}
                y={top}
                width={hitW}
                height={plotHeight}
                fill="transparent"
                style={{ cursor: "pointer" }}
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
            );
          })}
        </svg>
      </div>

      {/* Modern interactive inspection readout */}
      {selected && (
        <div
          className="viz-readout"
          role="status"
          aria-label="Selected chart values"
          aria-live="polite"
        >
          <div className="viz-readout-nav">
            <button
              type="button"
              aria-label="Previous chart date"
              disabled={selected === rows[0]}
              onClick={() => move(-1)}
              title="Previous date (Left arrow)"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="viz-readout-date">{selected.label || chartDate(selected.key)}</span>
            <button
              type="button"
              aria-label="Next chart date"
              disabled={selected === rows[rows.length - 1]}
              onClick={() => move(1)}
              title="Next date (Right arrow)"
            >
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="viz-readout-values">
            {visibleSeries.map((item) => (
              <div key={item.key} className="viz-readout-pill">
                <span className="viz-pill-dot" style={{ backgroundColor: item.color }} />
                <span className="viz-readout-pill-label">{item.label}</span>
                <strong className="viz-readout-pill-val">
                  {formatPKR(selected.values[item.key] ?? 0)}
                </strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footnote */}
      <div className="viz-footnote">
        <span>
          {caption || "Hover or tap to inspect exact amounts."}
          {rows.length === 1 ? " One recorded date; more dates are needed for a trend." : ""}
        </span>
        <span className="viz-footnote-legend">k = thousand · L = lakh · cr = crore</span>
      </div>

      {/* Accessible data table */}
      <details className="viz-data">
        <summary>
          <Table2 size={13} />
          <span>
            View chart data ({rows.length} {rows.length === 1 ? "date" : "dates"})
          </span>
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
