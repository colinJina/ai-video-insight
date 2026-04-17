import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  chunkMatchesMetadataFilter,
  computeSparseScores,
} from "@/lib/analysis/retrieval";
import { isSupabaseRepositoryConfigured } from "@/lib/supabase/env";
import { shouldFallbackToMemoryRepository } from "@/lib/supabase/repository-fallback";
import { isSupabaseBackedUserId } from "@/lib/supabase/user-id";
import type {
  RetrievalMetadataFilter,
  TranscriptChunk,
  TranscriptChunkMatch,
} from "@/lib/analysis/types";

type TranscriptChunkRecord = TranscriptChunk & {
  id: string;
  analysisId: string;
  userId: string;
  embedding: number[];
  createdAt: string;
};

type UpsertTranscriptChunksInput = {
  analysisId: string;
  userId: string;
  chunks: Array<TranscriptChunk & { embedding: number[] }>;
};

type MatchTranscriptChunksInput = {
  analysisId: string;
  userId: string;
  queryEmbedding: number[];
  limit: number;
  metadataFilter?: RetrievalMetadataFilter | null;
};

type SearchTranscriptChunksInput = {
  analysisId: string;
  userId: string;
  queryText: string;
  limit: number;
  metadataFilter?: RetrievalMetadataFilter | null;
};

export interface TranscriptChunkRepository {
  replaceForAnalysis(input: UpsertTranscriptChunksInput): Promise<void>;
  matchForAnalysis(
    input: MatchTranscriptChunksInput,
  ): Promise<TranscriptChunkMatch[]>;
  searchForAnalysis(
    input: SearchTranscriptChunksInput,
  ): Promise<TranscriptChunkMatch[]>;
}

type GlobalTranscriptChunkStore = typeof globalThis & {
  __analysisTranscriptChunkStore__?: Map<string, TranscriptChunkRecord[]>;
};

const transcriptChunkStore =
  ((globalThis as GlobalTranscriptChunkStore).__analysisTranscriptChunkStore__ ??=
    new Map<string, TranscriptChunkRecord[]>());

function cloneValue<T>(value: T) {
  return structuredClone(value);
}

