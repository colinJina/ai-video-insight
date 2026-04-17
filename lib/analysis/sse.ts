export type SseEvent = {
  event: string;
  data: string;
};

export function encodeSseEvent(event: string, data: unknown) {
  const serialized =
    typeof data === "string" ? data : JSON.stringify(data);

  return `event: ${event}\ndata: ${serialized}\n\n`;
}

export async function* readSseEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const boundaryMatch = buffer.match(/\r?\n\r?\n/);
        if (!boundaryMatch || boundaryMatch.index === undefined) {
          break;
        }

        const boundaryIndex = boundaryMatch.index;
        const rawEvent = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + boundaryMatch[0].length);
        const event = parseSseEventBlock(rawEvent);

        if (event) {
          yield event;
        }
      }
    }

    buffer += decoder.decode();
    const trailingEvent = parseSseEventBlock(buffer);
    if (trailingEvent) {
      yield trailingEvent;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSseEventBlock(block: string): SseEvent | null {
  const trimmed = block.trim();
  if (!trimmed) {
    return null;
  }

  let eventName = "message";
  const dataLines: string[] = [];

  for (const line of trimmed.split(/\r?\n/)) {
    if (line.startsWith(":")) {
      continue;
    }

    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim() || "message";
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  return {
    event: eventName,
    data: dataLines.join("\n"),
  };
}
