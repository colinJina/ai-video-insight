import type { TranscriptChunk, TranscriptSegment } from "@/lib/analysis/types";
import { normalizeWhitespace } from "@/lib/analysis/utils";

const MIN_CHUNK_LENGTH = 320;
const TARGET_CHUNK_LENGTH = 900;
const MAX_CHUNK_LENGTH = 1200;
const CHUNK_OVERLAP_SEGMENTS = 1;

type ChunkAccumulator = {
  segments: Array<{
    segment: TranscriptSegment;
    text: string;
  }>;
  startSeconds: number | null;
  endSeconds: number | null;
  length: number;
};

function createAccumulator(): ChunkAccumulator {
  return {
    segments: [],
    startSeconds: null,
    endSeconds: null,
    length: 0,
  };
}

function toChunk(
  accumulator: ChunkAccumulator,
  chunkIndex: number,
): TranscriptChunk | null {
  const text = normalizeWhitespace(
    accumulator.segments.map((entry) => entry.text).join(" "),
  );
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
  accumulator.segments.push({
    segment,
    text,
  });
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

function createOverlapAccumulator(
  accumulator: ChunkAccumulator,
): ChunkAccumulator {
  const overlapEntries = accumulator.segments.slice(-CHUNK_OVERLAP_SEGMENTS);
  const nextAccumulator = createAccumulator();

  for (const entry of overlapEntries) {
    appendSegment(nextAccumulator, entry.segment, entry.text);
  }

  return nextAccumulator;
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
      accumulator = createOverlapAccumulator(accumulator);
    }

    appendSegment(accumulator, segment, text);

    if (accumulator.length >= TARGET_CHUNK_LENGTH) {
      const chunk = toChunk(accumulator, chunks.length);
      if (chunk) {
        chunks.push(chunk);
      }
      accumulator = createOverlapAccumulator(accumulator);
    }
  }

  const finalChunk = toChunk(accumulator, chunks.length);
  if (finalChunk) {
    chunks.push(finalChunk);
  }

  return chunks;
}
