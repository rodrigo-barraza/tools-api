import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createTestApp } from "./testApp.ts";
import torrentRoutes from "../src/routes/TorrentRoutes.ts";

// ─── Mocks ──────────────────────────────────────────────────

const mockTorrents = [
  { hash: "abc123", name: "ubuntu-24.04.iso", state: "downloading", progress: 0.45, size: 4_500_000_000 },
  { hash: "def456", name: "libre-office.tar.gz", state: "seeding", progress: 1.0, size: 300_000_000 },
];

const mockSearchResults = {
  query: "ubuntu",
  resultCount: 2,
  results: [
    { fileName: "ubuntu-24.04.iso", fileSize: 4_500_000_000, seeders: 1500, leechers: 200, siteUrl: "https://example.com" },
    { fileName: "ubuntu-22.04.iso", fileSize: 3_800_000_000, seeders: 800, leechers: 50, siteUrl: "https://example.com" },
  ],
};

const mockPlugins = [
  { name: "piratebay", enabled: true, version: "2.0" },
  { name: "kickass", enabled: false, version: "1.5" },
];

const mockTransferInfo = {
  downloadSpeed: 1_500_000,
  uploadSpeed: 500_000,
  totalDownloaded: 50_000_000_000,
  totalUploaded: 25_000_000_000,
  connectionStatus: "connected",
};

vi.mock("../src/services/QBittorrentService.ts", () => ({
  search: vi.fn(async () => mockSearchResults),
  addTorrent: vi.fn(async (_url: string) => mockTorrents),
  listTorrents: vi.fn(async () => mockTorrents),
  pauseTorrents: vi.fn(async () => mockTorrents),
  resumeTorrents: vi.fn(async () => mockTorrents),
  deleteTorrents: vi.fn(async () => [mockTorrents[0]]),
  getPlugins: vi.fn(async () => mockPlugins),
  installPlugin: vi.fn(async () => mockPlugins),
  enablePlugin: vi.fn(async () => mockPlugins),
  updatePlugins: vi.fn(async () => mockPlugins),
  getTransferInfo: vi.fn(async () => mockTransferInfo),
  clearAuthState: vi.fn(),
  isHealthy: vi.fn(async () => ({ healthy: true, version: "4.6.1" })),
}));

const app = createTestApp("/torrent", torrentRoutes);

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════
//  GET /torrent/search
// ═══════════════════════════════════════════════════════════════

