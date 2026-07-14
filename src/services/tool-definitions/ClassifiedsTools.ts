// ────────────────────────────────────────────────────────────
// Tool Definitions — Classifieds (Craigslist)
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand } from "./utils.ts";

export function getClassifiedsTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {

  return [
  {
    name: "search_craigslist",
    dataSource: onDemand("Craigslist"),
    description: translate("search_craigslist.description"),
    endpoint: {
      path: "/knowledge/craigslist/search",
      queryParams: ["q", "city", "category", "from", "to", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        "q": {
          type: "string",
          description: translate("search_craigslist.params.q"),
        },
        city: {
          type: "string",
          description: translate("search_craigslist.params.city"),
        },
        category: {
          type: "string",
          enum: ["for sale", "jobs", "housing", "services", "gigs", "autos"],
          description: translate("search_craigslist.params.category"),
        },
        from: {
          type: "string",
          description: translate("search_craigslist.params.from"),
        },
        to: {
          type: "string",
          description: translate("search_craigslist.params.to"),
        },
        limit: {
          type: "number",
          description: translate("search_craigslist.params.limit"),
        },
      },
      required: ["q", "city", "category"],
    },
    display: {
      activeVerb: "Searching Craigslist for",
      completedVerb: "Searched Craigslist for",
      subjectParam: "q",
      subjectFormat: "quoted",
    },
  },
  {
    name: "search_kijiji",
    dataSource: onDemand("Kijiji"),
    description: translate("search_kijiji.description"),
    endpoint: {
      path: "/knowledge/kijiji/search",
      queryParams: ["q", "city", "category", "from", "to", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        "q": {
          type: "string",
          description: translate("search_kijiji.params.q"),
        },
        city: {
          type: "string",
          enum: [
            "vancouver", "toronto", "calgary", "edmonton", "ottawa",
            "winnipeg", "montreal", "hamilton", "victoria", "saskatoon",
            "regina", "kelowna", "london", "kitchener", "halifax",
          ],
          description: translate("search_kijiji.params.city"),
        },
        category: {
          type: "string",
          enum: ["for sale", "jobs", "housing", "services", "gigs", "autos"],
          description: translate("search_kijiji.params.category"),
        },
        from: {
          type: "string",
          description: translate("search_craigslist.params.from"),
        },
        to: {
          type: "string",
          description: translate("search_craigslist.params.to"),
        },
        limit: {
          type: "number",
          description: translate("search_craigslist.params.limit"),
        },
      },
      required: ["q", "city", "category"],
    },
    display: {
      activeVerb: "Searching Kijiji for",
      completedVerb: "Searched Kijiji for",
      subjectParam: "q",
      subjectFormat: "quoted",
    },
  },
  {
    name: "search_autotrader",
    dataSource: onDemand("AutoTrader.ca"),
    description: translate("search_autotrader.description"),
    endpoint: {
      path: "/knowledge/autotrader/search",
      queryParams: ["q", "city", "from", "to", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        "q": {
          type: "string",
          description: translate("search_autotrader.params.q"),
        },
        city: {
          type: "string",
          enum: [
            "vancouver", "victoria", "kelowna", "kamloops", "abbotsford",
            "calgary", "edmonton", "saskatoon", "regina", "winnipeg",
            "toronto", "mississauga", "hamilton", "ottawa", "london",
            "kitchener", "windsor", "montreal", "quebec", "halifax",
            "moncton", "stjohns",
          ],
          description: translate("search_autotrader.params.city"),
        },
        from: {
          type: "string",
          description: translate("search_craigslist.params.from"),
        },
        to: {
          type: "string",
          description: translate("search_craigslist.params.to"),
        },
        limit: {
          type: "number",
          description: translate("search_craigslist.params.limit"),
        },
      },
      required: ["q", "city"],
    },
    display: {
      activeVerb: "Searching AutoTrader for",
      completedVerb: "Searched AutoTrader for",
      subjectParam: "q",
      subjectFormat: "quoted",
    },
  },
  {
    name: "search_ebay",
    dataSource: onDemand("eBay Browse API"),
    description: translate("search_ebay.description"),
    endpoint: {
      path: "/product/ebay/search",
      queryParams: ["q", "limit", "sort", "marketplace"],
    },
    parameters: {
      type: "object",
      properties: {
        "q": {
          type: "string",
          description: translate("search_ebay.params.q"),
        },
        limit: {
          type: "number",
          description: translate("search_ebay.params.limit"),
        },
        sort: {
          type: "string",
          enum: ["best_match", "price_asc", "price_desc", "newest"],
          description: translate("search_ebay.params.sort"),
        },
        marketplace: {
          type: "string",
          enum: ["EBAY_CA", "EBAY_US"],
          description: translate("search_ebay.params.marketplace"),
        },
      },
      required: ["q"],
    },
    display: {
      activeVerb: "Searching eBay for",
      completedVerb: "Searched eBay for",
      subjectParam: "q",
      subjectFormat: "quoted",
    },
  },
  {
    name: "search_etsy",
    dataSource: onDemand("Etsy API"),
    description: translate("search_etsy.description"),
    endpoint: {
      path: "/product/etsy/search",
      queryParams: ["q", "limit", "sort", "minPrice", "maxPrice"],
    },
    parameters: {
      type: "object",
      properties: {
        "q": {
          type: "string",
          description: translate("search_etsy.params.q"),
        },
        limit: {
          type: "number",
          description: translate("search_etsy.params.limit"),
        },
        sort: {
          type: "string",
          enum: ["score", "created", "price"],
          description: translate("search_etsy.params.sort"),
        },
        minPrice: {
          type: "number",
          description: translate("search_etsy.params.minPrice"),
        },
        maxPrice: {
          type: "number",
          description: translate("search_etsy.params.maxPrice"),
        },
      },
      required: ["q"],
    },
    display: {
      activeVerb: "Searching Etsy for",
      completedVerb: "Searched Etsy for",
      subjectParam: "q",
      subjectFormat: "quoted",
    },
  },
  ];
}
