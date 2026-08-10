// ─── Debug Adapter Protocol client (stdio framing) ──────────
// Minimal DAP client: Content-Length framed JSON messages over a pair of
// streams, request/response correlation by seq, and event waiting. The
// transport is injected (any Readable/Writable pair), so unit tests drive it
// against a scripted fake adapter with PassThrough streams — no debugger
// process required.

import type { Readable, Writable } from "node:stream";

export interface DapMessage {
  seq: number;
  type: "request" | "response" | "event";
  [key: string]: unknown;
}

export interface DapResponse extends DapMessage {
  type: "response";
  request_seq: number;
  success: boolean;
  command: string;
  message?: string;
  body?: Record<string, unknown>;
}

export interface DapEvent extends DapMessage {
  type: "event";
  event: string;
  body?: Record<string, unknown>;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export interface DapClient {
  sendRequest(
    command: string,
    args?: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<DapResponse>;
  onEvent(event: string, handler: (body: Record<string, unknown>) => void): void;
  /**
   * Wait for the next occurrence of one of `events` (or one already buffered
   * since the last wait). Resolves { event, body }; rejects on timeout.
   */
  waitForEvent(
    events: string[],
    timeoutMs?: number,
  ): Promise<{ event: string; body: Record<string, unknown> }>;
  dispose(): void;
}

export function createDapClient(
  input: Readable,
  output: Writable,
  onProtocolError?: (error: Error) => void,
): DapClient {
  let nextSeq = 1;
  let disposed = false;
  let buffer = Buffer.alloc(0);

  const pendingRequests = new Map<
    number,
    { resolve: (response: DapResponse) => void; timer: NodeJS.Timeout }
  >();
  const eventHandlers = new Map<
    string,
    Array<(body: Record<string, unknown>) => void>
  >();
  // Events that arrived while nobody was waiting — waitForEvent drains these
  // first so a fast adapter (stopped fires before the caller waits) is not a
  // race.
  const bufferedEvents: Array<{ event: string; body: Record<string, unknown> }> =
    [];
  const eventWaiters: Array<{
    events: string[];
    resolve: (result: { event: string; body: Record<string, unknown> }) => void;
    timer: NodeJS.Timeout;
  }> = [];

  function write(message: Record<string, unknown>): void {
    const json = JSON.stringify(message);
    const payload = Buffer.from(json, "utf-8");
    output.write(`Content-Length: ${payload.length}\r\n\r\n`);
    output.write(payload);
  }

  function handleMessage(message: DapMessage): void {
    if (message.type === "response") {
      const response = message as DapResponse;
      const pending = pendingRequests.get(response.request_seq);
      if (pending) {
        pendingRequests.delete(response.request_seq);
        clearTimeout(pending.timer);
        pending.resolve(response);
      }
      return;
    }

    if (message.type === "event") {
      const dapEvent = message as DapEvent;
      const body = dapEvent.body ?? {};
      for (const handler of eventHandlers.get(dapEvent.event) ?? []) {
        try {
          handler(body);
        } catch {
          /* handler errors never break the read loop */
        }
      }
      const waiterIndex = eventWaiters.findIndex((waiter) =>
        waiter.events.includes(dapEvent.event),
      );
      if (waiterIndex !== -1) {
        const [waiter] = eventWaiters.splice(waiterIndex, 1);
        clearTimeout(waiter.timer);
        waiter.resolve({ event: dapEvent.event, body });
      } else {
        bufferedEvents.push({ event: dapEvent.event, body });
      }
    }
  }

  function onData(chunk: Buffer): void {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const header = buffer.subarray(0, headerEnd).toString("utf-8");
      const lengthMatch = header.match(/Content-Length: *(\d+)/i);
      if (!lengthMatch) {
        onProtocolError?.(new Error(`DAP header without Content-Length: ${header}`));
        buffer = buffer.subarray(headerEnd + 4);
        continue;
      }
      const contentLength = parseInt(lengthMatch[1], 10);
      const messageStart = headerEnd + 4;
      if (buffer.length < messageStart + contentLength) return; // wait for more
      const body = buffer.subarray(messageStart, messageStart + contentLength);
      buffer = buffer.subarray(messageStart + contentLength);
      try {
        handleMessage(JSON.parse(body.toString("utf-8")) as DapMessage);
      } catch (parseError: unknown) {
        onProtocolError?.(
          parseError instanceof Error ? parseError : new Error(String(parseError)),
        );
      }
    }
  }

  input.on("data", onData);

  return {
    sendRequest(
      command: string,
      args: Record<string, unknown> = {},
      timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
    ): Promise<DapResponse> {
      if (disposed) {
        return Promise.reject(new Error("DAP client is disposed"));
      }
      const seq = nextSeq++;
      return new Promise<DapResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingRequests.delete(seq);
          reject(new Error(`DAP request '${command}' timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        pendingRequests.set(seq, { resolve, timer });
        write({ seq, type: "request", command, arguments: args });
      });
    },

    onEvent(event, handler) {
      const handlers = eventHandlers.get(event) ?? [];
      handlers.push(handler);
      eventHandlers.set(event, handlers);
    },

    waitForEvent(events, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
      const bufferedIndex = bufferedEvents.findIndex((buffered) =>
        events.includes(buffered.event),
      );
      if (bufferedIndex !== -1) {
        const [buffered] = bufferedEvents.splice(bufferedIndex, 1);
        return Promise.resolve(buffered);
      }
      return new Promise((resolve, reject) => {
        const waiter = {
          events,
          resolve,
          timer: setTimeout(() => {
            const index = eventWaiters.indexOf(waiter);
            if (index !== -1) eventWaiters.splice(index, 1);
            reject(
              new Error(
                `Timed out after ${timeoutMs}ms waiting for DAP event(s): ${events.join(", ")}`,
              ),
            );
          }, timeoutMs),
        };
        eventWaiters.push(waiter);
      });
    },

    dispose() {
      disposed = true;
      input.off("data", onData);
      for (const [, pending] of pendingRequests) clearTimeout(pending.timer);
      pendingRequests.clear();
      for (const waiter of eventWaiters) clearTimeout(waiter.timer);
      eventWaiters.length = 0;
      bufferedEvents.length = 0;
      eventHandlers.clear();
    },
  };
}
