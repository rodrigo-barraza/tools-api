# Core Workspace Tools — Deep Audit (2026-07-14)

> **STATUS 2026-07-14 (implemented):** The correctness + ergonomics fixes below are implemented and pinned with tests. tools-service: `npx tsc --noEmit` clean, `npx vitest run` 1881/1881 green (new file `tests/AgenticWorkspaceHardening.test.ts` + service-level tests). workspace-service: 188/188 green (new `file.blockReplace`/`file.multiReplace` RPCs, recursive delete, honest `runInBackground` refusal). **Not committed; both services need a redeploy before agents see the changes.**
>
> Shipped: shared coercion helper (`src/utilities/agenticCoercion.ts`) wired into every route (int/bool/timeout-units, `path` alias for read_file); S1 offline-agent guard (`offlineRemoteRootForPath`) so a path served by a now-offline agent errors instead of running locally; S2 twin-drift fixes back-ported to local (grep `includes` glob, `replace_in_file` overlap count, git 512 KB truncation flag) + the missing remote RPCs implemented; S3 NaN/string coercion holes closed (cellIndex `"last"` no longer deletes cell 0, timeout `"60s"`/`30` no longer becomes 1 ms); kill_process registry-scoped (+ group-kill in the registry); git `ref` argument-injection rejected; atomic local writes; read degenerate-range + >1 MB streaming-range fixes; grep skip counters + honest `truncated`; command signal-death reason + cwd existence check; RPC `pathKeys` gained `destination`/`pathB`; schema `cellIndex` → integer; locale corrections (git limit default, read-only note, timeout units, background TTL) synced to dist.
>
> **Deliberately deferred (not bugs / product decisions / cross-repo published lib):** the schema diet (merging `replace_file_block` into `replace_file_regions`, retiring `patch_file`, demoting unused tools) — evidence-backed but a tool-surface change to decide explicitly; remote `BLOCKED_PATTERNS`/containment divergence (P1-6, workspace-service security posture); `get_file_info` batch routing-by-first-path (P1-7); `globToRegex` anchoring for `find_files` (lives in published utilities-library, tarball dep — needs a lib release); LSP idle-reaping and request-locale threading (subagent deferred, non-breaking); `patch_file` hunk-level error reporting.

---


Scope: all 22 tools in `src/services/tool-definitions/CoreWorkspaceTools.ts`, both execution paths (local `Agentic*Service` in tools-service, remote RPC via `AgentConnectionManager` → workspace-service), locales, tests, and real production usage mined from `prism.agent_conversations`.

## Production evidence (window 2026-06-30 → 07-14; all-time since 2026-04-06)

Recent window — 46 conversations used these tools:

| Tool | Calls | Error rate | Dominant failure |
|---|---|---|---|
| list_directory | 78 | 37% | `Directory not found: /workspace` (sandbox root missing on local fallback) |
| execute_command | 60 | **55%** | `Method not found: command.stream` ×12 (deployed agent version skew); `spawn bash ENOENT` ×10; allowlist rejections (`pwd`, `rm`) |
| read_file | 31 | 0% | — but 18/31 calls used invented param `path` (rejected per schema… yet succeeded — see note below) |
| summarize_project | 27 | 22% | `Directory not found` (same local-fallback root issue) |
| write_file | 12 | **100%** | `EACCES: permission denied, mkdir '/workspace'` ×10 |
| replace_file_block | 3 | 100% | `Method not found: file.blockReplace` (RPC never implemented) |
| run_git | 1 | 100% | `spawn git ENOENT` (no git in tools-service container) |

All-time call counts: read_file 608, write_file 518, list_directory 366, execute_command 147, delete_file 49, summarize_project 38, find_files 22, search_file_contents 15, read_files 4, move_file 4, run_git 4, replace_file_block 3, replace_in_file 1, get_file_info 1 — and **zero** for replace_file_regions, patch_file, diff_files, get_background_output, list_background_processes, kill_process, query_language_server, edit_notebook.

Headline: **agents rewrite whole files (518 write_file) and have used the four surgical edit tools 4 times combined**, even though they were enabled (verified: a gemma-4-12B CODING conversation had all of them among 286 enabled tools). User follow-ups after failures: "try again", "Can you list all the files now", "Do a deeper dive please" — friction is user-visible.

Note on read_file + `path`: conversations show `{"path": "..."}` calls *succeeding* with relative resolution against the workspace root. The route requires `absolutePath` (`AgenticRoutes.ts:98-100`), so the harness (prism-side) or an alias upstream is remapping. Worth confirming where — but the takeaway stands: models overwhelmingly prefer `path`; the schema should accept it.

## The three systemic root causes

