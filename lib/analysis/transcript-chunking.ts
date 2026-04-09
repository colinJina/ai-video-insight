import type { TranscriptChunk, TranscriptSegment } from "@/lib/analysis/types";
import { normalizeWhitespace } from "@/lib/analysis/utils";

const MIN_CHUNK_LENGTH = 320;
const TARGET_CHUNK_LENGTH = 900;
const MAX_CHUNK_LENGTH = 1200;

type ChunkAccumulator = {
  texts: string[];
  startSeconds: number | null;
  endSeconds: number | null;
  length: number;
};

function createAccumulator(): ChunkAccumulator {
  return {
    texts: [],
    startSeconds: null,
    endSeconds: null,
    length: 0,
  };
}

function toChunk(
  accumulator: ChunkAccumulator,
  chunkIndex: number,
): TranscriptChunk | null {
  const text = normalizeWhitespace(accumulator.texts.join(" "));
  if (!text) {
    return null;
  }

  return {
    chunkIndex,
    text,
    startSeconds: accumulator.startSeconds,
    endSeconds: accumulator.endSeconds,
  };
}

function appendSegment(
  accumulator: ChunkAccumulator,
  segment: TranscriptSegment,
  text: string,
) {
  accumulator.texts.push(text);
  accumulator.length += text.length;
  if (accumulator.startSeconds === null) {
    accumulator.startSeconds = segment.startSeconds;
  }

  if (segment.endSeconds !== null) {
    accumulator.endSeconds = segment.endSeconds;
  } else if (segment.startSeconds !== null) {
    accumulator.endSeconds = segment.startSeconds;
  }
}

export function chunkTranscriptSegments(
  segments: TranscriptSegment[],
): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];
  let accumulator = createAccumulator();

  for (const segment of segments) {
    const text = normalizeWhitespace(segment.text);
    if (!text) {
      continue;
    }

    const nextLength =
      accumulator.length === 0 ? text.length : accumulator.length + 1 + text.length;
    const shouldFlushBeforeAppend =
      accumulator.length >= MIN_CHUNK_LENGTH && nextLength > MAX_CHUNK_LENGTH;

    if (shouldFlushBeforeAppend) {
      const chunk = toChunk(accumulator, chunks.length);
      if (chunk) {
        chunks.push(chunk);
      }
      accumulator = createAccumulator();
    }

    appendSegment(accumulator, segment, text);

    if (accumulator.length >= TARGET_CHUNK_LENGTH) {
      const chunk = toChunk(accumulator, chunks.length);
      if (chunk) {
        chunks.push(chunk);
      }
      accumulator = createAccumulator();
    }
  }

  const finalChunk = toChunk(accumulator, chunks.length);
  if (finalChunk) {
    chunks.push(finalChunk);
  }

  return chunks;
}
