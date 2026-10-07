import { describe, expect, it, vi } from "vitest";
import {
  emptyProgress,
  loadProgress,
  parseProgress,
  STORAGE_KEY,
} from "./progress";

describe("versioned local learning data", () => {
  it.each([
    null,
    "",
    "garbage",
    "null",
    "[]",
    '{"version":2}',
    '{"version":1,"completed":true}',
  ])("safely normalizes %s", (raw) => {
    expect(parseProgress(raw)).toEqual(emptyProgress());
  });
  it("round-trips progress and notes", () => {
    const progress = {
      version: 1,
      completed: ["odds", "outs"],
      notes: { odds: "Price the final pot." },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    expect(loadProgress()).toEqual({ progress, available: true });
  });
  it("deduplicates IDs and filters corrupt data", () => {
    expect(
      parseProgress(
        JSON.stringify({
          version: 1,
          completed: ["odds", "odds", "unknown", 4],
          notes: { odds: "Valid", outs: 3, unknown: "Invalid" },
        }),
      ),
    ).toEqual({ version: 1, completed: ["odds"], notes: { odds: "Valid" } });
  });
  it("caps stored note lengths", () => {
    expect(
      parseProgress(
        JSON.stringify({ version: 1, notes: { odds: "a".repeat(11000) } }),
      ).notes.odds,
    ).toHaveLength(10000);
  });
  it("keeps learning available when storage access is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    expect(loadProgress()).toEqual({
      progress: emptyProgress(),
      available: false,
    });
  });
});
