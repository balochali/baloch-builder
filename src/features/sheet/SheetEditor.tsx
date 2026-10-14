import { useEffect, useRef, useState } from "react";
import { Save, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SheetGrid, emptyRow, rowIsBlank, type SheetColumn, type SheetRow } from "./SheetGrid";
import { describeError } from "./sheetParsing";

interface SheetEditorProps {
    /** Unique name; also used to keep unsaved typing if the person leaves the page. */
    id: string;
    title: string;
    help: string;
    columns: SheetColumn[];
    saveLabel: string;
    /** Saves one row. Throw an Error with a plain message when the row is not valid. */
    saveRow: (cells: Record<string, string>) => Promise<void>;
    onSaved?: () => void;
    notice?: string;
}

const draftKey = (id: string) => `bb-sheet-draft-${id}`;
const blankRows = (n = 8) => Array.from({ length: n }, emptyRow);

function loadDraft(id: string): SheetRow[] {
    try {
        const raw = window.localStorage.getItem(draftKey(id));
        if (!raw) return blankRows();
        const parsed = JSON.parse(raw) as SheetRow[];
        if (Array.isArray(parsed) && parsed.length > 0)
            return parsed.map((row) => ({ id: row.id, cells: row.cells ?? {}, error: row.error }));
    } catch {
        /* storage unavailable: start with an empty sheet */
    }
    return blankRows();
}

export function SheetEditor({
    id,
    title,
    help,
    columns,
    saveLabel,
    saveRow,
    onSaved,
    notice,
}: SheetEditorProps) {
    const [rows, setRows] = useState<SheetRow[]>(() => loadDraft(id));
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
    const mounted = useRef(true);
    useEffect(
        () => () => {
            mounted.current = false;
        },
        [],
    );
    useEffect(() => {
        try {
            const keep = rows.some((row) => !rowIsBlank(row));
            if (keep) window.localStorage.setItem(draftKey(id), JSON.stringify(rows));
            else window.localStorage.removeItem(draftKey(id));
        } catch {
            /* ignore */
        }
    }, [id, rows]);

    const filled = rows.filter((row) => !rowIsBlank(row)).length;

    async function saveAll() {
        setSaving(true);
        setMessage(null);
        const failed: SheetRow[] = [];
        let saved = 0;
        for (const row of rows) {
            if (rowIsBlank(row)) continue;
            try {
                await saveRow(row.cells);
                saved += 1;
            } catch (error) {
                failed.push({ ...row, error: describeError(error) });
            }
        }
        if (!mounted.current) return;
        setRows(failed.length ? [...failed, ...blankRows(3)] : blankRows());
        setSaving(false);
        if (saved) onSaved?.();
        if (!saved && !failed.length)
            setMessage({ tone: "bad", text: "Nothing to save yet. Type in a row first." });
        else if (failed.length)
            setMessage({
                tone: "bad",
                text: `${saved} saved. ${failed.length} row${failed.length === 1 ? "" : "s"} need fixing — read the Status column, correct the cell and press Save again.`,
            });
        else
            setMessage({
                tone: "ok",
                text: `${saved} row${saved === 1 ? "" : "s"} saved. They now appear in the normal pages.`,
            });
    }

    return (
        <section className="sheet-panel">
            <div className="sheet-panel-head">
                <div>
                    <h2>{title}</h2>
                    <p>{help}</p>
                </div>
                <div className="sheet-actions">
                    <Button
                        type="button"
                        variant="outline"
                        disabled={saving || filled === 0}
                        onClick={() => {
                            setRows(blankRows());
                            setMessage(null);
                        }}
                    >
                        <Eraser size={15} aria-hidden /> Clear sheet
                    </Button>
                    <Button type="button" disabled={saving || filled === 0} onClick={() => void saveAll()}>
                        <Save size={15} aria-hidden /> {saving ? "Saving…" : saveLabel}
                    </Button>
                </div>
            </div>
            {notice && <p className="sheet-notice">{notice}</p>}
            {message && (
                <p className={`sheet-message is-${message.tone}`} role="status">
                    {message.text}
                </p>
            )}
            <SheetGrid name={id} columns={columns} rows={rows} onRows={setRows} disabled={saving} />
            <p className="sheet-tip">
                Tips: click a cell and type · <kbd>Enter</kbd> goes down · <kbd>Tab</kbd> goes right · copy
                cells in Excel and paste them into the first cell here · dates like 14/10/2026.
            </p>
        </section>
    );
}