import { contextBridge, ipcRenderer, type OpenDialogOptions } from "electron";
import { IPC_CHANNELS, VALID_IPC_CHANNELS } from "../src/constants.js";

const validChannels = VALID_IPC_CHANNELS;

type Channel = (typeof validChannels)[number];

async function invoke<T>(channel: Channel, ...args: unknown[]): Promise<T> {
  if (!validChannels.includes(channel)) {
    return Promise.reject(new Error(`Invalid IPC channel: ${channel}`));
  }
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

/**
 * Exposes a restricted set of IPC channels to the renderer process.
 */
const electronAPI = {
  invoke,

  openFileDialog: (options: OpenDialogOptions): Promise<string | null> =>
    invoke<string | null>(IPC_CHANNELS.DIALOG_OPEN_FILE, options),

  // One-way listeners: securely wrap ipcRenderer.on to only accept whitelisted channels.
  // Named channel constants are used directly so reordering in constants.ts cannot break them.
  onTranscriptionProgress: (callback: (payload: { projectId: string; percent: number }) => void) => {
    ipcRenderer.on(IPC_CHANNELS.TRANSCRIPTION_PROGRESS, (_, payload) => callback(payload));
  },
  onTranscriptionComplete: (callback: (payload: { projectId: string }) => void) => {
    ipcRenderer.on(IPC_CHANNELS.TRANSCRIPTION_COMPLETE, (_, payload) => callback(payload));
  },
  onTranscriptionError: (callback: (payload: { projectId: string; error: string }) => void) => {
    ipcRenderer.on(IPC_CHANNELS.TRANSCRIPTION_ERROR, (_, payload) => callback(payload));
  },
  onAnalysisProgress: (
    callback: (payload: { projectId: string; percent: number; stage: string }) => void
  ) => {
    ipcRenderer.on(IPC_CHANNELS.ANALYSIS_PROGRESS, (_, payload) => callback(payload));
  },
  onAnalysisComplete: (callback: (payload: { projectId: string }) => void) => {
    ipcRenderer.on(IPC_CHANNELS.ANALYSIS_COMPLETE, (_, payload) => callback(payload));
  },
  onAnalysisError: (callback: (payload: { projectId: string; error: string }) => void) => {
    ipcRenderer.on(IPC_CHANNELS.ANALYSIS_ERROR, (_, payload) => callback(payload));
  },
  onExportProgress: (callback: (payload: { clipId: string; percent: number }) => void) => {
    ipcRenderer.on(IPC_CHANNELS.EXPORT_PROGRESS, (_, payload) => callback(payload));
  },
  onExportComplete: (callback: (payload: { clipId: string; outputPath: string }) => void) => {
    ipcRenderer.on(IPC_CHANNELS.EXPORT_COMPLETE, (_, payload) => callback(payload));
  },
  onExportError: (callback: (payload: { clipId: string; error: string }) => void) => {
    ipcRenderer.on(IPC_CHANNELS.EXPORT_ERROR, (_, payload) => callback(payload));
  },
  removeAllListeners: (channel: Channel) => {
    if (validChannels.includes(channel)) {
      ipcRenderer.removeAllListeners(channel);
    }
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

export type ElectronAPI = typeof electronAPI;
