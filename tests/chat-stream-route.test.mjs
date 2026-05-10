import test from "node:test";
import assert from "node:assert/strict";

import { encodeSseEvent } from "../lib/analysis/sse.ts";
import { streamAnalysisChatEvents } from "../lib/analysis/chat-stream.ts";

function createSseStream(events) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(
          encoder.encode(encodeSseEvent(event.event, event.data)),
        );
      }
      controller.close();
    },
  });
}

test("streamAnalysisChatEvents emits next phases before tokens and done", async () => {
  const preparedTurn = {
    pythonRequest: {
      recentMessages: [],
      memoryItems: [],
      storedMemoryItems: [],
      transcriptExcerpt: "Transcript excerpt",
    },
  };
  const analysis = { id: "analysis-1", chatMessages: [] };
  const events = [];

  for await (const event of streamAnalysisChatEvents({
    id: "analysis-1",
    input: {
      message: "What happened?",
    },
    prepareTurn: async function* () {
      yield {
        type: "phase",
        phase: {
          id: "next-load-analysis",
          label: "Loading analysis state",
          status: "active",
          detail: "Loading the completed analysis record.",
          source: "next",
          toolName: null,
        },
      };
      yield {
        type: "phase",
        phase: {
          id: "next-load-analysis",
          label: "Loading analysis state",
          status: "completed",
          detail: "Loaded the analysis and validated chat readiness.",
          source: "next",
          toolName: null,
        },
      };
      yield {
        type: "prepared",
        preparedTurn,
      };
    },
    requestPythonStream: async () => ({
      body: createSseStream([
        {
          event: "phase",
          data: {
            id: "python-generate-answer",
            label: "Generating answer",
            status: "active",
            detail: "Drafting the reply from the assembled context.",
            source: "python",
            toolName: null,
          },
        },
        {
          event: "token",
          data: "Hello",
        },
        {
          event: "final",
          data: {
            answer: "Hello",
            memoryItems: [],
            memoryUpdates: [],
            memoryHits: [],
            conversationSummary: null,
          },
        },
      ]),
    }),
    finalizeTurn: async () => analysis,
    readSseEvents: async function* (stream) {
      const { readSseEvents } = await import("../lib/analysis/sse.ts");
      yield* readSseEvents(stream);
    },
    parsePythonFinal: (data) => JSON.parse(data),
    readStreamErrorMessage: (data) => {
      const payload = JSON.parse(data);
      return payload.message ?? "Stream failed";
    },
    getErrorMessage: (error) => {
      if (error instanceof Error) {
        return error.message;
      }

      return String(error);
    },
  })) {
    events.push(event);
  }

  assert.deepEqual(
    events.map((event) => event.event),
    ["phase", "phase", "phase", "phase", "phase", "token", "done"],
  );
  assert.equal(events[0].data.id, "next-load-analysis");
  assert.equal(events[2].data.id, "next-connect-python");
  assert.equal(events[3].data.id, "next-connect-python");
  assert.equal(events[4].data.id, "python-generate-answer");
  assert.deepEqual(events[6].data.analysis, analysis);
});

test("streamAnalysisChatEvents marks the active phase as failed on prepare errors", async () => {
  const events = [];

  for await (const event of streamAnalysisChatEvents({
    id: "analysis-2",
    input: {
      message: "Why?",
    },
    prepareTurn: async function* () {
      yield {
        type: "phase",
        phase: {
          id: "next-load-analysis",
          label: "Loading analysis state",
          status: "active",
          detail: "Loading the completed analysis record.",
          source: "next",
          toolName: null,
        },
      };
      throw new Error("Broken prepare");
    },
    requestPythonStream: async () => {
      throw new Error("Should not be called");
    },
    finalizeTurn: async () => {
      throw new Error("Should not be called");
    },
    readSseEvents: async function* () {},
    parsePythonFinal: (data) => JSON.parse(data),
    readStreamErrorMessage: (data) => data,
    getErrorMessage: (error) => {
      if (error instanceof Error) {
        return error.message;
      }

      return String(error);
    },
  })) {
    events.push(event);
  }

  assert.deepEqual(
    events.map((event) => event.event),
    ["phase", "phase", "error"],
  );
  assert.equal(events[1].data.status, "failed");
  assert.equal(events[1].data.id, "next-load-analysis");
  assert.equal(events[2].data.message, "Broken prepare");
});
