# Core Workspace Tools — Fix Handoff (2026-07-14)

> **Update (2026-07-14, second session):** the residual code items below were fixed and pushed:
> - **§3 S2 / audit P1-6** — remote `validateWorkspacePath` (workspace-service `src/utils.ts`) now enforces the same BLOCKED_PATTERNS as local (node_modules, `.git/objects|hooks`, `.env`/keys/credentials, with `.env.example`-style templates allowed). The dynamic `allowEnvFiles` Mongo setting has no remote equivalent; the waiver there is the machine-local env var `WORKSPACE_ALLOW_ENV_FILES=on` (credential patterns only — node_modules/.git stay blocked). Patterns match on backslash paths too (Windows builds).
> - **§4.2** — `get_file_info` now routes **per path**, not by the batch's first path; mixed local/remote batches return correct per-machine results (test: `src/services/__tests__/AgenticFileInfoRouting.test.ts`).
> - **§4.7** — `tryAgentRouteCommand` now uses the same `NO_AGENT` sentinel as the file service.
> - **§3 S1 "never-connected root" hole (partially closed in code):** `loadUserWorkspaceRoots` (AdminRoutes) now stats each Mongo-configured root at boot; roots absent on the host are **not** added to `ALLOWED_ROOTS` — they're registered via new `registerRemoteOnlyRoot()` into `knownRemoteRoots`, so the S1 offline guard errors cleanly instead of local EACCES/ENOENT. `validatePath` also errors clearly when no local roots exist at all. Phase 0 (redeploy + container provisioning) is **still required** for the guard to reach production.
> - Suites after these changes: tools-service **1888/1888**, workspace-service **195/195**; `tsc --noEmit` clean in both.
>
> **Phase 0 is DONE (same session):** both services deployed to the NAS (tools-service `76a4a49`, workspace-service `3b48109`), containers healthy. The agent container provisions `/workspace` + bash + git 2.47.3 (verified via docker exec). The agent reconnects and registers after deploys.
>
> **Live-agent drive (§2/§5.2) is DONE** against the sandbox agent over real WebSocket RPC: write/read, `file.blockReplace`, `file.multiReplace`, recursive `file.delete`, `command.run`, per-path `file.info`, and the `run_in_background` honest refusal (immediate, ~9ms) all verified working; remote BLOCKED_PATTERNS confirmed live (`.env` write and `node_modules` read refused by the agent). Offline behavior: killed the agent mid-session — ops on `/workspace` fail safe with "outside allowed roots: /" (the sandbox agent registers virtual root `/`, which the S1 guard deliberately excludes; no silent local execution occurs because `/` never matches in local validation). Reconnect recovers cleanly. Note: gateway route param is `run_in_background` (snake_case), not `runInBackground`.
> - **New fix found during the drive:** the workspace-service container binary crashed with `ERR_UNHANDLED_ERROR` (re-emitting the reserved `error` event with no subscriber) whenever the backend dropped. Fixed in `3b48109` + regression tests; redeployed.
> **Schema diet (§4.1) is DONE (same session, user-approved direction: "industry standard, optimized for agentic harnesses"):** retired five agent-facing definitions — `replace_file_block`, `replace_file_regions`, `patch_file` (line-number/unified-diff editing is an LLM anti-pattern; string replacement is the standard edit model), `diff_files` (covered by `run_git diff`/`execute_command`), `query_language_server` (no remote path). Their routes/engines/tests all REMAIN — this is a definition-surface change only; restore a definition from git if ever wanted. `replace_in_file` is now THE edit tool with a teaching description (uniqueness, allowMultiple, write_file fallback) in both `en` and `caveman` (src + dist). Kept deliberately: the background trio and `edit_notebook` (both industry standard). 22 → 17 tools, ~2k schema tokens/conversation saved. Deployed in `f8e2f80`; live schema verified (retired names absent, keepers present).
> - Still open: shared-implementation extraction, `get_file_info` remote batches >20 uncapped pre-RPC (minor), `globToRegex` anchoring (utilities-library release), LSP idle-reaping/locale threading (moot for the tool surface now), concurrency/crash-during-write coverage (§2).

Audience: the next agent picking up the core workspace tooling. Read this with a skeptical eye — it is deliberately critical about what was actually verified vs. asserted.

