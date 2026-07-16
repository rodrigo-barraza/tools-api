// ────────────────────────────────────────────────────────────
// Tool Definitions — Utilities
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand, staticDataset, fieldsParam as fieldsParamImport } from "./utils.ts";
import { FIELDS } from "./fields.ts";

export function getUtilitiesTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  const fieldsParam = (fieldEnum: string[]) => fieldsParamImport(translate, fieldEnum);

  return [
  {
    name: "convert_currency",
    dataSource: onDemand("Exchange Rate API"),
    description: translate("convert_currency.description"),
    endpoint: {
      path: "/utility/currency/convert",
      queryParams: ["amount", "from", "to"],
    },
    parameters: {
      type: "object",
      properties: {
        amount: {
          type: "number",
          description: translate("convert_currency.params.amount"),
        },
        from: {
          type: "string",
          description: translate("convert_currency.params.from"),
        },
        to: {
          type: "string",
          description: translate("convert_currency.params.to"),
        },
        ...fieldsParam(FIELDS.CURRENCY_CONVERT),
      },
      required: ["from", "to"],
    },
    display: {
      activeVerb: "Converting currency from",
      completedVerb: "Converted currency from",
      subjectParam: "from",
      subjectFormat: "full",
    },
  },
  {
    name: "get_time_in_timezone",
    dataSource: onDemand("World Time API"),
    description: translate("get_time_in_timezone.description"),
    endpoint: {
      path: "/utility/timezone/:area/:location",
      pathParams: ["area", "location"],
    },
    parameters: {
      type: "object",
      properties: {
        area: {
          type: "string",
          description: translate("get_time_in_timezone.params.area"),
        },
        location: {
          type: "string",
          description: translate("get_time_in_timezone.params.location"),
        },
        ...fieldsParam(FIELDS.TIMEZONE),
      },
      required: ["area", "location"],
    },
    display: {
      activeVerb: "Fetching time in",
      completedVerb: "Fetched time in",
      subjectParam: "location",
      subjectFormat: "full",
    },
  },
  {
    name: "get_ip_info",
    dataSource: onDemand("IPinfo.io"),
    description: translate("get_ip_info.description"),
    endpoint: {
      path: "/utility/ip/:ip",
      pathParams: ["ip"],
    },
    parameters: {
      type: "object",
      properties: {
        ip: {
          type: "string",
          description: translate("get_ip_info.params.ip"),
        },
        ...fieldsParam(FIELDS.IP_GEOLOCATION),
      },
    },
    display: {
      activeVerb: "Fetching geolocation info for IP",
      completedVerb: "Fetched geolocation info for IP",
      subjectParam: "ip",
      subjectFormat: "full",
    },
  },
  {
    name: "search_nearby_places",
    dataSource: onDemand("Google Places API"),
    description: translate("search_nearby_places.description"),
    endpoint: {
      path: "/utility/places/nearby",
      queryParams: ["type", "latitude", "longitude", "radius", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: translate("search_nearby_places.params.type"),
        },
        latitude: {
          type: "number",
          description: translate("search_nearby_places.params.latitude"),
        },
        longitude: {
          type: "number",
          description: translate("search_nearby_places.params.longitude"),
        },
        radius: {
          type: "number",
          description: translate("search_nearby_places.params.radius"),
        },
        limit: {
          type: "number",
          description: translate("search_nearby_places.params.limit"),
        },
        ...fieldsParam(FIELDS.PLACES),
      },
      required: ["type"],
    },
    display: {
      activeVerb: "Searching nearby places for type",
      completedVerb: "Searched nearby places for type",
      subjectParam: "type",
      subjectFormat: "full",
    },
  },
  {
    name: "search_places",
    dataSource: onDemand("Google Places API"),
    description: translate("search_places.description"),
    endpoint: {
      path: "/utility/places/search",
      queryParams: ["q", "latitude", "longitude", "radius", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        "q": {
          type: "string",
          description: translate("search_places.params.q"),
        },
        latitude: {
          type: "number",
          description: translate("search_places.params.latitude"),
        },
        longitude: {
          type: "number",
          description: translate("search_places.params.longitude"),
        },
        radius: {
          type: "number",
          description: translate("search_places.params.radius"),
        },
        limit: {
          type: "number",
          description: translate("search_places.params.limit"),
        },
        ...fieldsParam(FIELDS.PLACES),
      },
      required: ["q"],
    },
    display: {
      activeVerb: "Searching places for",
      completedVerb: "Searched places for",
      subjectParam: "q",
      subjectFormat: "quoted",
    },
  },
  {
    name: "generate_map",
    dataSource: onDemand("Google Static Maps API"),
    description: translate("generate_map.description"),
    endpoint: {
      path: "/utility/map",
      queryParams: ["markers", "zoom", "maptype", "mapId"],
    },
    parameters: {
      type: "object",
      properties: {
        markers: {
          type: "array",
          description: translate("generate_map.params.markers"),
          items: {
            type: "object",
            properties: {
              latitude: { type: "number" },
              longitude: { type: "number" },
              label: { type: "string" },
            },
            required: ["latitude", "longitude"],
          },
        },
        mapId: {
          type: "string",
          description: translate("generate_map.params.mapId"),
        },
        zoom: {
          type: "number",
          description: translate("generate_map.params.zoom"),
        },
        maptype: {
          type: "string",
          description: translate("generate_map.params.maptype"),
          enum: ["roadmap", "satellite", "terrain", "hybrid"],
        },
      },
      required: ["markers"],
    },
    display: {
      activeVerb: "Generating map",
      completedVerb: "Generated map",
      subjectParam: "maptype",
      subjectFormat: "full",
    },
  },
  {
    name: "generate_chart",
    dataSource: onDemand("internal"),
    description: translate("generate_chart.description"),
    endpoint: {
      method: "POST",
      path: "/utility/chart",
      bodyParams: ["type", "title", "labels", "datasets", "chartId"],
    },
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: translate("generate_chart.params.type"),
          // Rendered via Apache ECharts SSR (no browser):
          // https://apache.github.io/echarts-handbook/en/how-to/cross-platform/server/
          enum: [
            "bar",
            "line",
            "pie",
            "area",
            "scatter",
            "radar",
            "heatmap",
            "candlestick",
            "funnel",
            "stacked_bar",
            "stacked_area",
            "horizontal_bar",
          ],
        },
        chartId: {
          type: "string",
          description: translate("generate_chart.params.chartId"),
        },
        title: {
          type: "string",
          description: translate("generate_chart.params.title"),
        },
        labels: {
          type: "array",
          items: { type: "string" },
          description: translate("generate_chart.params.items"),
        },
        datasets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: {
                type: "string",
                description: translate("generate_chart.params.label"),
              },
              data: {
                type: "array",
                items: {
                  anyOf: [
                    { type: "number" },
                    { type: "array", items: { type: "number" } },
                  ],
                },
                description: translate("generate_chart.params.datasets.items.params.data"),
              },
            },
            required: ["label", "data"],
          },
          description: translate("generate_chart.params.datasets"),
        },
      },
      required: ["type"],
    },
    display: {
      activeVerb: "Generating chart",
      completedVerb: "Generated chart",
      subjectParam: "title",
      subjectFormat: "quoted",
    },
  },
  {
    name: "search_airports",
    dataSource: staticDataset("OpenFlights (7,698 airports)"),
    description: translate("search_airports.description"),
    endpoint: {
      path: "/utility/airports/lookup",
      queryParams: ["action", "q", "code", "country", "lat", "lng", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("search_books.params.action"),
          enum: ["search", "code", "country", "nearest"],
        },
        "q": { type: "string", description: translate("common.params.searchQuery") },
        code: {
          type: "string",
          description: translate("search_airports.params.code"),
        },
        lat: { type: "number", description: translate("search_airports.params.lat") },
        lng: { type: "number", description: translate("search_airports.params.lng") },
        limit: { type: "number", description: translate("common.params.maxResultsDefault10") },
        country: {
          type: "string",
          description: translate("search_airports.params.country"),
        },
        fields: {
          type: "string",
          description: translate("common.params.fieldsCsv"),
        },
      },
      required: ["action"],
    },
    display: {
      activeVerb: "Searching airports",
      completedVerb: "Searched airports",
      subjectParam: "q",
      subjectFormat: "quoted",
    },
  },
  {
    name: "get_public_webcams",
    dataSource: onDemand("Municipal Open Data APIs"),
    description: translate("get_public_webcams.description"),
    endpoint: { path: "/utility/webcams", queryParams: ["city", "state", "province", "region", "country", "limit"] },
    parameters: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: translate("get_public_webcams.params.city"),
          enum: [
            // Canada
            "vancouver",
            "toronto",
            "calgary",
            "ottawa",
            "hamilton",
            "london-on",
            "kingston",
            "windsor-on",
            "kitchener",
            "barrie",
            "thunder-bay",
            "sudbury",
            "niagara",
            "mississauga",
            "edmonton",
            "red-deer",
            "lethbridge",
            "medicine-hat",
            "grande-prairie",
            "banff",
            "fort-mcmurray",
            // US
            "seattle",
            "austin",
            "baton-rouge",
            "nyc",
            "buffalo",
            "syracuse",
            "albany",
            "rochester",
            "utica",
            "binghamton",
            "ithaca",
            "washington-dc",
            "honolulu",
            "chicago",
            // UK
            "london",
          ],
        },
        state: {
          type: "string",
          description: translate("get_public_webcams.params.state"),
          enum: [
            "washington-state",
            "california",
            "oregon",
            "florida",
            "iowa",
            "michigan",
            "kentucky",
          ],
        },
        province: {
          type: "string",
          description: translate("get_public_webcams.params.province"),
          enum: [
            "quebec",
            "british-columbia",
            "queensland",
          ],
        },
        region: {
          type: "string",
          description: translate("get_public_webcams.params.region"),
          enum: [
            "long-island",
            "westchester",
            "montgomery-county-tx",
            "donegal",
          ],
        },
        country: {
          type: "string",
          description: translate("get_public_webcams.params.country"),
          enum: [
            "CA",
            "US",
            "GB",
            "DE",
            "FI",
            "IE",
            "NZ",
            "SG",
            "AU",
          ],
        },
        limit: {
          type: "integer",
          description: translate("get_public_webcams.params.limit"),
        },
        ...fieldsParam(FIELDS.WEBCAMS),
      },
    },
    display: {
      activeVerb: "Fetching public webcams",
      completedVerb: "Fetched public webcams",
      subjectParam: "city",
      subjectFormat: "full",
    },
  },
  ];
}
