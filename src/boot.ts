// ─── Boot Sequence ──────────────────────────────────────────

import { bootstrapEnv } from "@rodrigo-barraza/utilities-library/vault";

await bootstrapEnv();

await import("./server.ts");
