import { useEffect, useRef, useState } from "react";
import type { FeasibilityData } from "@baloch/shared";
import { api } from "@/data/api";
import { defaultFeasibility } from "./feasibilityCalc";

export function useFeasibility(id: string) {
  const endpoint = `projects/${id}/feasibility`;
  const [plan, setPlan] = useState<FeasibilityData>();
  const [status, setStatus] = useState("Loading�");
  const [error, setError] = useState("");
  const [locking, setLocking] = useState(false);
  const current = useRef<FeasibilityData | undefined>(undefined);
  const revision = useRef<string | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queue = useRef(Promise.resolve());
  const locked = useRef(false);
  const mounted = useRef(false);

  function flush(action: "save" | "approve" | "unlock" = "save") {
    clearTimeout(timer.current);
    const snapshot = current.current;
    if (!snapshot || (action === "save" && !dirty.current)) return queue.current;
    dirty.current = false;
    queue.current = queue.current.then(async () => {
      if (mounted.current) {
        setStatus("Saving�");
        setError("");
      }
      try {
        const saved = await api<FeasibilityData>(endpoint, "PUT", {
          plan: snapshot,
          action,
          revision: revision.current,
        });
        revision.current = saved.updatedAt;
        if (action !== "save" || current.current === snapshot) {
          current.current = saved;
          if (mounted.current) {
            setPlan(saved);
            setStatus("Saved");
          }
        }
      } catch (cause) {
        dirty.current = true;
        if (mounted.current) {
          setStatus("Not saved");
          setError(String(cause));
        }
      }
    });
    return queue.current;
  }
  const cleanup = useRef(flush);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    api<FeasibilityData | null>(endpoint)
      .then((saved) => {
        if (!active) return;
        const data = saved ?? defaultFeasibility();
        current.current = data;
        revision.current = data.updatedAt;
        setPlan(data);
        setStatus(saved ? "Saved" : "Draft");
      })
      .catch((cause) => {
        if (active) {
          setStatus("Unavailable");
          setError(String(cause));
        }
      });
    const save = cleanup.current;
    return () => {
      active = false;
      mounted.current = false;
      void save();
    };
  }, [endpoint]);
  function update(change: (plan: FeasibilityData) => FeasibilityData) {
    if (!current.current || current.current.status === "approved" || locked.current) return;
    const next = change(current.current);
    current.current = next;
    dirty.current = true;
    setPlan(next);
    setStatus("Unsaved");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 550);
  }
  async function toggle() {
    if (locked.current || !current.current) return;
    locked.current = true;
    setLocking(true);
    await flush(current.current.status === "approved" ? "unlock" : "approve");
    locked.current = false;
    if (mounted.current) setLocking(false);
  }
  return { plan, status, error, locking, update, toggle, retry: () => void flush() };
}
