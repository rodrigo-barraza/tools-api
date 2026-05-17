# ============================================================
# Tools API — Dockerfile (multi-stage)
# ============================================================
# Tool execution hub — Express server with Playwright browser
# automation, Python interpreter, Chart.js rendering, and
# 150+ tool schemas. Uses boot.js to fetch secrets from Vault
# at startup.
# ============================================================

# ── Stage 1: Install dependencies ─────────────────────────────
FROM node:22-slim AS deps

# Native module build tools (chart.js canvas, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ git openssh-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./

# Skip Playwright's bundled browser download — we install system Chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --omit=dev

# ── Stage 2: Runtime ──────────────────────────────────────────
FROM node:22-slim

# Chromium (Playwright), Python 3 (interpreter), FFmpeg (media),
# wget (healthcheck), git (agentic git tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    python3 \
    ffmpeg \
    fonts-liberation \
    ca-certificates \
    wget \
    git \
    imagemagick \
    && rm -rf /var/lib/apt/lists/*

# Point Playwright to system Chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Non-root user — created before COPY so --chown can reference it.
# This avoids a slow `chown -R /app` over tens of thousands of files
# (node_modules + static datasets) that was timing out the build.
RUN groupadd --system --gid 1001 toolsapi && \
    useradd --system --uid 1001 --gid toolsapi toolsapi

# Copy pre-built node_modules from deps stage
COPY --chown=toolsapi:toolsapi --from=deps /app/node_modules ./node_modules

# Copy application source
COPY --chown=toolsapi:toolsapi . .

# Build TypeScript (still as root so npm scripts work; output owned via COPY)
RUN npm run build && chown -R toolsapi:toolsapi dist

USER toolsapi

EXPOSE 5590

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 -O /dev/null http://127.0.0.1:5590/health || exit 1

CMD ["node", "dist/boot.js"]