function cosineSimilarity(left: number[], right: number[]) {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function coerceOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function mapChunkRecordToMatch(record: TranscriptChunkRecord, score: number): TranscriptChunkMatch {
  return {
    id: record.id,
    analysisId: record.analysisId,
    userId: record.userId,
    chunkIndex: record.chunkIndex,
    text: record.text,
    startSeconds: record.startSeconds,
    endSeconds: record.endSeconds,
    score,
  };
}

class MemoryTranscriptChunkRepository implements TranscriptChunkRepository {
  async replaceForAnalysis({
    analysisId,
    userId,
    chunks,
  }: UpsertTranscriptChunksInput) {
    const nextRecords: TranscriptChunkRecord[] = chunks.map((chunk) => ({
      id: crypto.randomUUID(),
      analysisId,
      userId,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      startSeconds: chunk.startSeconds,
      endSeconds: chunk.endSeconds,
      embedding: cloneValue(chunk.embedding),
      createdAt: new Date().toISOString(),
    }));

    transcriptChunkStore.set(analysisId, nextRecords);
  }

  async matchForAnalysis({
    analysisId,
    userId,
    queryEmbedding,
    limit,
    metadataFilter,
  }: MatchTranscriptChunksInput) {
    const records = transcriptChunkStore.get(analysisId) ?? [];

    return records
      .filter((record) => record.userId === userId)
      .filter((record) => chunkMatchesMetadataFilter(record, metadataFilter ?? null))
      .map((record) =>
        mapChunkRecordToMatch(record, cosineSimilarity(record.embedding, queryEmbedding)),
      )
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map(cloneValue);
  }

  async searchForAnalysis({
    analysisId,
    userId,
    queryText,
    limit,
    metadataFilter,
  }: SearchTranscriptChunksInput) {
    const records = transcriptChunkStore.get(analysisId) ?? [];
    const scoredRecords = computeSparseScores(
      queryText,
      records
        .filter((record) => record.userId === userId)
        .filter((record) => chunkMatchesMetadataFilter(record, metadataFilter ?? null))
        .map((record) => ({
          item: record,
          text: record.text,
        })),
    );

    return scoredRecords
      .slice(0, limit)
      .map(({ item, score }) => mapChunkRecordToMatch(item, score))
      .map(cloneValue);
  }
}

class SupabaseTranscriptChunkRepository implements TranscriptChunkRepository {
  async replaceForAnalysis({
    analysisId,
    userId,
    chunks,
  }: UpsertTranscriptChunksInput) {
    const supabase = createSupabaseAdminClient();

    const { error: deleteError } = await supabase
      .from("analysis_transcript_chunks")
      .delete()
      .eq("analysis_id", analysisId);

    if (deleteError) {
      throw deleteError;
    }

    if (chunks.length === 0) {
      return;
    }

    const { error: insertError } = await supabase
      .from("analysis_transcript_chunks")
      .insert(
        chunks.map((chunk) => ({
          analysis_id: analysisId,
          user_id: userId,
          chunk_index: chunk.chunkIndex,
          text: chunk.text,
          start_seconds: chunk.startSeconds,
          end_seconds: chunk.endSeconds,
          embedding: chunk.embedding,
        })),
      );

    if (insertError) {
      throw insertError;
    }
  }

  async matchForAnalysis({
    analysisId,
    userId,
    queryEmbedding,
    limit,
    metadataFilter,
  }: MatchTranscriptChunksInput) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc(
      "match_analysis_transcript_chunks",
      {
        filter_analysis_id: analysisId,
        filter_user_id: userId,
        query_embedding: queryEmbedding,
        match_count: limit,
        filter_start_seconds: metadataFilter?.startSeconds ?? null,
        filter_end_seconds: metadataFilter?.endSeconds ?? null,
      },
    );

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      analysisId: row.analysis_id,
      userId: row.user_id,
      chunkIndex: row.chunk_index,
      text: row.text,
      startSeconds: coerceOptionalNumber(row.start_seconds),
      endSeconds: coerceOptionalNumber(row.end_seconds),
      score: coerceOptionalNumber(row.score) ?? 0,
    }));
  }

  async searchForAnalysis({
    analysisId,
    userId,
    queryText,
    limit,
    metadataFilter,
  }: SearchTranscriptChunksInput) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc(
      "search_analysis_transcript_chunks",
      {
        filter_analysis_id: analysisId,
        filter_user_id: userId,
        query_text: queryText,
        match_count: limit,
        filter_start_seconds: metadataFilter?.startSeconds ?? null,
        filter_end_seconds: metadataFilter?.endSeconds ?? null,
      },
    );

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      analysisId: row.analysis_id,
      userId: row.user_id,
      chunkIndex: row.chunk_index,
      text: row.text,
      startSeconds: coerceOptionalNumber(row.start_seconds),
      endSeconds: coerceOptionalNumber(row.end_seconds),
      score: coerceOptionalNumber(row.score) ?? 0,
    }));
  }
}

const memoryRepository = new MemoryTranscriptChunkRepository();
const supabaseRepository = isSupabaseRepositoryConfigured()
  ? new SupabaseTranscriptChunkRepository()
  : null;
let didWarnAboutChunkRepositoryFallback = false;

async function runChunkRepositoryOperation<T>(
  operation: string,
  runMemory: () => Promise<T>,
  runSupabase: (() => Promise<T>) | null,
) {
  if (!runSupabase) {
    return runMemory();
  }

  try {
    return await runSupabase();
  } catch (error) {
    if (!shouldFallbackToMemoryRepository(error)) {
      throw error;
    }

    if (!didWarnAboutChunkRepositoryFallback) {
      didWarnAboutChunkRepositoryFallback = true;
      console.warn(
        `[analysis] Transcript chunk repository is unavailable during ${operation}; falling back to in-memory storage.`,
        error,
      );
    }

    return runMemory();
  }
}

const repository: TranscriptChunkRepository = {
  replaceForAnalysis(input) {
    const useSupabase = supabaseRepository && isSupabaseBackedUserId(input.userId);

    return runChunkRepositoryOperation(
      "replaceForAnalysis",
      () => memoryRepository.replaceForAnalysis(input),
      useSupabase ? () => supabaseRepository.replaceForAnalysis(input) : null,
    );
  },
  matchForAnalysis(input) {
    const useSupabase = supabaseRepository && isSupabaseBackedUserId(input.userId);

    return runChunkRepositoryOperation(
      "matchForAnalysis",
      () => memoryRepository.matchForAnalysis(input),
      useSupabase ? () => supabaseRepository.matchForAnalysis(input) : null,
    );
  },
  searchForAnalysis(input) {
    const useSupabase = supabaseRepository && isSupabaseBackedUserId(input.userId);

    return runChunkRepositoryOperation(
      "searchForAnalysis",
      () => memoryRepository.searchForAnalysis(input),
      useSupabase ? () => supabaseRepository.searchForAnalysis(input) : null,
    );
  },
};

export function getTranscriptChunkRepository() {
  return repository;
}
