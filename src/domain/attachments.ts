export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export function attachmentAccept(allowPdf = false): string {
  return [...IMAGE_TYPES, ...(allowPdf ? ["application/pdf"] : [])].join(",");
}
export function validateAttachment(file: Pick<File, "type" | "size">, allowPdf = false): void {
  if (
    !(IMAGE_TYPES as readonly string[]).includes(file.type) &&
    !(allowPdf && file.type === "application/pdf")
  )
    throw new Error(`Choose JPEG, PNG, WebP or GIF${allowPdf ? " or PDF" : ""} files up to 10 MB.`);
  if (!file.size || file.size > MAX_ATTACHMENT_BYTES)
    throw new Error("Choose a non-empty file up to 10 MB.");
}
