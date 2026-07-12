// ────────────────────────────────────────────────────────────
// Tool Definitions — Core Workspace Tools
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand, compute } from "./utils.ts";

export function getCoreWorkspaceTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  

  return [
  {
    name: "read_file",
    dataSource: compute("sandboxed fs"),
    description: translate("read_file.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/file/read",
      bodyParams: ["absolutePath", "startLine", "endLine"],
    },
    parameters: {
      type: "object",
      properties: {
        absolutePath: {
          type: "string",
          description: translate("read_file.params.absolutePath"),
        },
        startLine: {
          type: "integer",
          description: translate("read_file.params.startLine"),
        },
        endLine: {
          type: "integer",
          description: translate("read_file.params.endLine"),
        },
      },
      required: ["absolutePath"],
    },
    display: {
      activeVerb: "Analyzing",
      completedVerb: "Analyzed",
      subjectParam: "absolutePath",
      subjectFormat: "basename",
      filePathParam: "absolutePath",
    },
  },
  {
    name: "write_file",
    dataSource: compute("sandboxed fs"),
    description: translate("write_file.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/file/write",
      bodyParams: ["path", "content", "createDirs"],
    },
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: translate("write_file.params.path"),
        },
        content: {
          type: "string",
          description: translate("write_file.params.content"),
        },
        createDirs: {
          type: "boolean",
          description: translate("write_file.params.createDirs"),
        },
      },
      required: ["path", "content"],
    },
    display: {
      activeVerb: "Writing",
      completedVerb: "Wrote",
      subjectParam: "path",
      subjectFormat: "basename",
      filePathParam: "path",
    },
  },
  {
    name: "replace_in_file",
    dataSource: compute("sandboxed fs"),
    description: translate("replace_in_file.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/file/str-replace",
      bodyParams: ["path", "oldString", "newString", "allowMultiple"],
    },
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: translate("replace_in_file.params.path"),
        },
        oldString: {
          type: "string",
          description: translate("replace_in_file.params.oldString"),
        },
        newString: {
          type: "string",
          description: translate("replace_in_file.params.newString"),
        },
        allowMultiple: {
          type: "boolean",
          description: translate("replace_in_file.params.allowMultiple"),
        },
      },
      required: ["path", "oldString", "newString"],
    },
    display: {
      activeVerb: "Editing",
      completedVerb: "Edited",
      subjectParam: "path",
      subjectFormat: "basename",
      filePathParam: "path",
    },
  },
  {
    name: "replace_file_block",
    dataSource: compute("sandboxed fs"),
    description: translate("replace_file_block.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/file/block-replace",
      bodyParams: [
        "path",
        "startLine",
        "endLine",
        "targetContent",
        "replacementContent",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: translate("replace_in_file.params.path"),
        },
        startLine: {
          type: "integer",
          description: translate("replace_file_block.params.startLine"),
        },
        endLine: {
          type: "integer",
          description: translate("replace_file_block.params.endLine"),
        },
        targetContent: {
          type: "string",
          description: translate("replace_file_block.params.targetContent"),
        },
        replacementContent: {
          type: "string",
          description: translate("replace_file_block.params.replacementContent"),
        },
      },
      required: [
        "path",
        "startLine",
        "endLine",
        "targetContent",
        "replacementContent",
      ],
    },
    display: {
      activeVerb: "Editing",
      completedVerb: "Edited",
      subjectParam: "path",
      subjectFormat: "basename",
      filePathParam: "path",
    },
  },
  {
    name: "replace_file_regions",
    dataSource: compute("sandboxed fs"),
    description: translate("replace_file_regions.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/file/multi-replace",
      bodyParams: ["path", "chunks"],
    },
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: translate("replace_in_file.params.path"),
        },
        chunks: {
          type: "array",
          description: translate("replace_file_regions.params.chunks"),
          items: {
            type: "object",
            properties: {
              startLine: {
                type: "integer",
                description: translate("replace_file_regions.params.chunks.items.params.startLine"),
              },
              endLine: {
                type: "integer",
                description: translate("replace_file_regions.params.chunks.items.params.endLine"),
              },
              targetContent: {
                type: "string",
                description: translate("replace_file_regions.params.chunks.items.params.targetContent"),
              },
              replacementContent: {
                type: "string",
                description: translate("replace_file_regions.params.chunks.items.params.replacementContent"),
              },
            },
            required: [
              "startLine",
              "endLine",
              "targetContent",
              "replacementContent",
            ],
          },
        },
      },
      required: ["path", "chunks"],
    },
    display: {
      activeVerb: "Editing",
      completedVerb: "Edited",
      subjectParam: "path",
      subjectFormat: "basename",
      filePathParam: "path",
    },
  },
  {
    name: "patch_file",
    dataSource: compute("sandboxed fs + diff"),
    description: translate("patch_file.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/file/patch",
      bodyParams: ["path", "patch"],
    },
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: translate("patch_file.params.path"),
        },
        patch: {
          type: "string",
          description: translate("patch_file.params.patch"),
        },
      },
      required: ["path", "patch"],
    },
    display: {
      activeVerb: "Patching",
      completedVerb: "Patched",
      subjectParam: "path",
      subjectFormat: "basename",
      filePathParam: "path",
    },
  },
  {
    name: "list_directory",
    dataSource: compute("sandboxed fs"),
    description: translate("list_directory.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/directory/list",
      bodyParams: ["path", "recursive", "maxDepth"],
    },
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: translate("list_directory.params.path"),
        },
        recursive: {
          type: "boolean",
          description: translate("list_directory.params.recursive"),
        },
        maxDepth: {
          type: "integer",
          description: translate("list_directory.params.maxDepth"),
        },
      },
      required: ["path"],
    },
    display: {
      activeVerb: "Analyzing",
      completedVerb: "Analyzed",
      subjectParam: "path",
      subjectFormat: "full",
      filePathParam: "path",
    },
  },
  {
    name: "search_file_contents",
    dataSource: compute("sandboxed fs"),
    description: translate("search_file_contents.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/search/grep",
      bodyParams: [
        "pattern",
        "searchPath",
        "isRegex",
        "includes",
        "caseInsensitive",
        "matchPerLine",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: translate("search_file_contents.params.pattern"),
        },
        searchPath: {
          type: "string",
          description: translate("search_file_contents.params.searchPath"),
        },
        isRegex: {
          type: "boolean",
          description: translate("search_file_contents.params.isRegex"),
        },
        includes: {
          type: "array",
          items: { type: "string" },
          description: translate("search_file_contents.params.includes"),
        },
        caseInsensitive: {
          type: "boolean",
          description: translate("search_file_contents.params.caseInsensitive"),
        },
        matchPerLine: {
          type: "boolean",
          description: translate("search_file_contents.params.matchPerLine"),
        },
      },
      required: ["pattern", "searchPath"],
    },
  },
  {
    name: "find_files",
    dataSource: compute("sandboxed fs"),
    description: translate("find_files.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/search/glob",
      bodyParams: ["pattern", "searchPath"],
    },
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: translate("find_files.params.pattern"),
        },
        searchPath: {
          type: "string",
          description: translate("find_files.params.searchPath"),
        },
      },
      required: ["pattern", "searchPath"],
    },
  },
  {
    name: "read_files",
    dataSource: compute("sandboxed fs"),
    description: translate("read_files.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/file/read-multi",
      bodyParams: ["files"],
    },
    parameters: {
      type: "object",
      properties: {
        files: {
          type: "array",
          items: {
            type: "object",
            properties: {
              absolutePath: {
                type: "string",
                description: translate("read_files.params.files.items.params.absolutePath"),
              },
              startLine: {
                type: "integer",
                description: translate("read_files.params.files.items.params.startLine"),
              },
              endLine: {
                type: "integer",
                description: translate("read_files.params.files.items.params.endLine"),
              },
            },
            required: ["absolutePath"],
          },
          description: translate("read_files.params.files"),
        },
      },
      required: ["files"],
    },
  },
  {
    name: "get_file_info",
    dataSource: compute("sandboxed fs"),
    description: translate("get_file_info.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/file/info",
      bodyParams: ["path", "paths"],
    },
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: translate("get_file_info.params.path"),
        },
        paths: {
          type: "array",
          items: { type: "string" },
          description: translate("get_file_info.params.paths"),
        },
      },
      required: [],
    },
  },
  {
    name: "diff_files",
    dataSource: compute("sandboxed fs + diff"),
    description: translate("diff_files.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/file/diff",
      bodyParams: ["pathA", "pathB", "content", "contextLines"],
    },
    parameters: {
      type: "object",
      properties: {
        pathA: {
          type: "string",
          description: translate("diff_files.params.pathA"),
        },
        pathB: {
          type: "string",
          description: translate("diff_files.params.pathB"),
        },
        content: {
          type: "string",
          description: translate("diff_files.params.content"),
        },
        contextLines: {
          type: "integer",
          description: translate("diff_files.params.contextLines"),
        },
      },
      required: ["pathA"],
    },
  },
  {
    name: "move_file",
    dataSource: compute("sandboxed fs"),
    description: translate("move_file.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/file/move",
      bodyParams: ["source", "destination", "createDirs"],
    },
    parameters: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: translate("move_file.params.source"),
        },
        destination: {
          type: "string",
          description: translate("move_file.params.destination"),
        },
        createDirs: {
          type: "boolean",
          description: translate("move_file.params.createDirs"),
        },
      },
      required: ["source", "destination"],
    },
  },
  {
    name: "delete_file",
    dataSource: compute("sandboxed fs"),
    description: translate("delete_file.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/file/delete",
      bodyParams: ["path", "recursive"],
    },
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: translate("delete_file.params.path"),
        },
        recursive: {
          type: "boolean",
          description: translate("delete_file.params.recursive"),
        },
      },
      required: ["path"],
    },
    display: {
      activeVerb: "Deleting",
      completedVerb: "Deleted",
      subjectParam: "path",
      subjectFormat: "basename",
      filePathParam: "path",
    },
  },
  {
    name: "execute_command",
    dataSource: compute("sandboxed subprocess"),
    description: translate("execute_command.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/command/run",
      bodyParams: ["command", "cwd", "timeout", "run_in_background"],
    },
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: translate("execute_command.params.command"),
        },
        cwd: {
          type: "string",
          description: translate("execute_command.params.cwd"),
        },
        timeout: {
          type: "integer",
          description: translate("execute_command.params.timeout"),
        },
        run_in_background: {
          type: "boolean",
          description: translate("execute_command.params.run_in_background"),
        },
      },
      required: ["command", "cwd"],
    },
    display: {
      activeVerb: "Running",
      completedVerb: "Ran",
      subjectParam: "command",
      subjectFormat: "truncate",
    },
  },
  {
    name: "summarize_project",
    dataSource: compute("fs scan"),
    description: translate("summarize_project.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/project/summary",
      bodyParams: ["path"],
    },
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: translate("summarize_project.params.path"),
        },
      },
      required: ["path"],
    },
    display: {
      activeVerb: "Summarizing",
      completedVerb: "Summarized",
      subjectParam: "path",
      subjectFormat: "full",
      filePathParam: "path",
    },
  },
  {
    name: "run_git",
    dataSource: compute("git subprocess"),
    description: translate("run_git.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/git",
      bodyParams: [
        "action",
        "path",
        "staged",
        "file",
        "ref",
        "limit",
        "author",
        "since",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("run_git.params.action"),
          enum: ["status", "diff", "log"],
        },
        path: { type: "string", description: translate("run_git.params.path") },
        staged: {
          type: "boolean",
          description: translate("run_git.params.staged"),
        },
        file: {
          type: "string",
          description: translate("run_git.params.file"),
        },
        ref: { type: "string", description: translate("run_git.params.ref") },
        limit: {
          type: "number",
          description: translate("run_git.params.limit"),
        },
        author: { type: "string", description: translate("run_git.params.author") },
        since: {
          type: "string",
          description: translate("run_git.params.since"),
        },
      },
      required: ["action", "path"],
    },
    display: {
      activeVerb: "Running",
      completedVerb: "Ran",
      subjectParam: "action",
      subjectFormat: "truncate",
    },
  },
  {
    name: "query_language_server",
    dataSource: compute("LSP server (stdio JSON-RPC)"),
    description: translate("query_language_server.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/lsp/action",
      bodyParams: [
        "operation",
        "filePath",
        "line",
        "character",
        "workspacePath",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: [
            "goToDefinition",
            "findReferences",
            "hover",
            "documentSymbol",
            "goToImplementation",
          ],
          description: translate("query_language_server.params.operation"),
        },
        filePath: {
          type: "string",
          description: translate("query_language_server.params.filePath"),
        },
        line: {
          type: "integer",
          description: translate("query_language_server.params.line"),
        },
        character: {
          type: "integer",
          description: translate("query_language_server.params.character"),
        },
        workspacePath: {
          type: "string",
          description: translate("query_language_server.params.workspacePath"),
        },
      },
      required: ["operation", "filePath"],
    },
    display: {
      activeVerb: "Querying",
      completedVerb: "Queried",
      subjectParam: "operation",
      subjectFormat: "full",
    },
  },
  {
    name: "edit_notebook",
    dataSource: onDemand("AgenticNotebookService"),
    description: translate("edit_notebook.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/notebook/edit",
      bodyParams: ["path", "action", "cellIndex", "content", "cellType"],
    },
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: translate("edit_notebook.params.path"),
        },
        action: {
          type: "string",
          enum: [
            "list_cells",
            "get_cell",
            "insert_cell",
            "replace_cell",
            "delete_cell",
          ],
          description: translate("edit_notebook.params.action"),
        },
        cellIndex: {
          type: "number",
          description: translate("edit_notebook.params.cellIndex"),
        },
        content: {
          type: "string",
          description: translate("edit_notebook.params.content"),
        },
        cellType: {
          type: "string",
          enum: ["code", "markdown", "raw"],
          description: translate("edit_notebook.params.cellType"),
        },
      },
      required: ["path", "action"],
    },
  },
  ];
}
