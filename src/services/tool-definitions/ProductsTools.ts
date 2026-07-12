// ────────────────────────────────────────────────────────────
// Tool Definitions — Products
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { cached, onDemand, fieldsParam as fieldsParamImport } from "./utils.ts";
import { FIELDS } from "./fields.ts";
import {
  AMAZON_INTERVAL_MS,
  BESTBUY_CA_AVAILABILITY_INTERVAL_MS,
  COSTCO_INTERVAL_MS
} from "../../constants.ts";

export function getProductsTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  const fieldsParam = (fieldEnum: string[]) => fieldsParamImport(translate, fieldEnum);

  return [
  {
    name: "search_products",
    dataSource: cached(
      "Amazon / eBay / Etsy / ProductHunt / Costco",
      AMAZON_INTERVAL_MS,
    ),
    description: translate("search_products.description"),
    endpoint: {
      path: "/product/products/search",
      queryParams: ["q", "category", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        "q": {
          type: "string",
          description: translate("search_products.params.q"),
        },
        category: {
          type: "string",
          description: translate("search_products.params.category"),
        },
        limit: {
          type: "number",
          description: translate("search_products.params.limit"),
        },
        ...fieldsParam(FIELDS.PRODUCTS),
      },
      required: ["fields"],
    },
    display: {
      activeVerb: "Searching",
      completedVerb: "Searched",
      subjectParam: "q",
      subjectFormat: "quoted",
    },
  },
  {
    name: "get_trending_products",
    dataSource: cached(
      "Amazon / eBay / Etsy / ProductHunt / Costco",
      AMAZON_INTERVAL_MS,
    ),
    description: translate("get_trending_products.description"),
    endpoint: {
      path: "/product/products/trending",
      queryParams: ["limit"],
    },
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: translate("get_trending_products.params.limit"),
        },
        ...fieldsParam(FIELDS.PRODUCTS),
      },
      required: ["fields"],
    },
    display: {
      activeVerb: "Fetching",
      completedVerb: "Fetched",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
  {
    name: "get_watchlist_availability",
    dataSource: cached("Best Buy Canada", BESTBUY_CA_AVAILABILITY_INTERVAL_MS),
    description: translate("get_watchlist_availability.description"),
    endpoint: { path: "/product/products/availability" },
    parameters: {
      type: "object",
      properties: { ...fieldsParam(FIELDS.PRODUCT_AVAILABILITY) },
      required: ["fields"],
    },
    display: {
      activeVerb: "Checking",
      completedVerb: "Checked",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
  {
    name: "check_sku_availability",
    dataSource: onDemand("Best Buy Canada"),
    description: translate("check_sku_availability.description"),
    endpoint: {
      path: "/product/products/availability/check",
      queryParams: ["skus"],
    },
    parameters: {
      type: "object",
      properties: {
        skus: {
          type: "string",
          description: translate("check_sku_availability.params.skus"),
        },
        ...fieldsParam(FIELDS.PRODUCT_AVAILABILITY),
      },
      required: ["skus", "fields"],
    },
    display: {
      activeVerb: "Checking",
      completedVerb: "Checked",
      subjectParam: "skus",
      subjectFormat: "truncate",
    },
  },
  {
    name: "get_costco_us_products",
    dataSource: cached("Costco US", COSTCO_INTERVAL_MS),
    description: translate("get_costco_us_products.description"),
    endpoint: {
      path: "/product/products/source/costco_us",
    },
    parameters: {
      type: "object",
      properties: { ...fieldsParam(FIELDS.PRODUCTS) },
      required: ["fields"],
    },
    display: {
      activeVerb: "Fetching",
      completedVerb: "Fetched",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
  {
    name: "get_costco_ca_products",
    dataSource: cached("Costco Canada", COSTCO_INTERVAL_MS),
    description: translate("get_costco_ca_products.description"),
    endpoint: {
      path: "/product/products/source/costco_ca",
    },
    parameters: {
      type: "object",
      properties: { ...fieldsParam(FIELDS.PRODUCTS) },
      required: ["fields"],
    },
    display: {
      activeVerb: "Fetching",
      completedVerb: "Fetched",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
  {
    name: "search_amazon_products",
    dataSource: cached("Amazon", AMAZON_INTERVAL_MS),
    description: translate("search_amazon_products.description"),
    endpoint: {
      path: "/product/products/source/amazon",
    },
    parameters: {
      type: "object",
      properties: { ...fieldsParam(FIELDS.PRODUCTS) },
      required: ["fields"],
    },
    display: {
      activeVerb: "Searching",
      completedVerb: "Searched",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
  ];
}
