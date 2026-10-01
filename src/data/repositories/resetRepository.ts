import { execute } from "@/data/client";
export async function resetBusinessData(): Promise<void> {
  await execute("INSERT INTO business_reset_requests (id) VALUES (1)");
}
