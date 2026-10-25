import { useId } from "react";
import type { CustomCellEditorProps } from "ag-grid-react";
export function SearchSelectEditor({
  value,
  onValueChange,
  choices = [],
}: { choices?: { value: string; label: string }[] } & CustomCellEditorProps) {
  const id = useId();
  return (
    <>
      <input
        autoFocus
        aria-label="Search selection"
        list={id}
        value={String(value ?? "")}
        onChange={(e) => onValueChange(e.target.value)}
      />
      <datalist id={id}>
        {choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </datalist>
    </>
  );
}
