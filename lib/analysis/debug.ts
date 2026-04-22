import "server-only";

import { randomUUID } from "node:crypto";

import { trimText } from "@/lib/analysis/utils";

const DEFAULT_TEXT_LIMIT = 240;
const MAX_OBJECT_DEPTH = 3;
const MAX_ARRAY_ITEMS = 8;

function isDebugEnabled() {
  const flag = process.env.ANALYSIS_PIPELINE_DEBUG?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off") {
    return false;
  }

  if (flag === "true" || flag === "1" || flag === "on") {
    return true;
  }

  return process.env.NODE_ENV !== "production";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summarizeValue(value: unknown, depth = 0): unknown {
  if (value == null) {
    return value;
  }

  if (typeof value === "string") {
    return trimText(value, DEFAULT_TEXT_LIMIT);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    if (depth >= MAX_OBJECT_DEPTH) {
      return `[array(${value.length})]`;
    }

    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => summarizeValue(item, depth + 1));
  }

  if (isPlainObject(value)) {
    if (depth >= MAX_OBJECT_DEPTH) {
      return "[object]";
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        summarizeValue(entryValue, depth + 1),
      ]),
    );
  }

  return String(value);
}

export function createPipelineTraceId(prefix: string) {
  return `${prefix}:${randomUUID().slice(0, 8)}`;
}

export function previewText(value: string | null | undefined, maxLength = DEFAULT_TEXT_LIMIT) {
  if (!value) {
    return null;
  }

  return trimText(value, maxLength);
}

export function logPipelineEvent(
  scope: string,
  event: string,
  payload?: Record<string, unknown>,
) {
  if (!isDebugEnabled()) {
    return;
  }

  const time = new Date().toISOString();
  const summary = payload ? summarizeValue(payload) : undefined;

  if (summary) {
    console.info(`[pipeline][${scope}] ${time} ${event}`, summary);
    return;
  }

  console.info(`[pipeline][${scope}] ${time} ${event}`);
}
