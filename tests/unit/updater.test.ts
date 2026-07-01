import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUpdateService, type UpdateService } from "../../electron/updater";

type AutoUpdaterMock = EventEmitter & {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates: ReturnType<typeof vi.fn>;
  downloadUpdate: ReturnType<typeof vi.fn>;
  quitAndInstall: ReturnType<typeof vi.fn>;
};

function createAutoUpdaterMock(): AutoUpdaterMock {
  const mock = new EventEmitter() as AutoUpdaterMock;
  mock.autoDownload = false;
  mock.autoInstallOnAppQuit = false;
  mock.checkForUpdates = vi.fn().mockResolvedValue(undefined);
  mock.downloadUpdate = vi.fn().mockResolvedValue(undefined);
  mock.quitAndInstall = vi.fn();
  return mock;
}

describe("UpdateService", () => {
  let autoUpdater: AutoUpdaterMock;
  let service: UpdateService;
  let openExternal: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    autoUpdater = createAutoUpdaterMock();
    openExternal = vi.fn().mockResolvedValue(undefined);
    service = createUpdateService({
      autoUpdater: autoUpdater as never,
      getVersion: () => "1.0.0",
      isDev: false,
      platform: "win32",
      openExternal,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("no-ops checkForUpdates in dev mode", async () => {
    const devService = createUpdateService({
      autoUpdater: autoUpdater as never,
      getVersion: () => "1.0.0",
      isDev: true,
      platform: "win32",
      openExternal,
    });
    await devService.checkForUpdates({ manual: true });
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(devService.getStatus().state).toBe("idle");
  });

  it("transitions to not-available when update-not-available fires", async () => {
    const checkPromise = service.checkForUpdates({ manual: true });
    autoUpdater.emit("update-not-available");
    await checkPromise;
    expect(service.getStatus().state).toBe("not-available");
    expect(service.getStatus().availableVersion).toBeNull();
  });

  it("transitions to available with version when update-available fires", () => {
    autoUpdater.emit("update-available", { version: "1.0.1" });
    expect(service.getStatus().state).toBe("available");
    expect(service.getStatus().availableVersion).toBe("1.0.1");
  });

  it("reports download progress", () => {
    autoUpdater.emit("download-progress", { percent: 42.7 });
    expect(service.getStatus().state).toBe("downloading");
    expect(service.getStatus().downloadProgress).toBe(43);
  });

  it("transitions to downloaded when update-downloaded fires", () => {
    autoUpdater.emit("update-downloaded", { version: "1.0.1" });
    expect(service.getStatus().state).toBe("downloaded");
    expect(service.getStatus().downloadProgress).toBe(100);
  });

  it("sanitizes network errors on manual check", async () => {
    service.on("error", () => {});
    await service.checkForUpdates({ manual: true });
    autoUpdater.emit("error", new Error("ENOTFOUND github.com"));
    expect(service.getStatus().state).toBe("error");
    expect(service.getStatus().error).toContain("internet connection");
  });

  it("returns manual download URL on macOS", () => {
    const macService = createUpdateService({
      autoUpdater: autoUpdater as never,
      getVersion: () => "1.0.0",
      isDev: false,
      platform: "darwin",
      openExternal,
    });
    expect(macService.getManualDownloadUrl()).toContain("github.com/BitsOfJT/ai-video-clips/releases");
    autoUpdater.emit("update-available", { version: "1.0.1" });
    expect(macService.getStatus().manualDownloadUrl).toBeDefined();
  });

  it("opens browser instead of downloading on macOS", async () => {
    const macService = createUpdateService({
      autoUpdater: autoUpdater as never,
      getVersion: () => "1.0.0",
      isDev: false,
      platform: "darwin",
      openExternal,
    });
    autoUpdater.emit("update-available", { version: "1.0.1" });
    await macService.downloadUpdate();
    expect(openExternal).toHaveBeenCalled();
    expect(autoUpdater.downloadUpdate).not.toHaveBeenCalled();
  });

  it("calls quitAndInstall on Windows when downloaded", () => {
    autoUpdater.emit("update-downloaded", { version: "1.0.1" });
    service.quitAndInstall();
    expect(autoUpdater.quitAndInstall).toHaveBeenCalled();
  });

  it("rejects quitAndInstall on macOS", () => {
    const macService = createUpdateService({
      autoUpdater: autoUpdater as never,
      getVersion: () => "1.0.0",
      isDev: false,
      platform: "darwin",
      openExternal,
    });
    autoUpdater.emit("update-downloaded", { version: "1.0.1" });
    expect(() => macService.quitAndInstall()).toThrow(/macOS/i);
  });

  it("resets to idle on silent check failure", async () => {
    service.on("error", () => {});
    autoUpdater.checkForUpdates.mockRejectedValue(new Error("ENOTFOUND"));
    await service.checkForUpdates({ manual: false });
    expect(service.getStatus().state).toBe("idle");
  });

  it("surfaces error on manual check failure", async () => {
    service.on("error", () => {});
    autoUpdater.checkForUpdates.mockRejectedValue(new Error("ENOTFOUND"));
    await service.checkForUpdates({ manual: true });
    expect(service.getStatus().state).toBe("error");
  });
});
