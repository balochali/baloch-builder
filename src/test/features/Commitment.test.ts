import { expect, it } from "vitest";
import { commitmentFigures } from "@/features/projects/fundingView";
it("separates extra capital from pending commitment and keeps missing commitments unknown", () => {
  expect(commitmentFigures(100, 120)).toEqual({ pending: 0, extra: 20 });
  expect(commitmentFigures(null, 50)).toEqual({ pending: null, extra: null });
  expect(commitmentFigures(100, 40)).toEqual({ pending: 60, extra: 0 });
});
