import { describe, it, expect } from "vitest";

import {
  groupChangedFiles,
  classifyFile,
  extractImportSpecifiers,
  type ChangedFileInfo,
} from "../AgenticCommitSplitService.ts";

function file(path: string, status = "M"): ChangedFileInfo {
  return { path, status, kind: classifyFile(path) };
}

describe("classifyFile", () => {
  it("classifies sources, tests, docs, and lockfiles", () => {
    expect(classifyFile("src/services/Engine.ts")).toBe("source");
    expect(classifyFile("src/services/__tests__/Engine.test.ts")).toBe("test");
    expect(classifyFile("tests/integration.py")).toBe("test");
    expect(classifyFile("docs/README.md")).toBe("docs");
    expect(classifyFile("CHANGELOG.md")).toBe("docs");
    expect(classifyFile("pnpm-lock.yaml")).toBe("lockfile");
    expect(classifyFile("Cargo.lock")).toBe("lockfile");
  });
});

describe("extractImportSpecifiers", () => {
  it("extracts ES, CJS, and Python import specifiers", () => {
    const content = [
      'import { a } from "./alpha.ts";',
      'const b = require("../beta");',
      "from mypkg.helpers import thing",
      "import os",
    ].join("\n");
    const specifiers = extractImportSpecifiers(content);
    expect(specifiers).toContain("./alpha.ts");
    expect(specifiers).toContain("../beta");
    expect(specifiers).toContain("mypkg.helpers");
  });
});

describe("groupChangedFiles heuristic", () => {
  it("groups import-connected files, orders source before tests and docs, and appends lockfiles to their manifest's commit", () => {
    const files = [
      file("src/engine/Engine.ts"),
      file("src/engine/Physics.ts"),
      file("src/ui/Panel.tsx"),
      file("src/ui/Panel.css"),
      file("src/engine/__tests__/Engine.test.ts"),
      file("docs/architecture.md"),
      file("package.json"),
      file("pnpm-lock.yaml"),
    ];
    const edges: Array<[string, string]> = [
      // Engine imports Physics — one commit set
      ["src/engine/Engine.ts", "src/engine/Physics.ts"],
      // The test imports the engine — rides with the source commit
      ["src/engine/__tests__/Engine.test.ts", "src/engine/Engine.ts"],
    ];

    const groups = groupChangedFiles(files, edges);

    // Engine + Physics + its test form one group
    const engineGroup = groups.find((group) =>
      group.files.includes("src/engine/Engine.ts"),
    )!;
    expect(engineGroup.files).toEqual([
      "src/engine/Engine.ts",
      "src/engine/Physics.ts",
      "src/engine/__tests__/Engine.test.ts",
    ]);

    // Panel.tsx and Panel.css share a directory — path proximity merges them
    const uiGroup = groups.find((group) =>
      group.files.includes("src/ui/Panel.tsx"),
    )!;
    expect(uiGroup.files).toContain("src/ui/Panel.css");

    // The lockfile rides with the group that carries package.json
    const manifestGroup = groups.find((group) =>
      group.files.includes("package.json"),
    )!;
    expect(manifestGroup.files).toContain("pnpm-lock.yaml");

    // Docs-only group comes last; source-bearing groups come first
    const lastGroup = groups[groups.length - 1];
    expect(lastGroup.files).toEqual(["docs/architecture.md"]);
    expect(groups[0].kinds).toContain("source");

    // Every changed file lands in exactly one commit
    const allFiles = groups.flatMap((group) => group.files).sort();
    expect(allFiles).toEqual(files.map((changed) => changed.path).sort());
  });

  it("orders a test-only group after source groups but before docs-only", () => {
    const files = [
      file("src/a.ts"),
      file("tests/standalone.test.ts"),
      file("docs/notes.md"),
    ];
    const groups = groupChangedFiles(files, []);

    expect(groups).toHaveLength(3);
    expect(groups[0].files).toEqual(["src/a.ts"]);
    expect(groups[1].files).toEqual(["tests/standalone.test.ts"]);
    expect(groups[2].files).toEqual(["docs/notes.md"]);
    expect(groups[1].message).toMatch(/^test:/);
    expect(groups[2].message).toMatch(/^docs:/);
  });

  it("gives an orphan lockfile its own chore commit when nothing else changed", () => {
    const groups = groupChangedFiles([file("pnpm-lock.yaml")], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].files).toEqual(["pnpm-lock.yaml"]);
    expect(groups[0].message).toMatch(/^chore:/);
  });

  it("is deterministic for the same input", () => {
    const files = [
      file("src/z.ts"),
      file("src/a.ts"),
      file("lib/util.ts"),
    ];
    const first = groupChangedFiles(files, [["src/z.ts", "lib/util.ts"]]);
    const second = groupChangedFiles(files, [["src/z.ts", "lib/util.ts"]]);
    expect(first).toEqual(second);
  });
});