### S1 — Silent local fallback when no remote agent serves the path (P0, production-confirmed)
`routeForPath()` (`AgentConnectionManager.ts`) returns `null` when the serving agent's WebSocket is down; every file/command/git op then falls through to **local execution on the tools-service container** (`AgenticFileService.ts:301-306` + ~10 sibling sites, `AgenticCommandService.ts:145-150`). The container has no `/workspace`, no `bash`, no `git` → the exact top production errors. Worse than the errors: a local write that *succeeds* tells the model a file landed on the user's machine when it didn't. Fix: when the request context references a workspace root registered by a (currently offline) agent, return "workspace agent '<name>' is offline — reconnect it", never run locally. Also make the `tryAgentRoute` falsy-result contract explicit (`{routed:false}` vs `null`) — flagged independently by three audit slices.

### S2 — The local/remote twins have drifted, and fixes only land on one side
Three bugs were fixed in workspace-service **with comments naming the bug** and never back-ported to the identical local code:
- grep `includes` suffix-only matching (fixed `FileHandler.ts:662-667`; broken `AgenticFileService.ts:886-894`) — `**/*.ts` filters silently match nothing locally.
- `replace_in_file` overlapping-occurrence count (fixed `FileHandler.ts:220-229`; broken `AgenticFileService.ts:482-486`) — spurious "ambiguous" rejections; `replacementsApplied` over-reports.
- git 512 KB silent diff truncation (fixed `GitHandler.ts:84-90`; broken `AgenticGitService.ts:110-115`).

And in the other direction, capabilities exist locally but not remotely: `file.blockReplace`/`file.multiReplace` RPCs don't exist; `run_in_background` is silently dropped by `CommandHandler` (command blocks then gets killed at timeout — opposite of what the schema promises); `delete_file.recursive` is inert remotely; remote `project.summary` returns a bare tree without any of the promised package/README analysis; `query_language_server` and `edit_notebook` have **no remote path at all** and silently execute on the wrong machine — including `edit_notebook insert_cell` fabricating a blank notebook on the tools-service filesystem and reporting success. Remote writes are atomic (temp+rename), local writes aren't. Local BLOCKED_PATTERNS (`.env`, keys) don't exist remotely.

Structural fix: extract the shared file/git/command operation logic into a common package (utilities-library already hosts `workspace.ts` limits) consumed by both sides, so the twins cannot drift. Until then: port the three fixes, implement the missing RPCs, and add local endpoint tests mirroring workspace-service's (the remote side is better tested — exactly why it's better).

### S3 — Validation doesn't survive contact with small models (NaN/string coercion family)
Small local models send strings, floats, and junk; today those silently become degenerate values:
- `edit_notebook` cellIndex `"last"` → `parseInt` → NaN → passes both range checks → **`splice(NaN,1)` deletes cell 0** and reports success (`AgenticNotebookService.ts:319-341`).
- `execute_command` timeout `"60s"` → 60 → clamped to 1000 ms; `"abc"` → NaN → instant auto-background with `success: true`; `30` (meant seconds) → 1 s.
- `read_files` per-item `startLine: "abc"` → every line labeled `NaN:` and the 800-line cap bypassed (`AgenticRoutes.ts:477-488`).
- `query_language_server` line `"abc"` → NaN passes `line < 1` guard → opaque server error instead of the existing teaching message.
- Booleans as strings silently dropped everywhere: `isRegex:"true"` → regex escaped as literal → 0 matches; `recursive:"true"`, `allowMultiple:"true"`, `staged:"false"` (returns a *staged* diff) — all via `=== true` at routes.
- `list_directory` maxDepth `"0"`/negative/NaN → silent empty listing; `0` vs `"0"` behave differently.

Fix: one shared coercion helper (accept integer-like strings and `"true"/"false"`, reject anything uninterpretable with a teaching error naming valid range/units/examples), applied uniformly at the routes, clamped **before** any RPC.

## Remaining P0s (not covered above)

1. **`kill_process` kills arbitrary host PIDs** — never consults `BackgroundProcessRegistry`, prefers process-group kill (`AgenticCommandService.ts:530-599`; route `AgenticRoutes.ts:638`). A hallucinated/recycled PID SIGKILLs an unrelated container process. Also cross-machine PID confusion: background tools are local-only while `execute_command` routes remotely — a remote-run PID polled/killed locally hits an unrelated local process. Fix: registry-scope kills, opaque handles (`bg_<agent|local>_<pid>`), refuse unknown PIDs listing tracked ones.
2. **`run_git` `ref` argument injection** — `ref: "--output=/path"` makes `git diff` write an arbitrary file and return `hasChanges:false` (`AgenticGitService.ts:294`, same `GitHandler.ts:179`). Reject `-`-prefixed refs.
3. **Registry TTL/shutdown kills orphan grandchildren** — `BackgroundProcessRegistry.kill()` signals the bash wrapper only (children were spawned `detached` precisely so group-kill works); TTL-killed `npm run dev` leaves the node server holding the port, invisible to `list_background_processes`.
4. **`search_file_contents` matchPerLine:false is unbounded** and its `truncated` flag lies (`AgenticFileService.ts:829-925`); grep also silently skips >1 MB/binary files → `totalMatches: 0` reads as "symbol doesn't exist".
5. **LSP stale document content** — file re-opened but never `didChange`d after edits (`LspServerManager.ts:189`); the edit→query loop gets answers about pre-edit code.