Companion docs (read both):
- `docs/CORE_WORKSPACE_TOOLS_AUDIT_2026-07-14.md` — the full findings + evidence (production mining, code refs) and the phased plan. The header of that file has the shipped/deferred status.
- `docs/AGENTIC_TOOL_OPTIMIZATION_PROMPT.md` — the standing method for this kind of work.

The tools in scope are the 22 defined in `src/services/tool-definitions/CoreWorkspaceTools.ts`. They execute either **locally** (tools-service `Agentic*Service.ts`) or **remotely** over a WebSocket RPC to a connected workspace agent (`src/services/AgentConnectionManager.ts` → `../workspace-service`).

---

## 1. Commit / deploy state (read this first — it is messy)

- All changes are **already committed and probably already pushed.** The tools-service working tree auto-commits+pushes mid-session (see the `tools-service-auto-commit` memory). Do **not** assume an uncommitted working tree.
- The changes are spread across **two commits that also contain unrelated parallel work** (a "Creative 3D tools overhaul"):
  - `af0b243` — subagent work: `AgenticGitService.ts`, `AgenticProjectService.ts`, `AgenticNotebookService.ts`, `AgenticLspService.ts`, `LspServerManager.ts`, `src/utilities/agenticCoercion.ts`, and their tests. **Also contains the unrelated Creative/vector-animation changes.**
  - `c77e28c` — the rest: `AgenticRoutes.ts`, `AgenticFileService.ts`, `AgenticCommandService.ts`, `BackgroundProcessRegistry.ts`, `AgentConnectionManager.ts`, `CoreWorkspaceTools.ts`, locales, `tests/AgenticWorkspaceHardening.test.ts`. **Also contains unrelated ThreeDimensional* changes.**
  - **Consequence:** you cannot cleanly `git revert` the workspace-tools work without also reverting the Creative/3D work. If you need to isolate, cherry-pick by file.
- **workspace-service** (`../workspace-service`) has its own changes (new RPC handlers). Confirm they are committed/pushed there too.
- **Neither service has been redeployed.** Agents will not see any of this until both tools-service and workspace-service are redeployed. The audit's "Phase 0" (redeploy the workspace agent, which had a `command.stream` version skew, and confirm the sandbox container actually provisions `/workspace` + bash + git) is **still not done** and is a prerequisite for the production error rates to drop.

## 2. Verification — and its real limits

What was actually run:
- tools-service: `npx tsc --noEmit` clean; `npx vitest run` **1881/1881 green** (91 files).
- workspace-service: `npx tsc --noEmit` clean; `npx vitest run` **188/188 green**.
- eslint was **not** run (known-broken in these repos — TS/estree mismatch). So there is **no lint signal** on any of this.

What was **NOT** verified — treat these as unproven:
- **Nothing was exercised end-to-end against a live connected workspace agent.** Every remote-path change (the new `file.blockReplace`/`file.multiReplace` RPCs, the honest `runInBackground` refusal, recursive remote delete, the `destination`/`pathB` path translation, and the **entire S1 offline-agent guard**) is validated only by unit tests and code reading. The WebSocket round-trip, path translation for a non-`/` root, and reconnection behavior were never driven for real.
- No test covers **concurrency** (two agents editing the same file), **crash-during-atomic-write**, or that the registry **group-kill actually reaps real grandchildren** (npm→node dev server). These are asserted from the code, not observed.
- The tests added are targeted bug-repros and happy paths, not fuzz/property tests. Small-model input space is wide; more holes likely remain.

## 3. What shipped — with the critical caveats

Grouped by the three systemic root causes from the audit.

### S1 — silent local fallback (the production error storm)
- Added `offlineRemoteRootForPath()` in `AgentConnectionManager.ts` + a persistent `knownRemoteRoots` set (populated at agent registration, **not** cleared on disconnect). Wired into `tryAgentRoute` (file service) and `tryAgentRouteCommand` (command service): if a path belongs to a root an agent has served but no agent currently serves it, the op returns a clear "workspace agent offline" error instead of running locally.
- **Critical caveat — this does NOT fully cover the original production failure.** The worst production case was `workspaceRoot=/workspace` where **no agent had ever connected** (it was a configured user root that only exists on the intended machine). In that case `knownRemoteRoots` is empty, so the guard does nothing and the op still falls to local and fails with `EACCES/ENOENT`. That case is only fixed by Phase 0 (deploy/config: make `/workspace` real in the container, or stop advertising local execution for it). **The guard only helps the "agent connected then dropped" case.**
- `knownRemoteRoots` is in-memory and process-lifetime scoped; it resets on restart. Deliberately excludes the virtual `/` root (else a dropped container agent would block *all* local paths). This is a heuristic, not a correctness proof — watch for false "offline" errors if root registration semantics change.

