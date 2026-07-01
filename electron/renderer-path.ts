import path from "node:path";

/** Absolute path to the Vite-built renderer HTML (production / packaged app). */
export function getProductionRendererHtmlPath(appPath: string): string {
  return path.join(appPath, "dist", "index.html");
}
