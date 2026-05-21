import http from "node:http";
import express, { type Request, type Response, type NextFunction } from "express";
import logger from "./logger.ts";
import CONFIG, { applyLocation } from "./config.ts";
import { connectDB } from "./db.ts";
import { initLocation } from "./services/LocationService.ts";
import { requestLoggerMiddleware, setupRequestsCollection } from "./middleware/RequestLoggerMiddleware.ts";
import { toolCallLoggerMiddleware } from "./middleware/ToolCallLoggerMiddleware.ts";
import { fieldProjectionMiddleware } from "./middleware/FieldProjectionMiddleware.ts";
import { headerPropagationMiddleware } from "./middleware/HeaderPropagationMiddleware.ts";

// ─── Model Setup ───────────────────────────────────────────────────

import { setupEventCollection } from "./models/Event.ts";
import { setupCommodityCollection } from "./models/CommoditySnapshot.ts";
import { setupProductCollection } from "./models/Product.ts";
import { setupTrendCollection } from "./models/Trend.ts";
import { setupEarthquakeCollection } from "./models/Earthquake.ts";
import { setupNeoCollection } from "./models/Neo.ts";
import { setupSolarFlareCollection } from "./models/SolarFlare.ts";
import { setupCmeCollection } from "./models/Cme.ts";
import { setupGeomagneticStormCollection } from "./models/GeomagneticStorm.ts";
import { setupWebcamCollection } from "./models/Webcam.ts";

import { connectLuposDB, setupLuposCollections } from "./models/LuposMessage.ts";
import { setupToolCallsCollection } from "./middleware/ToolCallLoggerMiddleware.ts";
import { setupAgenticTaskCollection } from "./services/AgenticTaskService.ts";
import { setupAgenticScheduleCollection, startSchedulePoller } from "./services/AgenticSchedulerService.ts";

// ─── Routes ────────────────────────────────────────────────────────

import eventRoutes, { getEventHealth } from "./routes/EventRoutes.ts";
import financeRoutes, { getFinanceHealth } from "./routes/FinanceRoutes.ts";
import marketRoutes, { getMarketHealth } from "./routes/MarketRoutes.ts";
import productRoutes, { getProductHealth } from "./routes/ProductRoutes.ts";
import trendRoutes, { getTrendHealth } from "./routes/TrendRoutes.ts";
import weatherRoutes, { getWeatherHealth } from "./routes/WeatherRoutes.ts";
import knowledgeRoutes, {
  getKnowledgeHealth,
} from "./routes/KnowledgeRoutes.ts";
import healthRoutes, { getHealthDomainHealth } from "./routes/HealthRoutes.ts";
import transitRoutes, { getTransitHealth } from "./routes/TransitRoutes.ts";
import utilityRoutes, { getUtilityHealth } from "./routes/UtilityRoutes.ts";
import computeRoutes, { getComputeHealth } from "./routes/ComputeRoutes.ts";
import maritimeRoutes, { getMaritimeHealth } from "./routes/MaritimeRoutes.ts";
import energyRoutes, { getEnergyHealth } from "./routes/EnergyRoutes.ts";
import agenticRoutes, { getAgenticHealth } from "./routes/AgenticRoutes.ts";
import communicationRoutes, { getCommunicationHealth } from "./routes/CommunicationRoutes.ts";
import creativeRoutes, { getCreativeHealth } from "./routes/CreativeRoutes.ts";
import gamingRoutes, { getGamingHealth } from "./routes/GamingRoutes.ts";
import torrentRoutes, { getTorrentHealth } from "./routes/TorrentRoutes.ts";

import discordRoutes, { getDiscordHealth } from "./routes/DiscordRoutes.ts";
import lightsRoutes, { getLightsHealth } from "./routes/LightsRoutes.ts";
import adminRoutes, { loadUserWorkspaceRoots } from "./routes/AdminRoutes.ts";
import agentStatusRoutes from "./routes/AgentRoutes.ts";
import { mountMcpRoutes } from "./services/McpAdapter.ts";
import { initAgentWebSocket } from "./services/AgentConnectionManager.ts";

// ─── Collectors ────────────────────────────────────────────────────

import { startEventCollectors } from "./collectors/EventCollector.ts";
import { startFinanceCollectors } from "./collectors/FinanceCollector.ts";
import { startMarketCollectors } from "./collectors/MarketCollector.ts";
import { startProductCollectors } from "./collectors/ProductCollector.ts";
import { startTrendCollectors } from "./collectors/TrendCollector.ts";
import { startWeatherCollectors } from "./collectors/WeatherCollector.ts";
import { startAisStream } from "./fetchers/maritime/AisStreamFetcher.ts";

// ─── Express App ───────────────────────────────────────────────────

const app = express();

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  res.header("Access-Control-Allow-Origin", origin || "*");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Headers", "Content-Type, X-Project, X-Username, X-Agent, X-Request-Id, X-Conversation-Id, X-Iteration, X-Workspace-Id");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: "50mb" }));
app.use(requestLoggerMiddleware);
app.use(toolCallLoggerMiddleware);
app.use(fieldProjectionMiddleware);
app.use(headerPropagationMiddleware);

// ─── Mount Domain Routers ──────────────────────────────────────────