### S2 — local/remote twin drift
- Back-ported to local (`AgenticFileService.ts`): grep `includes` glob matching (now uses `globToRegex` against name + relative path), `replace_in_file` overlap-count (advance by `oldString.length`), and made local writes atomic (`writeFileAtomic`, temp+rename).
- Back-ported to local (`AgenticGitService.ts`): the 512 KB diff/log truncation flag.
- Implemented the missing **remote** RPCs in workspace-service: `file.blockReplace`, `file.multiReplace` (all-or-nothing, bottom-up), recursive `file.delete`, and an **honest immediate refusal** for `runInBackground` (remote has no background registry). Registered their timeouts in the caller's `TIMEOUT_MAP`.
- **Critical caveat:** the deeper structural problem — two independent implementations of the same file/git/command logic — is **not** solved. I patched both sides to match; I did not extract a shared module. They will drift again. The right long-term fix (shared package consumed by both repos) is still open.
- **Known remaining divergences left unfixed:** remote `validateWorkspacePath` has **no `BLOCKED_PATTERNS`** (local blocks `.env`, keys, `node_modules`; remote does not) — a real security/behavior gap (audit P1-6). `query_language_server` and `edit_notebook` still have **no remote RPC path at all**; the LSP/notebook services were hardened but a remote-workspace notebook/LSP op still can't run on the right machine (mitigated only by the S1 guard erroring out, and only if an agent was ever connected).

### S3 — NaN/string coercion holes
- New `src/utilities/agenticCoercion.ts` (`coerceInt`, `coerceBool`) wired into **every** workspace route in `AgenticRoutes.ts`, plus a `normalizeTimeoutMs` for the seconds-vs-ms problem. `cellIndex:"last"` is rejected (no longer deletes cell 0); `timeout:30` is rejected as probable-seconds; string booleans/ints are accepted; `read_file` accepts `path` as an alias for `absolutePath`.
- **Critical caveats:**
  - `normalizeTimeoutMs` **rejects** bare numeric timeouts under 1000 ms (assumes the model meant seconds). A legitimate 500 ms timeout now errors. Judged acceptable for command execution; revisit if it bites.
  - The `path`-alias for `read_file` is only handled at the **route**, not in the schema/locale — the schema still tells models to send `absolutePath`. Minor inconsistency; models send `path` anyway.
  - Defense-in-depth coercion also exists inside some services (notebook), so error messages for the same bad input can differ slightly depending on entry path.

### Other P0/P1 fixed
- `kill_process` is **registry-scoped** (`AgenticRoutes.ts` now checks `getBackgroundProcess` and calls `killBackgroundProcess`; refuses untracked PIDs with the list of tracked ones). Registry `kill()` now does **process-group** kill and no longer deletes the entry immediately (so a confirming poll works).
  - **Caveat:** `killProcessTree` (arbitrary-PID group kill) still exists and is still used internally for timeout/abort. Only the *tool route* is scoped. Also the group-kill-reaps-grandchildren claim is untested (see §2).
- `run_git` `ref`/`file` argument-injection rejected (prefix-guard on `-`). Detached-HEAD reports a short hash. Relative `file` resolves against the repo, not the workspace root.
- `read_file`: degenerate ranges error instead of returning a misleading empty result; >1 MB files stream a bounded line range (`readOversizedRange`) so the advertised recovery works; added `truncationReason`/`nextStartLine`.
- grep reports `skippedOversized`/`skippedBinary` and an honest `truncated`; file-list mode (`matchPerLine:false`) is now bounded.
- `execute_command` reports signal-death reasons (SIGKILL/OOM) and validates `cwd` existence (clear error instead of `spawn bash ENOENT`).
- `summarize_project` sniffs pnpm/yarn/bun lockfiles instead of hardcoding npm; distinguishes malformed `package.json` from absent; flags scan truncation.
- RPC `pathKeys` gained `destination` and `pathB`.
- Schema: `edit_notebook.cellIndex` → `integer`. Locales (en) corrected: git limit default (10→20), run_git read-only note, timeout units + shell + auto-background, background 30-min TTL. `edit_notebook.cellIndex` doc mentions `-1` append.

