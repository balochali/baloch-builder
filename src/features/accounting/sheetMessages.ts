export function entryError(error: unknown): string {
  if (error && typeof error === "object" && "issues" in error && Array.isArray(error.issues)) {
    return error.issues
      .slice(0, 2)
      .map((issue: unknown) => {
        if (!issue || typeof issue !== "object") return "Check this entry";
        const path = "path" in issue && Array.isArray(issue.path) ? issue.path.join(" ") : "";
        const message = "message" in issue ? String(issue.message) : "Check this entry";
        return (path ? path.replace(/_/g, " ") + ": " : "") + message;
      })
      .join("; ");
  }
  return (error instanceof Error ? error.message : String(error)).slice(0, 240);
}
