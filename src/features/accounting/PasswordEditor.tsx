import type { CustomCellEditorProps } from "ag-grid-react";
export function PasswordEditor({ value, onValueChange }: CustomCellEditorProps) {
  return (
    <input
      type="password"
      autoFocus
      aria-label="Password"
      value={value ?? ""}
      onChange={(e) => onValueChange(e.target.value)}
    />
  );
}
