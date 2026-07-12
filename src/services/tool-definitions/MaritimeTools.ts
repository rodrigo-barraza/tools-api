// ────────────────────────────────────────────────────────────
// Tool Definitions — Maritime
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { fieldsParam as fieldsParamImport } from "./utils.ts";
import { FIELDS } from "./fields.ts";

export function getMaritimeTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  const fieldsParam = (fieldEnum: string[]) => fieldsParamImport(translate, fieldEnum);

  return [
  {
    name: "get_tracked_vessels",
    dataSource: { type: "realtime", provider: "AIS Stream (aisstream.io)" },
    description: translate("get_tracked_vessels.description"),
    endpoint: {
      path: "/maritime/vessels",
      queryParams: ["limit"],
    },
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: translate("get_vessels_in_area.params.limit"),
        },
        ...fieldsParam(FIELDS.VESSELS),
      },
    },
    display: {
      activeVerb: "Fetching tracked vessels",
      completedVerb: "Fetched tracked vessels",
      subjectParam: "limit",
      subjectFormat: "full",
    },
  },
  {
    name: "get_vessel_by_mmsi",
    dataSource: { type: "realtime", provider: "AIS Stream (aisstream.io)" },
    description: translate("get_vessel_by_mmsi.description"),
    endpoint: {
      path: "/maritime/vessels/:mmsi",
      pathParams: ["mmsi"],
    },
    parameters: {
      type: "object",
      properties: {
        mmsi: {
          type: "string",
          description: translate("get_vessel_by_mmsi.params.mmsi"),
        },
        ...fieldsParam(FIELDS.VESSELS),
      },
      required: ["mmsi"],
    },
    display: {
      activeVerb: "Fetching vessel by MMSI",
      completedVerb: "Fetched vessel by MMSI",
      subjectParam: "mmsi",
      subjectFormat: "full",
    },
  },
  {
    name: "search_vessels",
    dataSource: { type: "realtime", provider: "AIS Stream (aisstream.io)" },
    description: translate("search_vessels.description"),
    endpoint: {
      path: "/maritime/search",
      queryParams: ["q", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        "q": {
          type: "string",
          description: translate("search_vessels.params.q"),
        },
        limit: {
          type: "integer",
          description: translate("search_vessels.params.limit"),
        },
        ...fieldsParam(FIELDS.VESSELS),
      },
      required: ["q"],
    },
    display: {
      activeVerb: "Searching vessels for",
      completedVerb: "Searched vessels for",
      subjectParam: "q",
      subjectFormat: "quoted",
    },
  },
  {
    name: "get_vessels_in_area",
    dataSource: { type: "realtime", provider: "AIS Stream (aisstream.io)" },
    description: translate("get_vessels_in_area.description"),
    endpoint: {
      path: "/maritime/area",
      queryParams: ["minLat", "maxLat", "minLng", "maxLng", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        minLat: {
          type: "number",
          description: translate("get_vessels_in_area.params.minLat"),
        },
        maxLat: {
          type: "number",
          description: translate("get_vessels_in_area.params.maxLat"),
        },
        minLng: {
          type: "number",
          description: translate("get_vessels_in_area.params.minLng"),
        },
        maxLng: {
          type: "number",
          description: translate("get_vessels_in_area.params.maxLng"),
        },
        limit: {
          type: "integer",
          description: translate("get_vessels_in_area.params.limit"),
        },
        ...fieldsParam(FIELDS.VESSELS),
      },
      required: ["minLat", "maxLat", "minLng", "maxLng"],
    },
    display: {
      activeVerb: "Fetching vessels in area",
      completedVerb: "Fetched vessels in area",
      subjectParam: "limit",
      subjectFormat: "full",
    },
  },
  {
    name: "get_ais_messages",
    dataSource: { type: "realtime", provider: "AIS Stream (aisstream.io)" },
    description: translate("get_ais_messages.description"),
    endpoint: {
      path: "/maritime/messages",
      queryParams: ["limit", "type"],
    },
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: translate("get_ais_messages.params.limit"),
        },
        type: {
          type: "string",
          description: translate("get_ais_messages.params.type"),
        },
        ...fieldsParam(FIELDS.AIS_MESSAGES),
      },
    },
    display: {
      activeVerb: "Fetching AIS messages",
      completedVerb: "Fetched AIS messages",
      subjectParam: "type",
      subjectFormat: "full",
    },
  },
  ];
}
