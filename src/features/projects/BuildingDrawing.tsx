export function BuildingDrawing({ variant = 0 }: { variant?: number }) {
  return (
    <svg viewBox="0 0 320 180" fill="none" aria-hidden="true" className="project-building-drawing">
      <path
        d="M15 154H305M28 162H292M35 35H285M40 25V163M280 25V163"
        stroke="currentColor"
        opacity=".14"
      />
      <g stroke="currentColor" strokeWidth="1.3">
        <path
          d={
            variant % 2
              ? "M95 154V47L165 30L225 48V154M165 30V154M95 47L165 64L225 48"
              : "M85 154V65L150 44L230 65V154M150 44V154M85 65L150 85L230 65"
          }
        />
        {[0, 1, 2, 3].map((row) => (
          <g key={row} opacity={0.8 - row * 0.1}>
            <path
              d={`M104 ${83 + row * 15}L134 ${92 + row * 15}M178 ${78 + row * 17}L213 ${69 + row * 17}`}
            />
          </g>
        ))}
        <path d="M116 154V132L134 137V154M174 154V130L194 124V154M60 154V114H84M230 103H253V154" />
        <path d="M59 39V93M49 48H123M65 39L102 48M113 49V65" opacity=".55" />
      </g>
      <circle cx="256" cy="38" r="15" stroke="currentColor" opacity=".25" />
    </svg>
  );
}
