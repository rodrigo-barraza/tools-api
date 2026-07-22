// ─── ExternalApiUsageService host classification tests ─────────────
// The global-fetch wrapper must count only genuinely external hosts:
// private/loopback addresses, configured internal endpoints, and
// non-HTTP schemes stay out of the usage buckets.

import { describe, it, expect, beforeEach } from "vitest";
import { __internal } from "../ExternalApiUsageService.ts";

const { isPrivateHostname, resolveExternalHost, recordCall, pendingBuckets, internalHosts } =
  __internal;

describe("isPrivateHostname", () => {
  it("flags loopback, RFC1918, link-local, and docker hosts", () => {
    for (const hostname of [
      "localhost",
      "host.docker.internal",
      "nas.local",
      "127.0.0.1",
      "10.0.4.20",
      "192.168.1.77",
      "172.16.0.1",
      "172.31.255.255",
      "169.254.10.10",
      "0.0.0.0",
    ]) {
      expect(isPrivateHostname(hostname), hostname).toBe(true);
    }
  });

  it("passes public hostnames and public IPs", () => {
    for (const hostname of ["api.ebay.com", "8.8.8.8", "172.15.0.1", "172.32.0.1"]) {
      expect(isPrivateHostname(hostname), hostname).toBe(false);
    }
  });
});

describe("resolveExternalHost", () => {
  it("extracts the hostname from string, URL, and Request inputs", () => {
    expect(resolveExternalHost("https://api.spotify.com/v1/search?q=x")).toBe("api.spotify.com");
    expect(resolveExternalHost(new URL("https://Finnhub.IO/api/v1/quote"))).toBe("finnhub.io");
    expect(resolveExternalHost(new Request("https://api.nasa.gov/neo"))).toBe("api.nasa.gov");
  });

  it("ignores internal, private, and non-HTTP targets", () => {
    internalHosts.add("minio.example.com");
    expect(resolveExternalHost("https://minio.example.com/bucket/key")).toBeNull();
    internalHosts.delete("minio.example.com");

    expect(resolveExternalHost("http://192.168.1.20:9000/health")).toBeNull();
    expect(resolveExternalHost("http://localhost:5000/api")).toBeNull();
    expect(resolveExternalHost("data:text/plain;base64,aGk=")).toBeNull();
    expect(resolveExternalHost("not a url")).toBeNull();
  });
});

describe("recordCall", () => {
  beforeEach(() => pendingBuckets.clear());

  it("accumulates requests and errors per host per UTC day", () => {
    recordCall("api.ebay.com", false);
    recordCall("api.ebay.com", true);
    recordCall("api.ebay.com", false);

    const today = new Date().toISOString().slice(0, 10);
    const bucket = pendingBuckets.get(`api.ebay.com|${today}`);
    expect(bucket).toMatchObject({ host: "api.ebay.com", date: today, requests: 3, errors: 1 });
  });
});
