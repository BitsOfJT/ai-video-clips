import { describe, expect, it } from "vitest";
import { sanitizeExportFilename, uniqueMp4Filename } from "@/lib/export-paths";

describe("export-paths", () => {
  it("sanitizes unsafe filename characters", () => {
    expect(sanitizeExportFilename('My clip: "best" / take 1')).toBe("My clip- -best- - take 1");
  });

  it("falls back to clip when title is empty after sanitization", () => {
    expect(sanitizeExportFilename("   ")).toBe("clip");
  });

  it("dedupes batch filenames case-insensitively", () => {
    const used = new Set<string>();
    expect(uniqueMp4Filename("Hook", used)).toBe("Hook.mp4");
    expect(uniqueMp4Filename("hook", used)).toBe("hook-2.mp4");
    expect(uniqueMp4Filename("Hook", used)).toBe("Hook-3.mp4");
  });
});
