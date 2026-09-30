export type XY = { x: number; y: number };

/** Rounded axis bounds with zero included; never clip real values. */
export function chartScale(values: number[]) {
  const low = Math.min(0, ...values);
  const high = Math.max(1, ...values);
  const rawStep = (high - low) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].find((n) => n * magnitude >= rawStep)! * magnitude;
  const min = Math.floor(low / step) * step;
  const max = Math.ceil(high / step) * step;
  return {
    min,
    max,
    ticks: Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => min + i * step),
  };
}

/** Monotone cubic interpolation: smooth between recorded points without overshoot. */
export function smoothPath(points: XY[]) {
  if (!points.length) return "";
  const slopes = points
    .slice(1)
    .map((point, i) => (point.y - points[i].y) / (point.x - points[i].x || 1));
  const tangents = points.map((_, i) =>
    i === 0
      ? slopes[0] || 0
      : i === points.length - 1
        ? slopes[i - 1]
        : slopes[i - 1] * slopes[i] <= 0
          ? 0
          : 2 / (1 / slopes[i - 1] + 1 / slopes[i]),
  );
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1],
      point = points[i],
      dx = (point.x - previous.x) / 3;
    path += ` C ${previous.x + dx} ${previous.y + tangents[i - 1] * dx}, ${point.x - dx} ${point.y - tangents[i] * dx}, ${point.x} ${point.y}`;
  }
  return path;
}

export function datePosition(key: string) {
  return Date.parse(
    `${key.length === 4 ? `${key}-01-01` : key.length === 7 ? `${key}-01` : key}T00:00:00Z`,
  );
}

export function chartDate(key: string) {
  const date = new Date(datePosition(key));
  if (!Number.isFinite(date.getTime())) return key;
  return date.toLocaleDateString(
    "en-GB",
    key.length === 4
      ? { year: "numeric", timeZone: "UTC" }
      : key.length === 7
        ? { month: "short", year: "2-digit", timeZone: "UTC" }
        : { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" },
  );
}

export function compactAxis(value: number) {
  const abs = Math.abs(value);
  const number = (n: number) => Number(n.toFixed(2)).toLocaleString("en-PK");
  return abs >= 10_000_000
    ? `${number(value / 10_000_000)} cr`
    : abs >= 100_000
      ? `${number(value / 100_000)} L`
      : abs >= 1000
        ? `${number(value / 1000)}k`
        : number(value);
}
