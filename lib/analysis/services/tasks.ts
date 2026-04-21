import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";

import { NotFoundError, ValidationError } from "@/lib/analysis/errors";
import { getAnalysisJobRepository } from "@/lib/analysis/job-repository";
import {
  getAnalysisRepository,
  toPublicAnalysisTask,
} from "@/lib/analysis/repository";
import { processAnalysisTask } from "@/lib/analysis/services/processing";
import { extractUploadedVideoMetadata, extractVideoMetadata } from "@/lib/analysis/video-metadata";
import { isSupabaseBackedUserId } from "@/lib/supabase/user-id";
import type {
  AnalysisListInput,
  AnalysisPublicTask,
  AnalysisTask,
  CreateAnalysisInput,
} from "@/lib/analysis/types";
import { assertValidVideoUrl } from "@/lib/analysis/utils";

const runningTasks = new Map<string, Promise<void>>();
const ANALYSIS_WORKER_ID = `analysis-worker:${process.pid ?? "unknown"}:${randomUUID()}`;
const ANALYSIS_HEARTBEAT_INTERVAL_MS = 15_000;
const RUNNABLE_JOB_BATCH_SIZE = 4;

const ALLOWED_UPLOAD_EXTENSIONS = new Set([".mp4"]);
const ALLOWED_UPLOAD_MIME_TYPES = new Set(["video/mp4", "application/mp4"]);

function getUploadedVideoTempRoot() {
  if (process.env.VERCEL === "1") {
    return "/tmp/uploaded-videos";
  }

  return ".tmp/uploaded-videos";
}

async function persistUploadedVideo(input: NonNullable<CreateAnalysisInput["uploadedVideo"]>) {
  const fileName = input.fileName.trim();
  const extension = extname(fileName).toLowerCase();

  if (!fileName || !ALLOWED_UPLOAD_EXTENSIONS.has(extension)) {
    throw new ValidationError("Please upload an MP4 video file.");
  }

  if (input.mimeType && !ALLOWED_UPLOAD_MIME_TYPES.has(input.mimeType.toLowerCase())) {
    throw new ValidationError("Only MP4 video uploads are supported right now.");
  }

  if (!Number.isFinite(input.fileSizeBytes) || input.fileSizeBytes <= 0) {
    throw new ValidationError("The uploaded video file is empty.");
  }

  const uploadRoot = getUploadedVideoTempRoot();
  await mkdir(uploadRoot, { recursive: true });
  const workingDirectory = await mkdtemp(join(uploadRoot, "video-upload-"));
  const filePath = join(workingDirectory, `source${extension || ".mp4"}`);

  await writeFile(filePath, Buffer.from(input.buffer));

  return extractUploadedVideoMetadata({
    fileName,
    mimeType: input.mimeType,
    fileSizeBytes: input.fileSizeBytes,
    filePath,
  });
}

function ensureAnalysisTaskRunning(id: string) {
  const existing = runningTasks.get(id);
  if (existing) {
    return existing;
  }

  const promise = runAnalysisTask(id).finally(() => {
    runningTasks.delete(id);
  });

  runningTasks.set(id, promise);
  return promise;
}

async function runAnalysisTask(id: string) {
  const jobRepository = getAnalysisJobRepository();
  const claimedJob = await jobRepository.claim(id, ANALYSIS_WORKER_ID);

  if (!claimedJob) {
    await processAnalysisTask({ analysisId: id });
    return;
  }

  const heartbeat = setInterval(() => {
    void jobRepository.heartbeat(id, ANALYSIS_WORKER_ID).catch((error) => {
      console.warn(`[analysis] Failed to heartbeat job ${id}.`, error);
    });
  }, ANALYSIS_HEARTBEAT_INTERVAL_MS);
  heartbeat.unref?.();

  try {
    await processAnalysisTask({
      analysisId: id,
      job: claimedJob,
      workerId: ANALYSIS_WORKER_ID,
    });
  } finally {
    clearInterval(heartbeat);
  }
}

async function ensureRunnableAnalysisJobs(limit = RUNNABLE_JOB_BATCH_SIZE) {
  const jobRepository = getAnalysisJobRepository();
  const runnableJobs = await jobRepository.listRunnable(limit);

  await Promise.all(
    runnableJobs.map(async (job) => {
      await ensureAnalysisTaskRunning(job.analysisId);
    }),
  );
}

function kickOffRunnableAnalysisJobs(limit = RUNNABLE_JOB_BATCH_SIZE) {
  void ensureRunnableAnalysisJobs(limit).catch((error) => {
    console.warn("[analysis] Failed to kick off runnable jobs.", error);
  });
}

export async function createAnalysisTask(
  input: CreateAnalysisInput & { userId: string },
): Promise<AnalysisPublicTask> {
  const video = input.uploadedVideo
    ? await persistUploadedVideo(input.uploadedVideo)
    : await extractVideoMetadata(assertValidVideoUrl(input.videoUrl ?? "").toString());
  const now = new Date().toISOString();

  const task: AnalysisTask = {
    id: randomUUID(),
    userId: input.userId,
    status: "queued",
    video,
    transcript: null,
    transcriptSource: null,
    result: null,
    chatMessages: [],
    errorMessage: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  const repository = getAnalysisRepository();
  const createdTask = await repository.create(task);
  const jobRepository = getAnalysisJobRepository();

  if (isSupabaseBackedUserId(createdTask.userId)) {
    await jobRepository.enqueue({
      analysisId: createdTask.id,
      userId: createdTask.userId,
    });
    void ensureAnalysisTaskRunning(createdTask.id);
    kickOffRunnableAnalysisJobs();
    return toPublicAnalysisTask(createdTask);
  }

  await ensureAnalysisTaskRunning(createdTask.id);

  const completedTask = await repository.findById(createdTask.id);
  return toPublicAnalysisTask(completedTask ?? createdTask);
}

export async function getAnalysisTask(id: string): Promise<AnalysisPublicTask> {
  const repository = getAnalysisRepository();
  const task = await repository.findById(id);

  if (!task) {
    throw new NotFoundError("Could not find the requested analysis task.");
  }

  if (task.status === "queued" || task.status === "processing") {
    void ensureAnalysisTaskRunning(task.id);
    kickOffRunnableAnalysisJobs();
  }

  return toPublicAnalysisTask(task);
}

export async function getAnalysisTaskForUser(
  id: string,
  userId: string,
): Promise<AnalysisPublicTask> {
  const repository = getAnalysisRepository();
  const task = await repository.findByIdForUser(id, userId);

  if (!task) {
    throw new NotFoundError("Could not find the requested analysis task.");
  }

  if (task.status === "queued" || task.status === "processing") {
    void ensureAnalysisTaskRunning(task.id);
    kickOffRunnableAnalysisJobs();
  }

  return toPublicAnalysisTask(task);
}

export async function listAnalysisTasksForUser(input: AnalysisListInput) {
  try {
    const repository = getAnalysisRepository();
    const tasks = await repository.listByUser(input);
    return tasks.map(toPublicAnalysisTask);
  } catch (error) {
    console.error("[analysis] Failed to list tasks for user, returning an empty list.", {
      userId: input.userId,
      archived: input.archived ?? false,
      query: input.query ?? null,
      error,
    });
    return [];
  }
}

export async function setAnalysisArchived(
  id: string,
  userId: string,
  archived: boolean,
) {
  const repository = getAnalysisRepository();
  const task = await repository.setArchived(id, userId, archived);

  if (!task) {
    throw new NotFoundError("Could not find the requested analysis task.");
  }

  return toPublicAnalysisTask(task);
}
