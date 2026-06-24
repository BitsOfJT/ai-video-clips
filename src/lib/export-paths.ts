/** Strip characters unsafe for cross-platform filenames. */
export function sanitizeExportFilename(title: string): string {
  const cleaned = title
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || "clip";
}

/** Pick a unique .mp4 filename within a batch export (case-insensitive dedupe). */
export function uniqueMp4Filename(title: string, usedNames: Set<string>): string {
  const base = sanitizeExportFilename(title);
  let name = `${base}.mp4`;
  let suffix = 2;
  while (usedNames.has(name.toLowerCase())) {
    name = `${base}-${suffix}.mp4`;
    suffix += 1;
  }
  usedNames.add(name.toLowerCase());
  return name;
}
