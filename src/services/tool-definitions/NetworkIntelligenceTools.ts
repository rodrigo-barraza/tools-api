// ────────────────────────────────────────────────────────────
// Tool Definitions — Network Intelligence
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { compute } from "./utils.ts";

export function getNetworkIntelligenceTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  

  return [
  {
    name: "dns_lookup",
    dataSource: compute("dns"),
    description: translate("dns_lookup.description"),
    endpoint: {
      path: "/utility/dns/:hostname",
      pathParams: ["hostname"],
      queryParams: ["type"],
    },
    parameters: {
      type: "object",
      properties: {
        hostname: {
          type: "string",
          description: translate("dns_lookup.params.hostname"),
        },
        type: {
          type: "string",
          enum: ["A", "AAAA", "MX", "CNAME", "TXT", "NS", "SOA", "SRV", "CAA", "PTR"],
          description: translate("dns_lookup.params.type"),
        },
      },
      required: ["hostname"],
    },
    display: {
      activeVerb: "Performing DNS lookup for",
      completedVerb: "Performed DNS lookup for",
      subjectParam: "hostname",
      subjectFormat: "full",
    },
  },
  {
    name: "whois_lookup",
    dataSource: compute("whois"),
    description: translate("whois_lookup.description"),
    endpoint: {
      path: "/utility/whois/:domain",
      pathParams: ["domain"],
    },
    parameters: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: translate("whois_lookup.params.domain"),
        },
      },
      required: ["domain"],
    },
    display: {
      activeVerb: "Performing WHOIS lookup for",
      completedVerb: "Performed WHOIS lookup for",
      subjectParam: "domain",
      subjectFormat: "full",
    },
  },
  {
    name: "ssl_certificate_check",
    dataSource: compute("tls"),
    description: translate("ssl_certificate_check.description"),
    endpoint: {
      path: "/utility/ssl/:hostname",
      pathParams: ["hostname"],
      queryParams: ["port"],
    },
    parameters: {
      type: "object",
      properties: {
        hostname: {
          type: "string",
          description: translate("ssl_certificate_check.params.hostname"),
        },
        port: {
          type: "number",
          description: translate("ssl_certificate_check.params.port"),
        },
      },
      required: ["hostname"],
    },
    display: {
      activeVerb: "Checking SSL certificate validity for",
      completedVerb: "Checked SSL certificate validity for",
      subjectParam: "hostname",
      subjectFormat: "full",
    },
  },
  {
    name: "port_scan",
    dataSource: compute("tcp"),
    description: translate("port_scan.description"),
    endpoint: {
      path: "/utility/ports/:host",
      pathParams: ["host"],
      queryParams: ["ports"],
    },
    parameters: {
      type: "object",
      properties: {
        host: {
          type: "string",
          description: translate("port_scan.params.host"),
        },
        ports: {
          type: "string",
          description: translate("port_scan.params.ports"),
        },
      },
      required: ["host"],
    },
    display: {
      activeVerb: "Scanning network ports on",
      completedVerb: "Scanned network ports on",
      subjectParam: "host",
      subjectFormat: "full",
    },
  },
  {
    name: "http_headers",
    dataSource: compute("http"),
    description: translate("http_headers.description"),
    endpoint: {
      path: "/utility/headers",
      queryParams: ["url"],
    },
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: translate("http_headers.params.url"),
        },
      },
      required: ["url"],
    },
    display: {
      activeVerb: "Fetching HTTP response headers for",
      completedVerb: "Fetched HTTP response headers for",
      subjectParam: "url",
      subjectFormat: "domain",
    },
  },
  {
    name: "ping_host",
    dataSource: compute("icmp"),
    description: translate("ping_host.description"),
    endpoint: {
      path: "/utility/ping/:host",
      pathParams: ["host"],
      queryParams: ["count"],
    },
    parameters: {
      type: "object",
      properties: {
        host: {
          type: "string",
          description: translate("ping_host.params.host"),
        },
        count: {
          type: "number",
          description: translate("ping_host.params.count"),
        },
      },
      required: ["host"],
    },
    display: {
      activeVerb: "Pinging network host",
      completedVerb: "Pinged network host",
      subjectParam: "host",
      subjectFormat: "full",
    },
  },
  ];
}
