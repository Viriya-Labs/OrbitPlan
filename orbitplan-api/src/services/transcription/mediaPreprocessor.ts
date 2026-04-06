import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import type { TranscriptionInput } from "./types.js";

const ffmpegBinaryPath = ffmpegPath as unknown as string | null;

const needsAudioNormalization = (mimeType: string) =>
  mimeType.startsWith("video/") || mimeType === "audio/webm" || mimeType === "audio/mp4" || mimeType === "audio/m4a";

export const prepareMediaForTranscription = async (
  input: TranscriptionInput,
): Promise<{ filePath: string; mimeType: string; cleanup?: () => Promise<void> }> => {
  if (!needsAudioNormalization(input.mimeType)) {
    return {
      filePath: input.filePath,
      mimeType: input.mimeType,
    };
  }

  if (!ffmpegPath) {
    return {
      filePath: input.filePath,
      mimeType: input.mimeType,
    };
  }

  const outputPath = path.join(
    path.dirname(input.filePath),
    `${path.parse(input.filePath).name}-transcription.mp3`,
  );
  const binaryPath = ffmpegBinaryPath;

  await new Promise<void>((resolve, reject) => {
    if (!binaryPath) {
      reject(new Error("ffmpeg binary is unavailable for media normalization"));
      return;
    }

    const ffmpeg: ChildProcessWithoutNullStreams = spawn(binaryPath, [
      "-y",
      "-i",
      input.filePath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "64k",
      outputPath,
    ]);

    let stderr = "";
    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    ffmpeg.on("error", (error: Error) => {
      reject(error);
    });

    ffmpeg.on("close", (code: number | null) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg failed to normalize media (${code}): ${stderr.trim() || "unknown error"}`));
    });
  });

  return {
    filePath: outputPath,
    mimeType: "audio/mpeg",
    cleanup: async () => {
      await fs.rm(outputPath, { force: true });
    },
  };
};
