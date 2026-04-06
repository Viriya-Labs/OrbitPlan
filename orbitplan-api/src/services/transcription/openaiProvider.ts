import fs from "node:fs";
import OpenAI from "openai";
import { env } from "../../config/env.js";
import { withOpenAiRetry } from "../openai/retry.js";
import { prepareMediaForTranscription } from "./mediaPreprocessor.js";
import type { TranscriptionInput, TranscriptionProvider, TranscriptionResult } from "./types.js";

export class OpenAiTranscriptionProvider implements TranscriptionProvider {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    const prepared = await prepareMediaForTranscription(input);

    try {
      const transcription = await withOpenAiRetry(() =>
        this.client.audio.transcriptions.create({
          file: fs.createReadStream(prepared.filePath),
          model: "gpt-4o-mini-transcribe",
        }, {
          timeout: env.aiTimeoutMs,
        }),
      );

      return { text: transcription.text };
    } finally {
      await prepared.cleanup?.();
    }
  }
}
