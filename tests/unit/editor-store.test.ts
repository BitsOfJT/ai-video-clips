import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// Mock the global window.electronAPI before importing the store
const mockInvoke = vi.fn();
const mockOnTranscriptionProgress = vi.fn();
const mockOnTranscriptionComplete = vi.fn();
const mockOnTranscriptionError = vi.fn();
const mockOnAnalysisProgress = vi.fn();
const mockOnAnalysisComplete = vi.fn();
const mockOnAnalysisError = vi.fn();
const mockOnExportProgress = vi.fn();
// Mock window.electronAPI before importing the store
const electronAPI = {
  invoke: mockInvoke,
  onTranscriptionProgress: mockOnTranscriptionProgress,
  onTranscriptionComplete: mockOnTranscriptionComplete,
  onTranscriptionError: mockOnTranscriptionError,
  onAnalysisProgress: mockOnAnalysisProgress,
  onAnalysisComplete: mockOnAnalysisComplete,
  onAnalysisError: mockOnAnalysisError,
  onExportProgress: mockOnExportProgress,
  onExportComplete: vi.fn(),
  onExportError: vi.fn(),
  removeAllListeners: vi.fn(),
};

vi.stubGlobal("window", { electronAPI });

let useAppStore: typeof import("../../src/renderer/store/useAppStore").useAppStore;

beforeAll(async () => {
  const storeModule = await import("../../src/renderer/store/useAppStore");
  useAppStore = storeModule.useAppStore;
});

describe("Zustand Store — Video Export & Clip Editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset Zustand store state to default
    useAppStore.setState({
      projects: [],
      currentProjectId: null,
      selectedClipId: null,
      exportQueue: [],
      exportProgress: {},
      exportStatus: {},
      exportError: {},
      exportOutputPaths: {},
      clips: {},
    });
  });

  it("should initialize with default empty queue states", () => {
    const state = useAppStore.getState();
    expect(state.exportQueue).toEqual([]);
    expect(state.exportProgress).toEqual({});
    expect(state.exportStatus).toEqual({});
    expect(state.exportError).toEqual({});
    expect(state.exportOutputPaths).toEqual({});
  });

  it("should invoke IPC clip:update and update local state when updateClip is called", async () => {
    mockInvoke.mockResolvedValue(undefined);
    
    // Setup mock clips state
    useAppStore.setState({
      currentProjectId: "proj-123",
      clips: {
        "proj-123": [
          {
            id: "clip-abc",
            project_id: "proj-123",
            start_ms: 1000,
            end_ms: 5000,
            title: "Original Title",
            description: "Original Description",
            status: "suggested",
            ai_score: 9.0,
            hook_strength: 9,
            brief_relevance: 9,
            self_containment: 9,
            emotional_arc: 9,
            platform_fit: 9,
            reasoning: "",
            thumbnail_path: "",
            crop_x: -1,
            crop_y: -1,
            crop_w: -1,
            crop_h: -1,
            created_at: "",
          },
        ],
      },
    });

    const updates = { title: "Updated Title", crop_x: 150 };
    await useAppStore.getState().updateClip("clip-abc", updates);

    // Verify IPC call
    expect(mockInvoke).toHaveBeenCalledWith("clip:update", "clip-abc", updates);

    // Verify state updated
    const updatedClip = useAppStore.getState().clips["proj-123"][0];
    expect(updatedClip.title).toBe("Updated Title");
    expect(updatedClip.crop_x).toBe(150);
  });

  it("should update queue state and invoke export:start when startExport is called", async () => {
    mockInvoke.mockResolvedValue(true);

    await useAppStore.getState().startExport("clip-xyz");

    const state = useAppStore.getState();
    expect(state.exportQueue).toContain("clip-xyz");
    expect(state.exportStatus["clip-xyz"]).toBe("queued");
    expect(state.exportProgress["clip-xyz"]).toBe(0);
    expect(state.exportError["clip-xyz"]).toBe("");
    expect(mockInvoke).toHaveBeenCalledWith("export:start", "clip-xyz", true);
  });

  it("should invoke export:cancel when cancelExport is called", async () => {
    mockInvoke.mockResolvedValue(undefined);
    
    useAppStore.setState({
      exportQueue: ["clip-123"],
      exportStatus: { "clip-123": "queued" },
    });

    await useAppStore.getState().cancelExport("clip-123");

    expect(mockInvoke).toHaveBeenCalledWith("export:cancel", "clip-123");
    
    const state = useAppStore.getState();
    expect(state.exportQueue).not.toContain("clip-123");
    expect(state.exportStatus["clip-123"]).toBe("idle");
  });
});
