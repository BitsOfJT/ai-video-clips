import { describe, expect, it } from "vitest";
import { canInstallUpdate } from "@/renderer/lib/update-helpers";

describe("canInstallUpdate", () => {
  it("returns false when export queue is non-empty", () => {
    expect(
      canInstallUpdate({
        exportQueue: ["clip-1"],
        transcriptionProgress: {},
        analysisProgress: {},
        exportStatus: {},
      }),
    ).toBe(false);
  });

  it("returns false when transcription is in progress", () => {
    expect(
      canInstallUpdate({
        exportQueue: [],
        transcriptionProgress: { "proj-1": 50 },
        analysisProgress: {},
        exportStatus: {},
      }),
    ).toBe(false);
  });

  it("returns false when export is rendering", () => {
    expect(
      canInstallUpdate({
        exportQueue: [],
        transcriptionProgress: {},
        analysisProgress: {},
        exportStatus: { "clip-1": "rendering" },
      }),
    ).toBe(false);
  });

  it("returns true when idle", () => {
    expect(
      canInstallUpdate({
        exportQueue: [],
        transcriptionProgress: {},
        analysisProgress: {},
        exportStatus: { "clip-1": "completed" },
      }),
    ).toBe(true);
  });
});