## 4. Deliberately NOT done (decisions, not oversights)

1. **The schema diet.** Strongest evidence in the whole audit: agents used the four surgical edit tools **4 times all-time** vs **518 `write_file`** calls; `patch_file`, `diff_files`, `query_language_server`, `edit_notebook`, and the background trio have **~zero** all-time usage. The plan is to merge `replace_file_block` into `replace_file_regions`, retire `patch_file`, and demote the unused tools to an on-demand tier (~2k schema tokens/conversation saved). This was held back because **removing/merging agent-facing tools is a product-surface decision** — it needs an explicit call, and it ripples into `ToolSchemaService` complexity scoring + the schema tests. This is the highest-value remaining item.
2. **`get_file_info` batch-routes by the first path only** (mixed local/remote batches return wrong results). Left as-is (audit rated the tool "solid" overall; low usage).
3. **`globToRegex` anchoring bug** for `find_files` (`src/**/*.ts` misses `src/a.ts`) lives in the **published `utilities-library`** (consumed as a git tarball in `node_modules`, not a workspace symlink). Fixing it requires editing that repo *and cutting a release*, then bumping the dep here. Out of scope for a local edit.
4. **LSP idle-reaping** and **request-locale threading** — the notebook/LSP subagent deferred these as too invasive; non-breaking. Locale threading is wired in the service but the route doesn't pass a locale yet.
5. **`patch_file` hunk-level error reporting** — still a black box on failure. (Arguably moot if it's retired per #1.)
6. **caveman locale** values were not updated (only `en`), and only `en/tools.json` was synced to `dist/`. No test covers caveman text, and the parity test only checks `en` src-vs-dist key **counts** (which still match). If caveman correctness matters, update it and re-sync dist.
7. **The `tryAgentRouteCommand` falsy-fallthrough** in `AgenticCommandService.ts` was left as `if (!agent) …` (the file-service version got the `NO_AGENT` sentinel treatment). Low risk because the command RPC always returns an object, but it's an inconsistency.

## 5. Suggested order for the next agent

1. **Phase 0 deploy/ops (blocks everything):** redeploy workspace-service (clears the `command.stream` "Method not found" skew) and tools-service; confirm the sandbox container provisions `/workspace` + bash + git, or stop advertising local execution for those roots. Until this happens the production error rates won't move regardless of code.
2. **Drive it against a live agent** (the untested surface in §2): connect a real workspace agent, exercise blockReplace/multiReplace/recursive-delete/runInBackground over RPC, and verify the S1 offline guard by killing the agent mid-session. This is the biggest confidence gap.
3. **Schema diet (§4.1)** — the highest-leverage remaining change; get sign-off on the tool-surface change first, then update `CoreWorkspaceTools.ts`, both locales, dist, and the complexity/parity tests.
4. Then the residual divergences: remote `BLOCKED_PATTERNS` (§3 S2), `get_file_info` routing (§4.2), and the shared-implementation extraction that prevents future drift.

## 6. How to verify locally

```
cd /home/rodrigo/development/tools-service && npx tsc --noEmit && npx vitest run
cd /home/rodrigo/development/workspace-service && npx tsc --noEmit && npx vitest run
```
eslint is broken in both repos — do not rely on it. New/updated tests to look at: `tests/AgenticWorkspaceHardening.test.ts`, `src/services/__tests__/AgenticGitProjectFixes.test.ts`, `src/services/__tests__/AgenticNotebookGuards.test.ts`, `src/services/__tests__/AgenticLspGuards.test.ts`, and workspace-service `tests/handlers.test.ts`.

Production usage is mined from MongoDB `prism.agent_conversations` (URI in `vault-service/projects.json` `MONGO_URI`); the mining scripts used for this audit are in the session scratchpad if still present, and the method is in `AGENTIC_TOOL_OPTIMIZATION_PROMPT.md`.