app.use("/event", eventRoutes);
app.use("/finance", financeRoutes);
app.use("/market", marketRoutes);
app.use("/product", productRoutes);
app.use("/trend", trendRoutes);
app.use("/weather", weatherRoutes);
app.use("/knowledge", knowledgeRoutes);
app.use("/health", healthRoutes);
app.use("/transit", transitRoutes);
app.use("/utility", utilityRoutes);
app.use("/compute", computeRoutes);
app.use("/maritime", maritimeRoutes);
app.use("/energy", energyRoutes);
app.use("/agentic", agenticRoutes);
app.use("/communication", communicationRoutes);
app.use("/creative", express.json({ limit: "50mb" }), creativeRoutes);
app.use("/gaming", gamingRoutes);
app.use("/torrent", torrentRoutes);

app.use("/discord", discordRoutes);
app.use("/lights", lightsRoutes);
app.use("/admin", adminRoutes);
app.use("/agents", agentStatusRoutes);
mountMcpRoutes(app);

// ─── Global Error Handler ──────────────────────────────────────────
// Defense-in-depth — catches any unhandled route errors and returns
// a structured JSON response instead of Express's default HTML page.

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(`[GlobalErrorHandler] ${err.message}`);
  if (!res.headersSent) {
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// ─── Unified Health ────────────────────────────────────────────────

app.get("/health", async (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    domains: {
      event: getEventHealth(),
      finance: getFinanceHealth(),
      market: getMarketHealth(),
      product: getProductHealth(),
      trend: getTrendHealth(),
      weather: getWeatherHealth(),
      knowledge: getKnowledgeHealth(),
      health: getHealthDomainHealth(),
      transit: getTransitHealth(),
      utility: getUtilityHealth(),
      compute: getComputeHealth(),
      maritime: getMaritimeHealth(),
      energy: getEnergyHealth(),
      agentic: getAgenticHealth(),
      communication: getCommunicationHealth(),
      creative: getCreativeHealth(),
      gaming: getGamingHealth(),
      torrent: await getTorrentHealth(),

      discord: getDiscordHealth(),
      lights: getLightsHealth(),
    },
  });
});

// ─── Startup ───────────────────────────────────────────────────────

async function start() {
  try {
    await connectDB(CONFIG.MONGODB_URI!);

    // Resolve location from IP geolocation + NOAA (cached in DB, 24h TTL)
    const location = await initLocation();
    applyLocation(location);

    logger.info(`LATITUDE ........... ${CONFIG.LATITUDE}`);
    logger.info(`LONGITUDE .......... ${CONFIG.LONGITUDE}`);
    logger.info(`TIMEZONE ........... ${CONFIG.TIMEZONE}`);
    logger.info(`RADIUS_MILES ....... ${CONFIG.RADIUS_MILES}`);
    logger.info(`TIDE_STATION_ID .... ${CONFIG.TIDE_STATION_ID}`);

    await Promise.all([
      setupEventCollection(),
      setupCommodityCollection(),
      setupProductCollection(),
      setupTrendCollection(),
      setupEarthquakeCollection(),
      setupNeoCollection(),
      setupSolarFlareCollection(),
      setupCmeCollection(),
      setupGeomagneticStormCollection(),
      setupWebcamCollection(),
      setupToolCallsCollection(),
      setupRequestsCollection(),
      setupAgenticTaskCollection(),
      setupAgenticScheduleCollection(),
    ]);

    // Connect to separate Lupos database (Discord message archive)
    await connectLuposDB(CONFIG.MONGODB_URI);
    await setupLuposCollections();

    // Load user-configured workspace roots from MongoDB
    await loadUserWorkspaceRoots();
  } catch (error: unknown) {
    logger.error(`Failed to connect to MongoDB: ${(error as Error).message}`);
    process.exit(1);
  }

  // Start all domain collectors
  startEventCollectors();
  startFinanceCollectors();
  startMarketCollectors();
  startProductCollectors();
  startTrendCollectors();
  startWeatherCollectors();

  // Start AIS Stream WebSocket (if API key is configured)
  startAisStream();

  // Start schedule poller (checks for due schedules every 60s)
  startSchedulePoller();

  const port = CONFIG.TOOLS_SERVICE_PORT;
  const httpServer = http.createServer(app);

  // Initialize workspace agent WebSocket (handles upgrade on /ws/agent)
  initAgentWebSocket(httpServer);

  httpServer.listen(port, () => {
    logger.success(`Tools API running on port ${port}`);
    logger.info(`Database: ${CONFIG.MONGODB_URI}`);
    logger.info(
      "Domains: event, finance, market, product, trend, weather, knowledge, health, transit, utility, compute, maritime, energy, agentic, communication, creative, gaming, torrent, discord, lights",
    );
    logger.info(
      "Routes: /event/*, /finance/*, /market/*, /product/*, /trend/*, /weather/*, /knowledge/*, /health/*, /transit/*, /utility/*, /compute/*, /maritime/*, /energy/*, /agentic/*, /communication/*, /creative/*, /gaming/*, /torrent/*, /discord/*, /lights/*",
    );
    logger.info("Agent WebSocket: /ws/agent");
  });
}

start();
