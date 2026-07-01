import { describe, it, expect } from "vitest";
import path from "node:path";
import { getProductionRendererHtmlPath } from "../../electron/renderer-path";

describe("getProductionRendererHtmlPath", () => {
  it("resolves to dist/index.html under the app root", () => {
    const appPath = "/Applications/AI Video Clipper.app/Contents/Resources/app.asar";
    expect(getProductionRendererHtmlPath(appPath)).toBe(
      path.join(appPath, "dist", "index.html")
    );
  });

  it("uses forward-compatible path joining on Windows-style roots", () => {
    const appPath = "C:\\Program Files\\AI Video Clipper\\resources\\app.asar";
    expect(getProductionRendererHtmlPath(appPath)).toBe(
      path.join(appPath, "dist", "index.html")
    );
  });
});
