import { describe, it, expect } from "vitest";
import { filePathFromAppVideoUrl, toAppVideoUrl } from "@/lib/app-video-url";

describe("app-video-url", () => {
  it("round-trips Unix paths via the local host", () => {
    const videoPath = "/Users/test/video.mp4";
    expect(filePathFromAppVideoUrl(toAppVideoUrl(videoPath))).toBe(videoPath);
  });

  it("recovers paths when Chromium mis-parses the hostname", () => {
    if (process.platform === "win32") return;
    const requestUrl = "app-video://users/test/video.mp4";
    expect(filePathFromAppVideoUrl(requestUrl)).toBe("/users/test/video.mp4");
  });
});
