// ────────────────────────────────────────────────────────────
// Tool Definitions — Energy
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand, fieldsParam as fieldsParamImport } from "./utils.ts";
import { FIELDS } from "./fields.ts";

export function getEnergyTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  const fieldsParam = (fieldEnum: string[]) => fieldsParamImport(translate, fieldEnum);

  return [
  {
    name: "get_energy_indicators",
    dataSource: onDemand("EIA (U.S. Energy Information Administration)"),
    description: translate("get_energy_indicators.description"),
    endpoint: { path: "/energy/indicators" },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.ENERGY_INDICATORS),
      },
    },
    display: {
      activeVerb: "Fetching energy indicators",
      completedVerb: "Fetched energy indicators",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
  {
    name: "get_energy_catalog",
    dataSource: onDemand("EIA (U.S. Energy Information Administration)"),
    description: translate("get_energy_catalog.description"),
    endpoint: {
      path: "/energy/browse",
      queryParams: ["route"],
    },
    parameters: {
      type: "object",
      properties: {
        route: {
          type: "string",
          description: translate("get_energy_catalog.params.route"),
        },
        ...fieldsParam(FIELDS.EIA_BROWSE),
      },
    },
    display: {
      activeVerb: "Browsing energy catalog",
      completedVerb: "Browsed energy catalog",
      subjectParam: "route",
      subjectFormat: "full",
    },
  },
  {
    name: "get_energy_facets",
    dataSource: onDemand("EIA (U.S. Energy Information Administration)"),
    description: translate("get_energy_facets.description"),
    endpoint: {
      path: "/energy/facets",
      queryParams: ["route", "facetId"],
    },
    parameters: {
      type: "object",
      properties: {
        route: {
          type: "string",
          description: translate("get_energy_facets.params.route"),
        },
        facetId: {
          type: "string",
          description: translate("get_energy_facets.params.facetId"),
        },
        ...fieldsParam(FIELDS.EIA_FACETS),
      },
      required: ["route", "facetId"],
    },
    display: {
      activeVerb: "Fetching energy facets",
      completedVerb: "Fetched energy facets",
      subjectParam: "facetId",
      subjectFormat: "full",
    },
  },
  {
    name: "search_energy",
    dataSource: onDemand("EIA (U.S. Energy Information Administration)"),
    description: translate("search_energy.description"),
    endpoint: {
      path: "/energy/data",
      queryParams: [
        "route",
        "frequency",
        "start",
        "end",
        "sort",
        "length",
        "offset",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        route: {
          type: "string",
          description: translate("search_energy.params.route"),
        },
        frequency: {
          type: "string",
          description: translate("search_energy.params.frequency"),
        },
        start: {
          type: "string",
          description: translate("search_energy.params.start"),
        },
        end: {
          type: "string",
          description: translate("search_energy.params.end"),
        },
        sort: {
          type: "string",
          description: translate("search_energy.params.sort"),
        },
        length: {
          type: "integer",
          description: translate("search_energy.params.length"),
        },
        offset: {
          type: "integer",
          description: translate("search_energy.params.offset"),
        },
      },
      required: ["route"],
    },
    display: {
      activeVerb: "Searching energy database",
      completedVerb: "Searched energy database",
      subjectParam: "route",
      subjectFormat: "full",
    },
  },
  {
    name: "get_electricity_retail_sales",
    dataSource: onDemand("EIA (U.S. Energy Information Administration)"),
    description: translate("get_electricity_retail_sales.description"),
    endpoint: {
      path: "/energy/electricity/retail-sales",
      queryParams: ["state", "sector", "frequency", "start", "end", "length"],
    },
    parameters: {
      type: "object",
      properties: {
        state: {
          type: "string",
          description: translate("get_electricity_retail_sales.params.state"),
        },
        sector: {
          type: "string",
          description: translate("get_electricity_retail_sales.params.sector"),
        },
        frequency: {
          type: "string",
          description: translate("get_electricity_retail_sales.params.frequency"),
        },
        start: {
          type: "string",
          description: translate("get_natural_gas_prices.params.start"),
        },
        end: {
          type: "string",
          description: translate("get_electricity_retail_sales.params.end"),
        },
        length: {
          type: "integer",
          description: translate("get_petroleum_prices.params.length"),
        },
      },
    },
    display: {
      activeVerb: "Fetching electricity sales data",
      completedVerb: "Fetched electricity sales data",
      subjectParam: "state",
      subjectFormat: "full",
    },
  },
  {
    name: "get_petroleum_prices",
    dataSource: onDemand("EIA (U.S. Energy Information Administration)"),
    description: translate("get_petroleum_prices.description"),
    endpoint: {
      path: "/energy/petroleum/prices",
      queryParams: ["product", "area", "frequency", "start", "end", "length"],
    },
    parameters: {
      type: "object",
      properties: {
        product: {
          type: "string",
          description: translate("get_petroleum_prices.params.product"),
        },
        area: {
          type: "string",
          description: translate("get_petroleum_prices.params.area"),
        },
        frequency: {
          type: "string",
          description: translate("get_petroleum_prices.params.frequency"),
        },
        start: {
          type: "string",
          description: translate("get_petroleum_prices.params.start"),
        },
        end: {
          type: "string",
          description: translate("get_petroleum_prices.params.end"),
        },
        length: {
          type: "integer",
          description: translate("get_petroleum_prices.params.length"),
        },
      },
    },
    display: {
      activeVerb: "Fetching petroleum prices",
      completedVerb: "Fetched petroleum prices",
      subjectParam: "product",
      subjectFormat: "full",
    },
  },
  {
    name: "get_natural_gas_prices",
    dataSource: onDemand("EIA (U.S. Energy Information Administration)"),
    description: translate("get_natural_gas_prices.description"),
    endpoint: {
      path: "/energy/natural-gas/prices",
      queryParams: ["process", "area", "frequency", "start", "end", "length"],
    },
    parameters: {
      type: "object",
      properties: {
        process: {
          type: "string",
          description: translate("get_natural_gas_prices.params.process"),
        },
        area: {
          type: "string",
          description: translate("get_natural_gas_prices.params.area"),
        },
        frequency: {
          type: "string",
          description: translate("get_natural_gas_prices.params.frequency"),
        },
        start: {
          type: "string",
          description: translate("get_natural_gas_prices.params.start"),
        },
        end: {
          type: "string",
          description: translate("get_petroleum_prices.params.end"),
        },
        length: {
          type: "integer",
          description: translate("get_petroleum_prices.params.length"),
        },
      },
    },
    display: {
      activeVerb: "Fetching natural gas prices",
      completedVerb: "Fetched natural gas prices",
      subjectParam: "process",
      subjectFormat: "full",
    },
  },
  ];
}
