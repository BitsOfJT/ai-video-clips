/** Build a safe app-video:// URL for an absolute filesystem path. */
export function toAppVideoUrl(videoPath: string): string {
  // Use a fixed host so Chromium does not treat the first path segment (e.g. "Users")
  // as the URL hostname when serving Unix absolute paths.
  return `app-video://local${encodeURI(videoPath)}`;
}

/** Recover the absolute filesystem path from an app-video:// request URL. */
export function filePathFromAppVideoUrl(requestUrl: string): string {
  const parsed = new URL(requestUrl);

  if (parsed.hostname === "local") {
    return decodeURIComponent(parsed.pathname);
  }

  // Chromium mis-parses app-video:///Users/... as host "users" + path "/jordanthompson/...".
  if (parsed.hostname && process.platform !== "win32") {
    return decodeURIComponent(`/${parsed.hostname}${parsed.pathname}`);
  }

  return decodeURIComponent(parsed.pathname);
}
