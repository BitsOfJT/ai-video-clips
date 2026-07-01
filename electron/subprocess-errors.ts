/** Map common subprocess exit codes to user-friendly error messages. */
export function friendlyExitMessage(processName: string, code: number | null): string {
  if (code === null) return `${processName} was killed unexpectedly.`;
  if (code === 0) return "";

  const messages: Record<string, Record<number, string>> = {
    ffprobe: {
      1: "FFmpeg could not read the video file — it may be corrupted or in an unsupported format.",
      127: "FFmpeg/ffprobe was not found. Please install FFmpeg or set its path in Settings.",
    },
    transcriber: {
      1: "Transcription failed — the audio may be corrupted or the model files may be missing.",
      127: "The transcriber binary was not found. Try rebuilding with `npm run build:python`.",
      137: "Transcription was killed (out of memory). Try a smaller Whisper model.",
    },
    editor: {
      1: "Export failed — FFmpeg encountered an encoding error. Check that the input video is valid.",
      127: "The editor binary was not found. Try rebuilding with `npm run build:python`.",
    },
  };

  const processMessages = messages[processName];
  if (processMessages && processMessages[code]) {
    return processMessages[code];
  }

  return `${processName} exited with error code ${code}.`;
}