## P1 ergonomics (top of a longer list — full details in the four audit outputs)

- `read_file` >1 MB error says "use startLine/endLine" but the size gate runs first — the suggested recovery can never work. Degenerate ranges (startLine>endLine, startLine>EOF) "succeed" with 0 lines and `truncated:true`.
- Auto-backgrounded commands return `success: true` with empty output; killed-by-signal returns `exitCode:null` with no reason; nonexistent `cwd` surfaces as `spawn bash ENOENT` (reads as "bash missing").
- `get_background_output` returns overlapping chunk-tails (no offsets/cursor); 30-min unread TTL kills live dev servers and is documented nowhere.
- Edit-tool mismatch errors don't diagnose CRLF/invisible whitespace; `patch_file` failures are a black box (no hunk number, no fuzz); `replace_file_regions` is all-or-nothing but never says "no changes were applied".
- Success responses don't echo post-edit line ranges (the #1 cause of chained line-edit failures) or execution locus (local vs which agent).
- summarize_project: hardcoded `packageManager:"npm"` (this workspace is pnpm!), malformed package.json silently reclassified as not-Node, 200-entry scan presented as project totals.
- Command allowlist frustration: `pwd`, `rm` rejected (4+ times in window) — revisit list or teach alternatives in the error.
- `sendRpc` pathKeys missing `destination`/`pathB` — armed trap for the first non-`/` root agent.

## P2 — schema diet (~5k tokens paid per conversation where enabled; ×286-tool conversations)

Description text alone is ~3,350 tokens; roughly 2,000 of it serves near-zero-usage surface:

| Candidate | Evidence | Action |
|---|---|---|
| replace_file_block (~226 tok) | 3 calls ever, is exactly a 1-chunk replace_file_regions | merge into replace_file_regions |
| patch_file (~113 tok) | 0 calls ever; models are bad at unified diffs; least-teachable failures | retire (keep engine internal) |
| diff_files (~135 tok), get_file_info (~117), read_files (~120) | 0/1/4 calls ever | demote to on-demand tier or cut |
| query_language_server (~410 tok), edit_notebook (~206) | 0 calls ever | demote to on-demand; fix before re-promoting |
| background trio (~235 tok) | 0 calls ever | keep get_background_output (needed by auto-background), reconsider the other two |

Also: unify param naming (`absolutePath` vs `path` vs `searchPath` vs `pathA` — accept `path` everywhere as alias; production shows models already do this), make `cwd` optional (defaults exist), correct the `run_git.limit` "default: 10" (code says 20), document the shell (`bash -l -c`), background TTL, and truncation caps. Locale en/caveman parity is clean; two orphan keys (`replace_file_block.params.path`, `replace_file_regions.params.path`); three services hardcode `"en"` for error prompts.

## P3 — robustness notes
In-memory background registry orphans survivors across restarts; no per-user scoping on process routes (fine single-tenant); no mtime-based optimistic concurrency on read-modify-write edits; LSP managers leak per unique workspacePath (unvalidated against roots); local writes non-atomic; delete_file has no rail against deleting an allowed root itself.

## What's genuinely good (keep, and extend the patterns)
`read_file`'s response echo (resolved path, totalLines, actual range, truncated) is the model for self-paging state echo. `OutputAccumulator`'s self-announcing head+tail truncation marker. `buildCommandEnv` secret allowlist + credential-pattern blocklist. Quote-stripping of LLM-mangled paths on both sides. `query_language_server`'s 1-based line handling and teaching errors. `agenticHandler`'s timeout/error-classification discipline. Honest, cap-accurate locale descriptions with full en/caveman parity.

## Recommended fix plan

- **Phase 0 (ops, no code):** redeploy the workspace-service agent (kills the `command.stream` Method-not-found ×12) and verify the sandbox-container image provisions `/workspace`, bash, git — or stop advertising local execution.
- **Phase 1 (correctness):** S1 offline-agent explicit error; S3 shared coercion helper; kill_process registry scoping; git ref injection; NaN cellIndex; port the three workspace-service fixes to local; implement or honestly refuse missing remote RPCs (blockReplace/multiReplace, runInBackground, recursive delete, notebook/LSP routing guard); registry group-kill.
- **Phase 2 (ergonomics):** error-message batch (teach recovery, name invisible whitespace, hunk-level patch errors, "no changes applied"), truncation honesty (grep/list/LSP symbol flags, skipped-file counts), response echoes (post-edit line ranges, execution locus, effective params), background output offsets + TTL disclosure, summarize_project package-manager sniffing.
- **Phase 3 (schema diet):** merge/retire/demote per the table; param-name aliases (`path` everywhere); description corrections; sync both locales + dist.
- **Phase 4 (pin it):** local endpoint tests reproducing each production failure pattern (the exact bad inputs mined above); parity tests between local and remote twins so they can't drift again. Local test coverage today is near-zero for this family.

Full per-finding detail (file:line, scenarios, verified coercion semantics) lives in the four audit-agent reports produced during this session; this doc is the synthesis and the plan of record.
