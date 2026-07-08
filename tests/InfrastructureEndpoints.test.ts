import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createTestApp } from "./testApp.ts";
import infrastructureRoutes from "../src/routes/InfrastructureRoutes.ts";

// ─── Mocks ──────────────────────────────────────────────────

const mockServices = [
  { id: "svc-1", name: "prism-service", healthy: true, essential: true, responseTimeMs: 42 },
  { id: "svc-2", name: "tools-service", healthy: true, essential: true, responseTimeMs: 15 },
  { id: "svc-3", name: "beacon-service", healthy: false, essential: false, responseTimeMs: null, error: "timeout" },
];

const mockDevices = [
  { id: "dev-1", name: "sun", status: "online" },
  { id: "dev-2", name: "moon", status: "online" },
];

const mockContainers = [
  { name: "prism-service-1", cpu: 12.5, memory: 256, state: "running" },
  { name: "tools-service-1", cpu: 8.2, memory: 128, state: "running" },
  { name: "nginx-proxy", cpu: 1.0, memory: 32, state: "running" },
];

vi.mock("../src/fetchers/PortalFetcher.ts", () => ({
  fetchServiceStatuses: vi.fn(async () => ({ services: mockServices })),
  fetchDevices: vi.fn(async () => ({ devices: mockDevices })),
  fetchContainerStats: vi.fn(async () => ({
    containers: mockContainers,
    fetchedAt: "2025-06-01T10:00:00Z",
  })),
  fetchContainerMetrics: vi.fn(async () => ({
    container: "prism-service-1",
    metrics: [{ timestamp: "2025-06-01T10:00:00Z", cpu: 10, memory: 200 }],
  })),
  fetchContainerHistory: vi.fn(async () => ({
    events: [{ type: "restart", container: "tools-service-1", timestamp: "2025-06-01T09:00:00Z" }],
  })),
  fetchSystemInfo: vi.fn(async () => ({
    hostname: "sun",
    uptime: 86400,
    loadAverage: [1.2, 0.8, 0.5],
  })),
  fetchContainerLogs: vi.fn(async () => ({
    container: "prism-service-1",
    lines: ["2025-06-01 INFO Starting server", "2025-06-01 INFO Ready"],
  })),
  fetchAllContainerLogs: vi.fn(async () => ({
    containers: ["prism-service-1", "tools-service-1"],
    totalLines: 42,
  })),
  isPortalConfigured: vi.fn(() => true),
}));

const app = createTestApp("/infrastructure", infrastructureRoutes);

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════
//  GET /infrastructure/status
// ═══════════════════════════════════════════════════════════════

describe("GET /infrastructure/status", () => {
  it("returns 400 when action is missing", async () => {
    const response = await request(app).get("/infrastructure/status");
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("action");
    expect(response.body.validActions).toEqual(["services", "devices", "summary"]);
  });

  it("returns 400 for unknown action", async () => {
    const response = await request(app).get(
      "/infrastructure/status?action=bogus",
    );
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Unknown action");
  });

  it("returns service statuses for action=services", async () => {
    const response = await request(app).get(
      "/infrastructure/status?action=services",
    );
    expect(response.status).toBe(200);
    expect(response.body.action).toBe("services");
    expect(response.body.count).toBe(3);
    expect(response.body.services[0].name).toBe("prism-service");
    expect(response.body.services[0].healthy).toBe(true);
    expect(response.body.services[2].healthy).toBe(false);
  });

  it("returns device info for action=devices", async () => {
    const response = await request(app).get(
      "/infrastructure/status?action=devices",
    );
    expect(response.status).toBe(200);
    expect(response.body.action).toBe("devices");
    expect(response.body.devices).toHaveLength(2);
  });

  it("returns a summary for action=summary", async () => {
    const response = await request(app).get(
      "/infrastructure/status?action=summary",
    );
    expect(response.status).toBe(200);
    expect(response.body.action).toBe("summary");
    expect(response.body.totalServices).toBe(3);
    expect(response.body.healthyServices).toBe(2);
    expect(response.body.unhealthyServices).toBe(1);
    expect(response.body.essentialServices).toBe(2);
    expect(response.body.essentialHealthy).toBe(2);
    expect(response.body.totalDevices).toBe(2);
    expect(response.body.unhealthyServiceNames).toEqual(["beacon-service"]);
  });
});

// ═══════════════════════════════════════════════════════════════
//  GET /infrastructure/containers
// ═══════════════════════════════════════════════════════════════

describe("GET /infrastructure/containers", () => {
  it("returns 400 when action is missing", async () => {
    const response = await request(app).get("/infrastructure/containers");
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("action");
    expect(response.body.validActions).toEqual(["stats", "metrics", "history", "system"]);
  });

  it("returns 400 for unknown action", async () => {
    const response = await request(app).get(
      "/infrastructure/containers?action=bogus",
    );
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Unknown action");
  });

  it("returns container stats for action=stats", async () => {
    const response = await request(app).get(
      "/infrastructure/containers?action=stats",
    );
    expect(response.status).toBe(200);
    expect(response.body.action).toBe("stats");
    expect(response.body.count).toBe(3);
    expect(response.body.containers[0].name).toBe("prism-service-1");
  });

  it("filters container stats by container name", async () => {
    const response = await request(app).get(
      "/infrastructure/containers?action=stats&container=prism",
    );
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
    expect(response.body.containers[0].name).toContain("prism");
  });

  it("returns metrics for action=metrics", async () => {
    const response = await request(app).get(
      "/infrastructure/containers?action=metrics&container=prism-service-1",
    );
    expect(response.status).toBe(200);
    expect(response.body.action).toBe("metrics");
  });

  it("returns history for action=history", async () => {
    const response = await request(app).get(
      "/infrastructure/containers?action=history",
    );
    expect(response.status).toBe(200);
    expect(response.body.action).toBe("history");
  });

  it("returns system info for action=system", async () => {
    const response = await request(app).get(
      "/infrastructure/containers?action=system",
    );
    expect(response.status).toBe(200);
    expect(response.body.action).toBe("system");
    expect(response.body.data.hostname).toBe("sun");
    expect(response.body.data.uptime).toBe(86400);
  });
});

// ═══════════════════════════════════════════════════════════════
//  GET /infrastructure/logs
// ═══════════════════════════════════════════════════════════════

describe("GET /infrastructure/logs", () => {
  it("returns aggregated logs when no container is specified", async () => {
    const response = await request(app).get("/infrastructure/logs");
    expect(response.status).toBe(200);
    expect(response.body.containers).toBeTruthy();
    expect(response.body.totalLines).toBe(42);
  });

  it("returns logs for a specific container", async () => {
    const response = await request(app).get(
      "/infrastructure/logs?container=prism-service-1",
    );
    expect(response.status).toBe(200);
    expect(response.body.container).toBe("prism-service-1");
    expect(response.body.lines).toHaveLength(2);
  });
});
