import { describe, it, expect } from "vitest";
import {
  isPrivateAddress,
  validatePublicWebUrl,
} from "../SsrfGuard.ts";

// SSRF guard (survey D2 slice): agent-controlled URLs must never
// reach loopback, LAN, or cloud-metadata address space.

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.5",
    "169.254.169.254", // cloud metadata
    "100.64.0.1", // CGNAT
    "0.0.0.0",
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "::ffff:10.0.0.1", // IPv4-mapped IPv6
    "::ffff:192.168.1.5",
  ])("blocks %s", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "142.250.72.14", "2607:f8b0::1"])(
    "allows public %s",
    (address) => {
      expect(isPrivateAddress(address)).toBe(false);
    },
  );
});

describe("validatePublicWebUrl", () => {
  it("blocks non-http protocols", async () => {
    expect((await validatePublicWebUrl("file:///etc/passwd")).ok).toBe(false);
    expect((await validatePublicWebUrl("gopher://example.com")).ok).toBe(false);
  });

  it("blocks literal private IPs without DNS", async () => {
    expect((await validatePublicWebUrl("http://192.168.1.10/admin")).ok).toBe(
      false,
    );
    expect(
      (await validatePublicWebUrl("http://169.254.169.254/latest/meta-data/"))
        .ok,
    ).toBe(false);
    expect((await validatePublicWebUrl("http://[::1]:8080/")).ok).toBe(false);
  });

  it("blocks hostnames that resolve to loopback", async () => {
    // localhost resolves to 127.0.0.1/::1 on every platform
    const verdict = await validatePublicWebUrl("http://localhost:5590/admin");
    expect(verdict.ok).toBe(false);
  });

  it("rejects malformed URLs", async () => {
    expect((await validatePublicWebUrl("not a url")).ok).toBe(false);
  });
});
