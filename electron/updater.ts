import { EventEmitter } from "node:events";
import type { AppUpdater, ProgressInfo } from "electron-updater";

const GITHUB_OWNER = "BitsOfJT";
const GITHUB_REPO = "ai-video-clips";

export type UpdateState =
  | "idle"
  | "checking"
  | "not-available"
  | "available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "error";

export interface UpdateStatus {
  currentVersion: string;
  state: UpdateState;
  availableVersion?: string | null;
  downloadProgress?: number;
  error?: string | null;
  manualDownloadUrl?: string | null;
  /** True when the user explicitly clicked "Check for updates". */
  isManualCheck?: boolean;
}

export type AppUpdateEvent =
  | "checking"
  | "available"
  | "not-available"
  | "progress"
  | "downloaded"
  | "error";

export interface UpdateServiceDeps {
  autoUpdater: AppUpdater;
  getVersion: () => string;
  openExternal: (url: string) => Promise<void>;
  isDev: boolean;
  platform: NodeJS.Platform;
}

export function sanitizeUpdateError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|fetch failed|getaddrinfo/i.test(raw)) {
    return "Could not reach the update server. Check your internet connection.";
  }
  if (/\b(401|403|404)\b/.test(raw)) {
    return "Update server returned an error. Try again later or download manually.";
  }
  return raw.split("\n")[0].slice(0, 200);
}

export function buildManualDownloadUrl(version?: string | null): string {
  if (version) {
    return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/v${version}`;
  }
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
}

export class UpdateService {
  private status: UpdateStatus;
  private readonly emitter = new EventEmitter();
  private manualCheck = false;
  private listenersAttached = false;

  constructor(private readonly deps: UpdateServiceDeps) {
    this.status = {
      currentVersion: deps.getVersion(),
      state: "idle",
    };
    if (!deps.isDev) {
      this.attachAutoUpdaterListeners();
      deps.autoUpdater.autoDownload = false;
      deps.autoUpdater.autoInstallOnAppQuit = false;
    }
  }

  on(event: AppUpdateEvent, listener: (...args: unknown[]) => void): void {
    this.emitter.on(event, listener);
  }

  off(event: AppUpdateEvent, listener: (...args: unknown[]) => void): void {
    this.emitter.off(event, listener);
  }

  getStatus(): UpdateStatus {
    return { ...this.status, isManualCheck: this.manualCheck };
  }

  getCurrentVersion(): string {
    return this.deps.getVersion();
  }

  getManualDownloadUrl(): string {
    return buildManualDownloadUrl(this.status.availableVersion);
  }

  async checkForUpdates(options: { manual: boolean }): Promise<void> {
    if (this.deps.isDev) {
      return;
    }

    this.manualCheck = options.manual;
    if (options.manual) {
      this.patchStatus({ state: "checking", error: null });
      this.emit("checking");
    }

    try {
      await this.deps.autoUpdater.checkForUpdates();
    } catch (err) {
      this.handleError(err);
    }
  }

  async downloadUpdate(): Promise<void> {
    if (this.deps.isDev) {
      return;
    }

    if (this.deps.platform === "darwin") {
      const url = this.getManualDownloadUrl();
      await this.deps.openExternal(url);
      return;
    }

    if (this.status.state !== "available" && this.status.state !== "error") {
      throw new Error("No update is available to download.");
    }

    this.patchStatus({ state: "downloading", error: null, downloadProgress: 0 });
    try {
      await this.deps.autoUpdater.downloadUpdate();
    } catch (err) {
      this.handleError(err);
      throw new Error(sanitizeUpdateError(err), { cause: err });
    }
  }

  quitAndInstall(): void {
    if (this.deps.isDev) {
      return;
    }

    if (this.deps.platform === "darwin") {
      throw new Error(
        "In-app install is not supported on macOS. Download the update from GitHub and install the new .dmg."
      );
    }

    if (this.status.state !== "downloaded") {
      throw new Error("No downloaded update is ready to install.");
    }

    this.patchStatus({ state: "installing" });
    this.deps.autoUpdater.quitAndInstall(false, true);
  }

  private attachAutoUpdaterListeners(): void {
    if (this.listenersAttached) {
      return;
    }
    this.listenersAttached = true;

    const { autoUpdater } = this.deps;

    autoUpdater.on("checking-for-update", () => {
      if (!this.manualCheck) {
        this.patchStatus({ state: "checking", error: null });
      }
      this.emit("checking");
    });

    autoUpdater.on("update-available", (info) => {
      this.patchStatus({
        state: "available",
        availableVersion: info.version,
        manualDownloadUrl: buildManualDownloadUrl(info.version),
        downloadProgress: undefined,
        error: null,
      });
      this.emit("available", info);
    });

    autoUpdater.on("update-not-available", () => {
      this.patchStatus({
        state: "not-available",
        availableVersion: null,
        error: null,
      });
      this.emit("not-available");
    });

    autoUpdater.on("download-progress", (progress: ProgressInfo) => {
      this.patchStatus({
        state: "downloading",
        downloadProgress: Math.round(progress.percent),
      });
      this.emit("progress", progress);
    });

    autoUpdater.on("update-downloaded", () => {
      if (this.deps.platform === "win32") {
        this.deps.autoUpdater.autoInstallOnAppQuit = true;
      }
      this.patchStatus({ state: "downloaded", downloadProgress: 100, error: null });
      this.emit("downloaded");
    });

    autoUpdater.on("error", (err: Error) => {
      this.handleError(err);
    });
  }

  private handleError(err: unknown): void {
    const message = sanitizeUpdateError(err);
    const { state } = this.status;

    if (!this.manualCheck && (state === "checking" || state === "idle")) {
      this.patchStatus({ state: "idle", error: null });
      return;
    }

    this.patchStatus({ state: "error", error: message });
    this.safeEmit("error", message);
  }

  private patchStatus(patch: Partial<UpdateStatus>): void {
    this.status = {
      ...this.status,
      currentVersion: this.deps.getVersion(),
      ...patch,
    };
  }

  private safeEmit(event: AppUpdateEvent, ...args: unknown[]): void {
    if (event === "error" && this.emitter.listenerCount("error") === 0) {
      return;
    }
    this.emitter.emit(event, ...args);
  }

  private emit(event: AppUpdateEvent, ...args: unknown[]): void {
    this.safeEmit(event, ...args);
  }
}

export function createUpdateService(deps: UpdateServiceDeps): UpdateService {
  return new UpdateService(deps);
}
