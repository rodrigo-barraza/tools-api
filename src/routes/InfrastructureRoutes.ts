// ─── Infrastructure Routes ──────────────────────────────────
// Agent-facing endpoints for infrastructure observability.
// Proxies to portal-service for service health, container
// diagnostics, and log retrieval.

import { Router, Request, Response } from "express";
import { asyncHandler } from "@rodrigo-barraza/utilities-library/express";
import {
  fetchServiceStatuses,
  fetchContainerStats,
  fetchContainerMetrics,
  fetchContainerHistory,
  fetchSystemInfo,
  fetchDevices,
  fetchContainerLogs,
  fetchAllContainerLogs,
  isPortalConfigured,
} from "../fetchers/PortalFetcher.ts";

const router = Router();

// ─── GET /infrastructure/status ────────────────────────────────
// Actions: services, devices, summary

router.get(
  "/status",
  asyncHandler(async (request: Request, response: Response) => {
    const action = request.query.action as string | undefined;

    if (!action) {
      return response.status(400).json({
        error: "Missing required parameter: action",
        validActions: ["services", "devices", "summary"],
      });
    }

    switch (action) {
      case "services": {
        const serviceData = await fetchServiceStatuses() as Record<string, unknown>;
        const serviceList = (serviceData.services || []) as Array<Record<string, unknown>>;
        response.json({
          action: "services",
          count: serviceList.length,
          services: serviceList.map((service: Record<string, unknown>) => ({
            id: service.id,
            name: service.name,
            url: service.url,
            projectType: service.projectType,
            device: service.device,
            domain: service.domain,
            healthy: service.healthy,
            responseTimeMs: service.responseTimeMs,
            error: service.error,
            checkedAt: service.checkedAt,
            deployTier: service.deployTier,
            essential: service.essential,
            dockerProject: service.dockerProject,
            dependsOn: service.dependsOn,
          })),
        });
        break;
      }

      case "devices": {
        const deviceData = await fetchDevices() as Record<string, unknown>;
        response.json({
          action: "devices",
          ...(deviceData as object),
        });
        break;
      }

      case "summary": {
        const serviceData = await fetchServiceStatuses() as Record<string, unknown>;
        const serviceList = (serviceData.services || []) as Array<Record<string, unknown>>;
        const deviceData = await fetchDevices() as Record<string, unknown>;
        const deviceList = (deviceData.devices || []) as Array<Record<string, unknown>>;

        const healthyServiceCount = serviceList.filter(
          (service: Record<string, unknown>) => service.healthy === true,
        ).length;
        const unhealthyServiceCount = serviceList.length - healthyServiceCount;
        const essentialServiceCount = serviceList.filter(
          (service: Record<string, unknown>) => service.essential === true,
        ).length;
        const essentialHealthyCount = serviceList.filter(
          (service: Record<string, unknown>) => service.essential === true && service.healthy === true,
        ).length;

        response.json({
          action: "summary",
          totalServices: serviceList.length,
          healthyServices: healthyServiceCount,
          unhealthyServices: unhealthyServiceCount,
          essentialServices: essentialServiceCount,
          essentialHealthy: essentialHealthyCount,
          totalDevices: deviceList.length,
          unhealthyServiceNames: serviceList
            .filter((service: Record<string, unknown>) => service.healthy !== true)
            .map((service: Record<string, unknown>) => service.name),
        });
        break;
      }

      default:
        response.status(400).json({
          error: `Unknown action: ${action}`,
          validActions: ["services", "devices", "summary"],
        });
    }
  }, "Infrastructure_Status"),
);

// ─── GET /infrastructure/containers ────────────────────────────
// Actions: stats, metrics, history, system

router.get(
  "/containers",
  asyncHandler(async (request: Request, response: Response) => {
    const action = request.query.action as string | undefined;
    const containerFilter = request.query.container as string | undefined;
    const deviceFilter = request.query.device as string | undefined;

    if (!action) {
      return response.status(400).json({
        error: "Missing required parameter: action",
        validActions: ["stats", "metrics", "history", "system"],
      });
    }

    switch (action) {
      case "stats": {
        const statsData = await fetchContainerStats(deviceFilter) as Record<string, unknown>;
        let containerList = (statsData.containers || []) as Array<Record<string, unknown>>;

        if (containerFilter) {
          containerList = containerList.filter(
            (container: Record<string, unknown>) =>
              (container.name as string)?.toLowerCase().includes(containerFilter.toLowerCase()),
          );
        }

        response.json({
          action: "stats",
          count: containerList.length,
          fetchedAt: statsData.fetchedAt,
          containers: containerList,
        });
        break;
      }

      case "metrics": {
        const range = (request.query.range as string) || "1h";
        const limit = request.query.limit
          ? parseInt(request.query.limit as string, 10)
          : 120;

        const metricsData = await fetchContainerMetrics({
          container: containerFilter,
          device: deviceFilter,
          range,
          limit,
        });

        response.json({
          action: "metrics",
          ...(metricsData as object),
        });
        break;
      }

      case "history": {
        const historyData = await fetchContainerHistory(deviceFilter);
        response.json({
          action: "history",
          ...(historyData as object),
        });
        break;
      }

      case "system": {
        const systemData = await fetchSystemInfo(deviceFilter);
        response.json({
          action: "system",
          data: systemData,
        });
        break;
      }

      default:
        response.status(400).json({
          error: `Unknown action: ${action}`,
          validActions: ["stats", "metrics", "history", "system"],
        });
    }
  }, "Infrastructure_Containers"),
);

// ─── GET /infrastructure/logs ──────────────────────────────────

router.get(
  "/logs",
  asyncHandler(async (request: Request, response: Response) => {
    const containerName = request.query.container as string | undefined;
    const deviceFilter = request.query.device as string | undefined;
    const tailString = request.query.tail as string | undefined;
    const levelFilter = request.query.level as string | undefined;
    const searchFilter = request.query.search as string | undefined;
    const sinceFilter = request.query.since as string | undefined;

    const tailCount = tailString ? parseInt(tailString, 10) : undefined;

    if (!containerName) {
      const aggregatedSnapshot = await fetchAllContainerLogs({
        device: deviceFilter,
        tail: tailCount,
        level: levelFilter,
        search: searchFilter,
        since: sinceFilter,
      });

      return response.json(aggregatedSnapshot);
    }

    const logSnapshot = await fetchContainerLogs(containerName, {
      device: deviceFilter,
      tail: tailCount,
      level: levelFilter,
      search: searchFilter,
      since: sinceFilter,
    });

    response.json(logSnapshot);
  }, "Infrastructure_Logs"),
);

// ─── Health Export ──────────────────────────────────────────────

export function getInfrastructureHealth() {
  return {
    portalService: isPortalConfigured() ? "configured" : "not configured (PORTAL_SERVICE_URL missing)",
  };
}

export default router;
