export function ProjectFigures({ labels }: { labels: readonly string[] }) {
  return (
    <dl className="project-figures">
      {labels.map((label) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>—</dd>
        </div>
      ))}
    </dl>
  );
}
