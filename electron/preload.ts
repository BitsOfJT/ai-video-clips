import { contextBridge, ipcRenderer } from "electron";
import { VALID_IPC_CHANNELS } from "../src/constants.js";

const validChannels = VALID_IPC_CHANNELS;

type Channel = (typeof validChannels)[number];

/**
 * Exposes a restricted set of IPC channels to the renderer process.
 */
const electronAPI = {
  invoke: <T>(channel: Channel, ...args: unknown[]): Promise<T> => {
    if (!validChannels.includes(channel)) {
      return Promise.reject(new Error(`Invalid IPC channel: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args) as Promise<T>;
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

export type ElectronAPI = typeof electronAPI;
