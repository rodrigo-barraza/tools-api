import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// get_file_info must route each path in a batch independently: a batch mixing
// agent-served and local paths used to be routed entirely by its first path,
// statting the wrong machine for the rest (audit §4.2).

const REMOTE_ROOT = "/remote-agent/workspace";

vi.mock("../AgentConnectionManager.ts", () => ({
  resolveAndRouteToAgent: vi.fn((targetPath: string) =>
    targetPath.startsWith("/remote-agent/") ? { id: "agent-1" } : null,
  ),
  sendRpc: vi.fn(async (_agentId: string, method: string, params: Record<string, unknown>) => {
    if (method !== "file.info") throw new Error(`unexpected RPC method: ${method}`);
    const paths = params.paths as string[];
    // Mirrors the remote handler's shape: single path → bare entry.
    return { path: paths[0], exists: true, isFile: true, sizeBytes: 42, servedBy: "remote" };
  }),
  offlineRemoteRootForPath: vi.fn(() => null),
}));

import { agenticFileInfo, ALLOWED_ROOTS } from "../AgenticFileService.ts";
import { sendRpc } from "../AgentConnectionManager.ts";

let localRoot: string;
let localFile: string;

beforeAll(() => {
  localRoot = realpathSync(mkdtempSync(join(tmpdir(), "fileinfo-routing-")));
  localFile = join(localRoot, "local.txt");
  writeFileSync(localFile, "one\ntwo\n");
  if (!ALLOWED_ROOTS.includes(localRoot)) ALLOWED_ROOTS.push(localRoot);
});

afterAll(() => {
  rmSync(localRoot, { recursive: true, force: true });
  const index = ALLOWED_ROOTS.indexOf(localRoot);
  if (index !== -1) ALLOWED_ROOTS.splice(index, 1);
});

describe("agenticFileInfo per-path agent routing", () => {
  it("routes a mixed batch per-path: remote paths via RPC, local paths via local stat", async () => {
    const remoteFile = `${REMOTE_ROOT}/remote.txt`;
    const result = (await agenticFileInfo([remoteFile, localFile])) as {
      totalRequested: number;
      results: Array<Record<string, unknown>>;
    };

    expect(result.totalRequested).toBe(2);
    expect(result.results).toHaveLength(2);

    // First entry came from the agent RPC…
    expect(result.results[0].servedBy).toBe("remote");
    expect(result.results[0].path).toBe(remoteFile);
    // …second entry was statted locally (real file, real size), NOT proxied.
    expect(result.results[1].servedBy).toBeUndefined();
    expect(result.results[1].exists).toBe(true);
    expect(result.results[1].sizeBytes).toBe(8);
    expect(result.results[1].lines).toBe(3);

    // Exactly one RPC — only the remote path was proxied.
    expect(vi.mocked(sendRpc)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendRpc)).toHaveBeenCalledWith("agent-1", "file.info", { paths: [remoteFile] });
  });

  it("returns a bare entry for a single remote path (shape parity with local)", async () => {
    const remoteFile = `${REMOTE_ROOT}/single.txt`;
    const result = (await agenticFileInfo(remoteFile)) as Record<string, unknown>;
    expect(result.path).toBe(remoteFile);
    expect(result.servedBy).toBe("remote");
    expect(result.totalRequested).toBeUndefined();
  });

  it("still enforces batch limits before routing", async () => {
    const tooMany = Array.from({ length: 21 }, (_, index) => `${REMOTE_ROOT}/f${index}.txt`);
    const result = (await agenticFileInfo(tooMany)) as { error?: string };
    expect(result.error).toMatch(/Maximum 20 paths/);

    const empty = (await agenticFileInfo([])) as { error?: string };
    expect(empty.error).toMatch(/non-empty/);
  });
});
