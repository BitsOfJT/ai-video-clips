import { describe, expect, it } from "vitest";
import { filePathFromAppVideoUrl, toAppVideoUrl } from "@/renderer/lib/app-video-url";

describe("toAppVideoUrl", () => {
  it("builds a URL whose pathname round-trips to the original absolute path", () => {
    const videoPath = "/Users/test/My Video.mp4";
    const url = toAppVideoUrl(videoPath);
    expect(url.startsWith("app-video://local")).toBe(true);
    expect(filePathFromAppVideoUrl(url)).toBe(videoPath);
  });

  it("recovers paths when Chromium splits the first path segment into the hostname", () => {
    const misParsed = "app-video://users/jordanthompson/Desktop/Tobi's%20Adventure.mov";
    expect(filePathFromAppVideoUrl(misParsed)).toBe(
      "/users/jordanthompson/Desktop/Tobi's Adventure.mov"
    );
  });
});