describe("GET /torrent/search", () => {
  it("returns 400 when query is missing", async () => {
    const response = await request(app).get("/torrent/search");
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("q");
  });

  it("searches for torrents", async () => {
    const response = await request(app).get("/torrent/search?q=ubuntu");
    expect(response.status).toBe(200);
    expect(response.body.query).toBe("ubuntu");
    expect(response.body.resultCount).toBe(2);
    expect(response.body.results).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════
//  POST /torrent/download
// ═══════════════════════════════════════════════════════════════

describe("POST /torrent/download", () => {
  it("returns 400 when URL is missing", async () => {
    const response = await request(app)
      .post("/torrent/download")
      .send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("url");
  });

  it("adds a torrent via magnet link", async () => {
    const response = await request(app)
      .post("/torrent/download")
      .send({ magnetUrl: "magnet:?xt=urn:btih:abc123" });
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(2);
    expect(response.body.url).toBe("magnet:?xt=urn:btih:abc123");
  });
});

// ═══════════════════════════════════════════════════════════════
//  GET /torrent/status
// ═══════════════════════════════════════════════════════════════

describe("GET /torrent/status", () => {
  it("lists all torrents", async () => {
    const response = await request(app).get("/torrent/status");
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(2);
    expect(response.body.torrents).toHaveLength(2);
    expect(response.body.torrents[0].name).toBe("ubuntu-24.04.iso");
  });
});

// ═══════════════════════════════════════════════════════════════
//  POST /torrent/pause, /resume, /delete
// ═══════════════════════════════════════════════════════════════

describe("POST /torrent/pause", () => {
  it("pauses torrents", async () => {
    const response = await request(app)
      .post("/torrent/pause")
      .send({ hashes: "abc123|def456" });
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(2);
  });
});

describe("POST /torrent/resume", () => {
  it("resumes torrents", async () => {
    const response = await request(app)
      .post("/torrent/resume")
      .send({ hashes: "abc123" });
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(2);
  });
});

describe("POST /torrent/delete", () => {
  it("returns 400 when hashes is missing", async () => {
    const response = await request(app)
      .post("/torrent/delete")
      .send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("hashes");
  });

  it("deletes torrents", async () => {
    const response = await request(app)
      .post("/torrent/delete")
      .send({ hashes: "abc123", deleteFiles: true });
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
//  Plugins — GET /torrent/plugins, POST install/enable/update
// ═══════════════════════════════════════════════════════════════

describe("GET /torrent/plugins", () => {
  it("lists all plugins", async () => {
    const response = await request(app).get("/torrent/plugins");
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(2);
    expect(response.body.plugins[0].name).toBe("piratebay");
  });
});

describe("POST /torrent/plugins/install", () => {
  it("returns 400 when URL is missing", async () => {
    const response = await request(app)
      .post("/torrent/plugins/install")
      .send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("url");
  });

  it("installs a plugin", async () => {
    const response = await request(app)
      .post("/torrent/plugins/install")
      .send({ url: "https://example.com/plugin.py" });
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(2);
  });
});

describe("POST /torrent/plugins/enable", () => {
  it("returns 400 when names is missing", async () => {
    const response = await request(app)
      .post("/torrent/plugins/enable")
      .send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("names");
  });

  it("enables plugins", async () => {
    const response = await request(app)
      .post("/torrent/plugins/enable")
      .send({ names: "piratebay|kickass", enable: true });
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(2);
  });
});

describe("POST /torrent/plugins/update", () => {
  it("updates all plugins", async () => {
    const response = await request(app)
      .post("/torrent/plugins/update")
      .send({});
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════
//  GET /torrent/transfer
// ═══════════════════════════════════════════════════════════════

describe("GET /torrent/transfer", () => {
  it("returns transfer info", async () => {
    const response = await request(app).get("/torrent/transfer");
    expect(response.status).toBe(200);
    expect(response.body.downloadSpeed).toBe(1_500_000);
    expect(response.body.uploadSpeed).toBe(500_000);
    expect(response.body.connectionStatus).toBe("connected");
  });
});

// ═══════════════════════════════════════════════════════════════
//  GET /torrent — Unified Dispatcher
// ═══════════════════════════════════════════════════════════════

describe("GET /torrent (unified dispatcher)", () => {
  it("returns 400 when action is missing", async () => {
    const response = await request(app).get("/torrent");
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("action");
  });

  it("returns 400 for unknown action", async () => {
    const response = await request(app).get("/torrent?action=bogus");
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Unknown action");
  });

  it("dispatches action=search", async () => {
    const response = await request(app).get(
      "/torrent?action=search&q=ubuntu",
    );
    expect(response.status).toBe(200);
    expect(response.body.query).toBe("ubuntu");
  });

  it("returns 400 for action=search without query", async () => {
    const response = await request(app).get("/torrent?action=search");
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("q");
  });

  it("dispatches action=status", async () => {
    const response = await request(app).get("/torrent?action=status");
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(2);
  });

  it("dispatches action=plugins", async () => {
    const response = await request(app).get("/torrent?action=plugins");
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(2);
  });

  it("dispatches action=transfer", async () => {
    const response = await request(app).get("/torrent?action=transfer");
    expect(response.status).toBe(200);
    expect(response.body.downloadSpeed).toBe(1_500_000);
  });
});

// ═══════════════════════════════════════════════════════════════
//  POST /torrent/reset-auth
// ═══════════════════════════════════════════════════════════════

describe("POST /torrent/reset-auth", () => {
  it("clears auth state", async () => {
    const response = await request(app)
      .post("/torrent/reset-auth")
      .send({});
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toContain("cleared");
  });
});
