import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createTestApp } from "./testApp.ts";
import agentRoutes from "../src/routes/AgentRoutes.ts";
import { PassThrough } from "node:stream";

// ─── Mocks ──────────────────────────────────────────────────

const mockAgents = [
  { id: "agent-1", name: "Workstation Alpha", connectedAt: "2025-06-01T10:00:00Z" },
  { id: "agent-2", name: "Workstation Beta", connectedAt: "2025-06-02T12:00:00Z" },
];

vi.mock("../src/services/AgentConnectionManager.ts", () => ({
  getConnectedAgents: vi.fn(() => mockAgents),
}));

vi.mock("../src/services/AgentCompilerService.ts", () => ({
  default: {
    compile: vi.fn(),
    cleanBuild: vi.fn(),
  },
  CompilationTarget: {},
}));

vi.mock("../src/services/MinioService.ts", () => ({
  default: {
    statObject: vi.fn(),
    getObject: vi.fn(),
    _getClient: vi.fn(() => ({
      putObject: vi.fn(),
    })),
  },
}));

// Import the mocked module after vi.mock declarations
import MinioService from "../src/services/MinioService.ts";

const app = createTestApp("/agents", agentRoutes);

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════
//  GET /agents — List connected agents
// ═══════════════════════════════════════════════════════════════

describe("GET /agents", () => {
  it("returns all connected agents", async () => {
    const response = await request(app).get("/agents");
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(2);
    expect(response.body.agents).toHaveLength(2);
    expect(response.body.agents[0].id).toBe("agent-1");
  });
});

// ═══════════════════════════════════════════════════════════════
//  GET /agents/:id — Get specific agent
// ═══════════════════════════════════════════════════════════════

describe("GET /agents/:id", () => {
  it("returns a specific agent by ID", async () => {
    const response = await request(app).get("/agents/agent-1");
    expect(response.status).toBe(200);
    expect(response.body.id).toBe("agent-1");
    expect(response.body.name).toBe("Workstation Alpha");
  });

  it("returns 404 for a nonexistent agent", async () => {
    const response = await request(app).get("/agents/nonexistent");
    expect(response.status).toBe(404);
    expect(response.body.error).toContain("not found");
  });
});

// ═══════════════════════════════════════════════════════════════
//  GET /agents/download/agent — Download workspace agent
// ═══════════════════════════════════════════════════════════════

describe("GET /agents/download/agent", () => {
  it("returns 400 for unsupported platform", async () => {
    const response = await request(app).get(
      "/agents/download/agent?platform=solaris",
    );
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Unsupported platform");
  });

  it("serves raw .mjs file when no platform is specified", async () => {
    const agentCode = "// agent code";
    vi.mocked(MinioService.statObject).mockResolvedValueOnce({ size: agentCode.length } as never);
    const mockStream = new PassThrough();
    mockStream.end(agentCode);
    vi.mocked(MinioService.getObject).mockResolvedValueOnce(mockStream as never);

    const response = await request(app)
      .get("/agents/download/agent")
      .buffer(true);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("javascript");
    expect(response.headers["content-disposition"]).toContain("workspace-agent.mjs");
  });

  it("returns 404 when agent file is not available in MinIO", async () => {
    vi.mocked(MinioService.statObject).mockRejectedValueOnce(new Error("Object not found"));

    const response = await request(app).get("/agents/download/agent");
    expect(response.status).toBe(404);
    expect(response.body.error).toContain("not available");
  });
});

// ═══════════════════════════════════════════════════════════════
//  GET /agents/download/tray-app — Download tray app installer
// ═══════════════════════════════════════════════════════════════

describe("GET /agents/download/tray-app", () => {
  it("returns 400 when platform is missing", async () => {
    const response = await request(app).get("/agents/download/tray-app");
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("platform");
  });

  it("returns 400 for unsupported platform", async () => {
    const response = await request(app).get(
      "/agents/download/tray-app?platform=dos",
    );
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Unsupported platform");
  });

  it("serves the installer binary for a valid platform", async () => {
    const binaryPayload = Buffer.from([0x4d, 0x5a]);
    vi.mocked(MinioService.statObject).mockResolvedValueOnce({ size: binaryPayload.length } as never);
    const mockStream = new PassThrough();
    mockStream.end(binaryPayload);
    vi.mocked(MinioService.getObject).mockResolvedValueOnce(mockStream as never);

    const response = await request(app)
      .get("/agents/download/tray-app?platform=win-x64")
      .buffer(true);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/octet-stream");
    expect(response.headers["content-disposition"]).toContain("Prism Workspace Agent Setup.exe");
  });

  it("returns 404 when the installer is not in MinIO", async () => {
    vi.mocked(MinioService.statObject).mockRejectedValueOnce(new Error("Not found"));

    const response = await request(app).get(
      "/agents/download/tray-app?platform=linux-x64",
    );
    expect(response.status).toBe(404);
    expect(response.body.error).toContain("not available");
  });
});
