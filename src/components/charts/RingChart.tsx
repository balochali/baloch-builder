import { useState } from "react";

export function RingChart({
  segments,
  value,
  label,
  ariaLabel,
}: {
  segments: { label: string; value: number; color: string; display?: string }[];
  value: string | number;
  label: string;
  ariaLabel: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const total = segments.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  const circumference = 2 * Math.PI * 82;
  return (
    <div className="viz-ring">
      <svg viewBox="0 0 220 220" role="img" aria-label={ariaLabel}>
        <circle cx="110" cy="110" r="82" fill="none" stroke="var(--muted)" strokeWidth="22" />
        {segments.map((item, index) => {
          const length = total ? (Math.max(0, item.value) / total) * circumference : 0;
          const start = total
            ? (segments
                .slice(0, index)
                .reduce((sum, segment) => sum + Math.max(0, segment.value), 0) /
                total) *
              circumference
            : 0;
          return length > 0 ? (
            <circle
              key={`${item.label}-${index}`}
              cx="110"
              cy="110"
              r="82"
              fill="none"
              stroke={item.color}
              strokeWidth={hovered === index ? 26 : 22}
              strokeDasharray={`${Math.max(0, length - Math.min(3, length * 0.08))} ${circumference}`}
              strokeDashoffset={-start}
              transform="rotate(-90 110 110)"
              onPointerEnter={() => setHovered(index)}
              onPointerLeave={() => setHovered(null)}
            >
              <title>
                {item.label}: {item.display || item.value.toLocaleString()} (
                {total ? ((item.value / total) * 100).toFixed(1) : 0}%)
              </title>
            </circle>
          ) : null;
        })}
        <text x="110" y="109" textAnchor="middle" className="viz-ring-value">
          {value}
        </text>
        <text x="110" y="132" textAnchor="middle" className="viz-ring-label">
          {label}
        </text>
      </svg>
      <span className="viz-ring-hint">
        {hovered !== null && segments[hovered]
          ? `${segments[hovered].label} · ${segments[hovered].display || segments[hovered].value.toLocaleString()}`
          : "Hover a segment for details"}
      </span>
    </div>
  );
}
