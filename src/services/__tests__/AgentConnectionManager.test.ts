import { describe, it, expect } from "vitest";
import { normalizeWindowsRootPath } from "../AgentConnectionManager";

describe("normalizeWindowsRootPath", () => {
  // ── WSL UNC Paths ──────────────────────────────────────────

  describe("WSL UNC path translation (\\\\wsl.localhost\\<distro>\\...)", () => {
    it("should translate a WSL UNC path to its Linux-native equivalent", () => {
      const result = normalizeWindowsRootPath(
        "\\\\wsl.localhost\\Ubuntu-24.04\\home\\rodrigo\\development",
      );
      expect(result).toBe("/home/rodrigo/development");
    });

    it("should handle \\\\wsl$ prefix identically to \\\\wsl.localhost", () => {
      const result = normalizeWindowsRootPath(
        "\\\\wsl$\\Ubuntu-24.04\\home\\rodrigo\\development",
      );
      expect(result).toBe("/home/rodrigo/development");
    });

    it("should return root '/' when only the distro name is present", () => {
      const result = normalizeWindowsRootPath(
        "\\\\wsl.localhost\\Debian",
      );
      expect(result).toBe("/");
    });

    it("should be case-insensitive for the wsl.localhost prefix", () => {
      const result = normalizeWindowsRootPath(
        "\\\\WSL.LOCALHOST\\Ubuntu-24.04\\opt\\project",
      );
      expect(result).toBe("/opt/project");
    });

    it("should handle forward-slash variants of WSL UNC paths", () => {
      const result = normalizeWindowsRootPath(
        "//wsl.localhost/Ubuntu/home/user/project",
      );
      expect(result).toBe("/home/user/project");
    });

    it("should handle distro names with dots and hyphens", () => {
      const result = normalizeWindowsRootPath(
        "\\\\wsl.localhost\\openSUSE-Leap-15.4\\opt\\project",
      );
      expect(result).toBe("/opt/project");
    });
  });

  // ── Windows Drive-Letter Paths ─────────────────────────────

  describe("Windows drive-letter path translation (C:\\...)", () => {
    it("should translate a standard Windows path to /mnt/<drive>/...", () => {
      const result = normalizeWindowsRootPath("C:\\Users\\rodrigo\\workspace");
      expect(result).toBe("/mnt/c/Users/rodrigo/workspace");
    });

    it("should lowercase the drive letter", () => {
      const result = normalizeWindowsRootPath("D:\\projects\\code");
      expect(result).toBe("/mnt/d/projects/code");
    });

    it("should handle a drive root with no subdirectories", () => {
      const result = normalizeWindowsRootPath("C:\\");
      expect(result).toBe("/mnt/c");
    });

    it("should handle forward slashes in Windows paths", () => {
      const result = normalizeWindowsRootPath("C:/Users/rodrigo/workspace");
      expect(result).toBe("/mnt/c/Users/rodrigo/workspace");
    });

    it("should strip trailing slashes from the result", () => {
      const result = normalizeWindowsRootPath("C:\\workspace\\");
      expect(result).toBe("/mnt/c/workspace");
    });
  });

  // ── POSIX Paths (passthrough) ──────────────────────────────

  describe("POSIX path passthrough (no transformation)", () => {
    it("should return a Linux absolute path unchanged", () => {
      const result = normalizeWindowsRootPath("/home/rodrigo/development");
      expect(result).toBe("/home/rodrigo/development");
    });

    it("should return root '/' unchanged", () => {
      const result = normalizeWindowsRootPath("/");
      expect(result).toBe("/");
    });

    it("should return /workspace unchanged", () => {
      const result = normalizeWindowsRootPath("/workspace");
      expect(result).toBe("/workspace");
    });
  });
});
