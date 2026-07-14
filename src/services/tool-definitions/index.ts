// ────────────────────────────────────────────────────────────
// Entry Point for Decomposed Tool Definitions
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { getWeatherEnvironmentTools } from "./WeatherEnvironmentTools.ts";
import { getHealthTools } from "./HealthTools.ts";
import { getKnowledgeTools } from "./KnowledgeTools.ts";
import { getEventsTools } from "./EventsTools.ts";
import { getMarketsCommoditiesTools } from "./MarketsCommoditiesTools.ts";
import { getTrendsTools } from "./TrendsTools.ts";
import { getProductsTools } from "./ProductsTools.ts";
import { getFinanceTools } from "./FinanceTools.ts";
import { getCoreHarnessTools } from "./CoreHarnessTools.ts";
import { getRedditTools } from "./RedditTools.ts";
import { getMoviesTvTools } from "./MoviesTvTools.ts";
import { getTransitTools } from "./TransitTools.ts";
import { getComputeTools } from "./ComputeTools.ts";
import { getCreativeTools } from "./CreativeTools.ts";
import { getUtilitiesTools } from "./UtilitiesTools.ts";
import { getMaritimeTools } from "./MaritimeTools.ts";
import { getEnergyTools } from "./EnergyTools.ts";
import { getCoreWorkspaceTools } from "./CoreWorkspaceTools.ts";
import { getWebTools } from "./WebTools.ts";
import { getBrowserTools } from "./BrowserTools.ts";
import { getCoreTaskTools } from "./CoreTaskTools.ts";
import { getCommunicationTools } from "./CommunicationTools.ts";
import { getDiscordTools } from "./DiscordTools.ts";
import { getSmartHomeTools } from "./SmartHomeTools.ts";
import { getAgentManagementTools } from "./AgentManagementTools.ts";
import { getCoreDiscoverTools } from "./CoreDiscoverTools.ts";
import { getCoreScheduleTools } from "./CoreScheduleTools.ts";
import { getGamingTools } from "./GamingTools.ts";
import { getTorrentTools } from "./TorrentTools.ts";
import { getNetworkIntelligenceTools } from "./NetworkIntelligenceTools.ts";
import { getSecurityTools } from "./SecurityTools.ts";
import { getCalendarTools } from "./CalendarTools.ts";
import { getInfrastructureTools } from "./InfrastructureTools.ts";
import { getAnalyticsTools } from "./AnalyticsTools.ts";

export { FIELDS } from "./fields.ts";

export function createToolDefinitions(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  return [
    ...getWeatherEnvironmentTools(translate),
    ...getHealthTools(translate),
    ...getKnowledgeTools(translate),
    ...getEventsTools(translate),
    ...getMarketsCommoditiesTools(translate),
    ...getTrendsTools(translate),
    ...getProductsTools(translate),
    ...getFinanceTools(translate),
    ...getCoreHarnessTools(translate),
    ...getRedditTools(translate),
    ...getMoviesTvTools(translate),
    ...getTransitTools(translate),
    ...getComputeTools(translate),
    ...getCreativeTools(translate),
    ...getUtilitiesTools(translate),
    ...getMaritimeTools(translate),
    ...getEnergyTools(translate),
    ...getCoreWorkspaceTools(translate),
    ...getWebTools(translate),
    ...getBrowserTools(translate),
    ...getCoreTaskTools(translate),
    ...getCommunicationTools(translate),
    ...getDiscordTools(translate),
    ...getSmartHomeTools(translate),
    ...getAgentManagementTools(translate),
    ...getCoreDiscoverTools(translate),
    ...getCoreScheduleTools(translate),
    ...getGamingTools(translate),
    ...getTorrentTools(translate),
    ...getNetworkIntelligenceTools(translate),
    ...getSecurityTools(translate),
    ...getCalendarTools(translate),
    ...getInfrastructureTools(translate),
    ...getAnalyticsTools(translate),
  ];
}
