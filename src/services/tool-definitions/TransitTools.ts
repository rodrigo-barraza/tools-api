// ────────────────────────────────────────────────────────────
// Tool Definitions — Transit
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand, fieldsParam as fieldsParamImport } from "./utils.ts";
import { FIELDS } from "./fields.ts";

export function getTransitTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  const fieldsParam = (fieldEnum: string[]) => fieldsParamImport(translate, fieldEnum);

  return [
  {
    name: "get_translink_next_bus",
    dataSource: onDemand("TransLink RTTI"),
    description: translate("get_translink_next_bus.description"),
    endpoint: {
      path: "/transit/nextbus/:stopNo",
      pathParams: ["stopNo"],
      queryParams: ["route"],
    },
    parameters: {
      type: "object",
      properties: {
        stopNo: {
          type: "number",
          description: translate("get_translink_next_bus.params.stopNo"),
        },
        route: {
          type: "string",
          description: translate("get_translink_next_bus.params.route"),
        },
        ...fieldsParam(FIELDS.NEXT_BUS),
      },
      required: ["stopNo"],
    },
    display: {
      activeVerb: "Checking next bus for stop",
      completedVerb: "Checked next bus for stop",
      subjectParam: "stopNo",
      subjectFormat: "full",
    },
  },
  {
    name: "get_translink_stop_info",
    dataSource: onDemand("TransLink RTTI"),
    description: translate("get_translink_stop_info.description"),
    endpoint: {
      path: "/transit/stops/:stopNo",
      pathParams: ["stopNo"],
    },
    parameters: {
      type: "object",
      properties: {
        stopNo: {
          type: "number",
          description: translate("get_translink_stop_info.params.stopNo"),
        },
        ...fieldsParam(FIELDS.STOP_INFO),
      },
      required: ["stopNo"],
    },
    display: {
      activeVerb: "Fetching stop info for stop",
      completedVerb: "Fetched stop info for stop",
      subjectParam: "stopNo",
      subjectFormat: "full",
    },
  },
  {
    name: "search_translink_stops_nearby",
    dataSource: onDemand("TransLink RTTI"),
    description: translate("search_translink_stops_nearby.description"),
    endpoint: {
      path: "/transit/stops/nearby",
      queryParams: ["lat", "lng", "radius"],
    },
    parameters: {
      type: "object",
      properties: {
        lat: {
          type: "number",
          description: translate("search_translink_stops_nearby.params.lat"),
        },
        lng: {
          type: "number",
          description: translate("search_translink_stops_nearby.params.lng"),
        },
        radius: {
          type: "number",
          description: translate("search_translink_stops_nearby.params.radius"),
        },
        ...fieldsParam(FIELDS.NEARBY_STOPS),
      },
    },
    display: {
      activeVerb: "Searching nearby transit stops",
      completedVerb: "Searched nearby transit stops",
      subjectParam: "radius",
      subjectFormat: "full",
    },
  },
  {
    name: "get_translink_route_info",
    dataSource: onDemand("TransLink RTTI"),
    description: translate("get_translink_route_info.description"),
    endpoint: {
      path: "/transit/routes/:routeNo",
      pathParams: ["routeNo"],
    },
    parameters: {
      type: "object",
      properties: {
        routeNo: {
          type: "string",
          description: translate("get_translink_route_info.params.routeNo"),
        },
        ...fieldsParam(FIELDS.ROUTE_INFO),
      },
      required: ["routeNo"],
    },
    display: {
      activeVerb: "Fetching route info for route",
      completedVerb: "Fetched route info for route",
      subjectParam: "routeNo",
      subjectFormat: "full",
    },
  },
  {
    name: "get_flight_status",
    dataSource: onDemand("AviationStack"),
    description: translate("get_flight_status.description"),
    endpoint: {
      path: "/transit/flights",
      queryParams: ["flight", "departure", "arrival", "airline", "status", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        flight: {
          type: "string",
          description: translate("get_flight_status.params.flight"),
        },
        departure: {
          type: "string",
          description: translate("get_flight_status.params.departure"),
        },
        arrival: {
          type: "string",
          description: translate("get_flight_status.params.arrival"),
        },
        airline: {
          type: "string",
          description: translate("get_flight_status.params.airline"),
        },
        status: {
          type: "string",
          enum: ["scheduled", "active", "landed", "cancelled", "incident", "diverted"],
          description: translate("get_flight_status.params.status"),
        },
        limit: {
          type: "number",
          description: translate("get_flight_status.params.limit"),
        },
      },
      required: [],
    },
    display: {
      activeVerb: "Checking flight status",
      completedVerb: "Checked flight status",
      subjectParam: "flight",
      subjectFormat: "full",
    },
  },
  ];
}
