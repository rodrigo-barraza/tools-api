# Prism Tool-Landscape Survey — What to ADD or UPGRADE

**Produced:** 2026-07-15 via a fan-out survey (4 inventory mappers + 22 web scouts across creative-tool categories, MCP registries, agent tool libraries, and coding-agent tool design → dedup → 40 adversarial per-candidate verifications that grepped our code → synthesis). Companion to the harness survey in `prism-service/docs/harness_landscape_survey_2026-07.md`.

> **Maintainer verification note (spot-checks, 2026-07-15).** Load-bearing claims behind the top picks and quick-wins were re-checked against the live tree and all hold: `figlet@1.11.0` is already transitively in `pnpm-lock.yaml` (ascii-banner is friction-free); the **`execute_python` RLIMIT_AS bug is real** (`PythonInterpreterService.ts:28` sets `RLIMIT_AS` → matplotlib/numpy import can hang/SIGKILL — the "must-fix" before the rich-results upgrade); **`agenticPatchFile` is genuinely dormant** (defined `AgenticFileService.ts:692`, routed `AgenticRoutes.ts:275`, but no tool-definition exposes it — a near-free `apply_patch`); the hand-built 3D trio (`create_3d_mesh/voxel/scene`) exists with **zero generative** counterpart; `generate_qr_code` is present as the sibling for `generate_avatar`/`scan_barcode`; and email/OCR/Wikidata/video are confirmed absent. Verifiers corrected several scout claims (Hunyuan licence is Tencent-Community not Apache; ACE-Step is 50+ langs/~10min; shiki-image uses Takumi not Satori/resvg; OpenAlex is now usage-priced with a free key; the multi-language LSP subsystem already exists and just needs a `diagnostics` case + a tool def). Inline `file:line` refs are accurate-to-±a-few-lines pointers.

**Scope:** agent tools (GitHub/OSS libs, MCP-adjacent patterns, hosted-model APIs), with a bias toward CREATIVE/novelty tools, mapped against the existing 277-tool inventory. Every candidate below was grepped against `src/locales/en/tools.json` + `tool-definitions/*.ts` and confirmed genuinely missing or genuinely weaker-than-proposed. ✨ = creative/novelty item.

---

## 1. Executive summary

Prism's creative surface is deep on **hand-built** generation (3D scene/mesh/voxel, vector-animation, tracker-synth audio, Mermaid/chart/map embeds) but has almost no **generative-input** or **model-backed** creative tools, and several obvious inverse holes (reads-but-can't-write, generates-but-can't-decode). The highest-convergence findings across scouts are: **generative video** (zero today), **image/text→3D** (all 3D is hand-authored), a **deterministic card/OG image primitive** (Satori), **code→image**, and **background removal**. On the utility side the biggest levers are **Code Mode** (tools as a typed API in a sandbox), **rich `execute_python` results** (auto-embed matplotlib/pandas), **email** (a glaring personal-assistant hole), and **OCR**.

Nearly every creative artifact drops into an already-supported `display{kind}` (`embed|image|video|audio`) with **no client work** — the render pipeline (MinIO upload + `buildDisplay` + web/Discord auto-render) is the reusable substrate that makes most of these M-or-smaller.

### TOP-12 NEW TOOLS (ranked)

| # | Tool | Source | Theme | Eff | Imp | What + why |
|---|------|--------|-------|-----|-----|-----------|
| 1 | ✨ `generate_video` | [LTX-Video](https://fal.ai/models/fal-ai/ltx-2/image-to-video) | video-media | M | high | Text/image→MP4 clip ("make this picture move"); biggest hole in the creative suite; `display{kind:video}` already renders |
| 2 | ✨ `generate_3d_model` / `image_to_3d` | [fal TRELLIS](https://fal.ai/models/fal-ai/trellis/api) | creative-visual | M | high | Photo/text→textured GLB; fills the one gap in the 3D suite (all 3D is hand-built); 5-scout convergence |
| 3 | ✨ `generate_card` | [vercel/satori](https://github.com/vercel/satori) | creative-visual | M | high | Deterministic template→PNG (quote/stat/OG/receipt/leaderboard); sits between rigid chart and non-deterministic image-gen; most-converged (5+) |
| 4 | ✨ `render_code` | [pi0/shiki-image](https://github.com/pi0/shiki-image) | creative-text | S | high | carbon.now.sh-style code→PNG; Prism emits code constantly; deterministic, free, 5-scout |
| 5 | ✨ `remove_background` | [danielgatis/rembg](https://github.com/danielgatis/rembg) | creative-visual | M | high | Subject cutout→transparent PNG; #1 prerequisite for stickers/emoji/composites; free CPU |
| 6 | ✨ `generate_song` | [ace-step/ACE-Step](https://github.com/ace-step/ACE-Step-1.5) | creative-audio | M | high | Real songs w/ vocals+lyrics (50+ langs); today's `generate_audio` only bleeps tracker synth |
| 7 | ✨ `generate_sheet_music` | [paulrosen/abcjs](https://github.com/paulrosen/abcjs) | creative-audio | M | high | ABC/MEI→engraved score SVG + playable MIDI; new artifact class you can read AND hear |
| 8 | `run_code` (Code Mode) | [Anthropic code-exec-MCP](https://www.anthropic.com/engineering/code-execution-with-mcp) | tool-ergonomics | M | high | Model writes TS against tools-as-typed-API; chains scrape→filter→chart in one turn, intermediates stay out of context |
| 9 | `send_email` / `read_email` | [codefuturist/email-mcp](https://github.com/codefuturist/email-mcp) | comms-social | M | high | SMTP+IMAP send/read/search; major hole — Prism does SMS/push/webhook but no email |
| 10 | `read_image_text` (OCR) | [tesseract.js](https://github.com/naptha/tesseract.js) + [olmOCR](https://github.com/allenai/olmocr) | data-extraction | M | high | Image/scan→text w/ annotated-box overlay; pairs with read_pdf; two-tier CPU/vLLM |
| 11 | ✨ `generate_avatar` | [dicebear/dicebear](https://github.com/dicebear/dicebear) | games-novelty | S | med | Seed→deterministic SVG avatar (35+ styles); identity primitive feeding create_custom_agent |
| 12 | ✨ `generate_ascii_banner` | [patorjk/figlet.js](https://github.com/patorjk/figlet.js) | creative-text | S | med | text→ASCII (inverse of existing image→ASCII); dep already transitively in lockfile |

### TOP-8 IMPROVE-EXISTING (ranked)

| # | Tool | Upgrade / who does it better | Theme | Eff | Imp | What + why |
|---|------|------------------------------|-------|-----|-----|-----------|
| 1 | `execute_python` | e2b/Jupyter rich-result model (native stack) | dev-ops | M | high | Auto-detect matplotlib fig→base64 PNG embed, DataFrame→table; turns text calculator into data-analysis surface |
| 2 | `generate_chart` | [Apache ECharts SSR SVG](https://apache.github.io/echarts-handbook/en/how-to/cross-platform/server/) | data-viz | M | high | Adds scatter/area/stacked/heatmap/sankey/treemap/radar/candlestick/boxplot; today bar/line/pie only |
| 3 | `generate_diagram` | [Kroki](https://github.com/yuzutech/kroki) + [D2](https://github.com/terrastruct/d2) | data-viz | M | high | Mermaid-only→multi-engine (PlantUML/GraphViz/C4/Excalidraw/WaveDrom/D2), server-side SVG, no CDN |
| 4 | ✨ `synthesize_speech_local` | [resemble-ai/chatterbox](https://github.com/resemble-ai/chatterbox) | creative-audio | M | high | espeak→neural TTS + zero-shot voice cloning + emotion knob; free local, no per-char billing |
| 5 | `replace_in_file` | Claude Code MultiEdit `edits[]` atomic batch | core-coding | M | med | All-or-nothing multi-edit transaction; kills half-applied-batch failure class (Part A only) |
| 6 | ✨ `generate_image` | Gemini aspect/size/count/seed knobs + local ComfyUI FLUX | creative-visual | L | med | Explicit 4K/seed/aspect control + zero-per-call local backend (instruct-edit half already ships) |
| 7 | `execute_javascript` | [QuickJS-WASM](https://github.com/sebastianwessel/quickjs) | dev-ops | M | med | Replace escapable node:vm w/ true WASM isolation; closes an RCE→secret-exfil path |
| 8 | `control_browser` | [browserbase/stagehand](https://github.com/browserbase/stagehand) | browser | M | med | NL `act()`/schema-typed `extract()`/`observe()` against local vLLM; cuts round-trips |

---

## 2. Method

**Surveyed:** OSS libraries (GitHub/npm/PyPI), self-hostable model families (TRELLIS.2, Hunyuan3D, LTX-Video, ACE-Step, Chatterbox, olmOCR), hosted per-call APIs (fal.ai, Replicate, OpenAlex, memegen), and agent-ergonomics patterns published by Anthropic/Cloudflare (Code Mode, input_examples, response_format, code-execution-with-MCP). Every candidate was reality-checked against its primary source within ~6 months and its licence/VRAM/pricing confirmed; several original claims were corrected (Hunyuan licence is Tencent-Community not Apache; ACE-Step is 50+ langs/~10min not 19/4min; shiki-image uses Takumi not Satori/resvg; OpenAlex is now usage-priced-with-free-key not keyless; staticmaps is 2.5y stale).

**Verified against Prism:** each candidate was grepped across `tools-service/src` (and `prism-service/src` for harness-native tools) — the ~277-tool name list in `src/locales/en/tools.json`, the `tool-definitions/*.ts` defs, the impl services, and the routes — to classify `missing` vs `partial` and to cite the exact file/line where the gap lives and where the new tool slots. The `display{kind}` render contract (`src/utilities.ts:446` `buildDisplay`), `MinioService.uploadToolAsset`, and the iterative `setWithId` stable-id primitive are the recurring reusable substrate; every build sketch reuses one of the existing route patterns (`/compute/latex`, `/creative/vector-animation`, chart-tool MinIO upload, the LIFX PUT path, the lupos-bot write proxy).

---

## 3. NEW TOOLS by theme

### 3.1 Creative — visual ✨

#### ✨ `generate_3d_model` / `image_to_3d` — photo or text → textured GLB
**Sources:** [microsoft/TRELLIS.2](https://github.com/microsoft/TRELLIS.2) (HF `microsoft/TRELLIS.2-4B`, MIT), [Tencent-Hunyuan/Hunyuan3D-2.1](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1) (arxiv 2506.15442), [fal-ai/trellis](https://fal.ai/models/fal-ai/trellis/api), [FishWoWater/trellis_mcp](https://github.com/FishWoWater/trellis_mcp)

Turns a single image OR text prompt into a PBR-textured GLB. Backends are real and current: **TRELLIS.2-4B** (MIT, late-2025, ~3s@512³ on H100, PBR base-color/roughness/metallic/opacity) and **Hunyuan3D-2.1** (Jun-2025, GLB+PBR export, Tencent-Community licence — fine for single-user self-host, NOT Apache). Pragmatic default is cheap-per-call via **fal.ai** (`fal-ai/trellis` ~$0.02/gen; `fal-ai/hunyuan3d-v3` image+text, ~$0.16 white mesh / ~$0.48 textured). Self-host is possible on the GPU box but VRAM is real (TRELLIS ~8GB+, Hunyuan ~10GB shape / ~21GB texture / ~29GB full — NOT the "6GB" originally claimed) and these are diffusion gradio/ComfyUI processes, **not vLLM-served**.

- **Renders as:** `display{kind:"embed"}` — a new three.js + GLTFLoader + OrbitControls viewer, autoRotate on.
- **Recency:** all <6 months, best-in-class.
- **Prism gap (missing):** exactly 3 hand-built 3D tools, zero generative. Defs in `src/services/tool-definitions/CreativeTools.ts`: `create_3d_mesh`, `create_3d_voxel` (L509), `create_3d_scene` (L650). Impls `ThreeDimensional{Base,Mesh,Voxel,Scene,Model}Service.ts`. Routes `ComputeRoutes.ts` POST `/compute/3d/{mesh:3036, scene:3276, model:3438, voxel:3550}`. grep for `trellis|hunyuan|fal-ai|GLTFLoader|generate_3d|image_to_3d|glb` = ZERO hits.
- **Build sketch:** new tool `generate_3d_model` (alias `image_to_3d`) in `CreativeTools.ts` beside the 3D trio. Params: `image` (URL/imageId/data-URI) XOR `prompt`, `texture:bool`, `quality/resolution` enum, `seed`. Fetcher `src/fetchers/creative/Generate3DModelFetcher.ts` → fal.ai queue API (submit/poll), download GLB, push via `MinioService.uploadToolAsset` (mirror image/gif routes ~`ComputeRoutes.ts:2470`). Add GLB viewer embed route `GET /compute/3d/glb` serving `buildEmbedHtml` with `THREE_JS_CDN` (already used by `ThreeDimensionalModelService`) + GLTFLoader. Return `buildDisplay("embed", glbViewerUrl, {height:480})`. **Gate the paid call behind a governor cap + TTL cache** like the classifieds scrapers. Keep title distinct from the existing `/compute/3d/model` primitive composer.
- **Effort:** M · **Impact:** high (highest scout convergence; headline "photo → spinnable model in Discord").

#### ✨ `remove_background` — transparent-PNG cutout
**Sources:** [danielgatis/rembg](https://github.com/danielgatis/rembg), [ZhengPeng7/BiRefNet](https://github.com/ZhengPeng7/BiRefNet), [briaai/RMBG-2.0](https://huggingface.co/briaai/RMBG-2.0)

**rembg** (maintained through 2026, CPU-capable via `pip install "rembg[cpu]"`) removes backgrounds to a clean transparent PNG. Ships `rembg i` (CLI) and `rembg s` (HTTP server); backends u2net/isnet/birefnet/bria-rmbg with alpha-matting for hair/soft edges. The TS service **shells out to the `rembg` CLI with the same `execFileAsync` pattern `ImageService` already uses for ImageMagick `convert`** — NOT through `execute_python` (which blocks sockets + caps memory, breaking model download/onnxruntime).

- **Renders as:** `display{kind:"image"}` (self-rendering alpha PNG); register an `imageId` so cutouts chain into `manipulate_image` composite.
- **Recency:** active Apr/Jun 2026.
- **Prism gap (missing):** no cutout among image tools (`manipulate_image` has ~18 ops incl. `trim` at `ImageService.ts:939` = uniform-border whitespace only, no subject isolation). `manipulate_image` shells to ImageMagick via `execFileAsync("convert", …)` at `ImageService.ts:411` — the exact pattern proposed.
- **Build sketch:** new `remove_background` in `CreativeTools.ts` (~near generate_image L1015). Params: `input` (URL/dataURI/imageId), `model` enum (u2net|birefnet-general|birefnet-lite|isnet|bria-rmbg), `alphaMatting:bool`, optional `bgColor`. Add `removeBackground()` to `ImageService.ts` (or new `BackgroundRemovalService.ts`): resolve input→temp file, `execFileAsync("rembg", ["i","-m",model,inPath,outPath])` — or POST to a managed warm `rembg s` subprocess (register via `BackgroundProcessRegistry`). Route beside manipulate_image, upload PNG via MinIO, `buildDisplay("image", url, {title:"Cutout"})`. **Default to a permissive model** (u2net/birefnet-general); RMBG-2.0 is BRIA non-commercial. Models auto-download (~176MB u2net) on first run; keep a warm server for repeat-call latency.
- **Effort:** M · **Impact:** high (unlocks stickers/emoji/composites; 3-scout convergence).

#### ✨ `generate_card` — Satori + Sharp card/infographic/OG-image generator
**Sources:** [vercel/satori](https://github.com/vercel/satori), [thx/resvg-js](https://github.com/yisibl/resvg-js) (optional)

**Satori** (v0.28.0, 2026-07-14) lays out an HTML/CSS-as-JSX tree into SVG via the yoga-layout WASM flexbox engine, emitting text as self-contained vector `<path>` glyphs (so you must **supply a font buffer** — no system fallback). The SVG rasterizes to PNG **in-process with no headless browser** — and since tools-service already ships `sharp@0.34.5` (`sharp(Buffer.from(svg)).png().toBuffer()`), **resvg-js is optional**. This is the `@vercel/og` stack. One genuinely-new dep (satori), optionally `satori-html` to build the vnode tree without JSX (tools-service is plain TS/ESM, not React), plus one bundled font. Yields deterministic quote cards, stat/OG/announcement banners, receipts, leaderboards, now-playing cards.

- **Renders as:** `display{kind:"image"}` — auto-renders in web AND Discord, no client work.
- **Recency:** very active (satori 0.28.0 2026-07-14; @vercel/og 0.11.1 proves the pairing in prod).
- **Prism gap (missing):** no card/OG/infographic/banner/receipt/leaderboard image generator. Nearest: `generate_chart` (chartjs-node-canvas, rigid), `generate_diagram` (Mermaid embed), `generate_image` (non-deterministic AI). Deps present: sharp, playwright, chartjs-node-canvas — NO satori/resvg. `buildDisplay("image",url,{title})` + `PersistentStore/EmbedAsset` are exactly what a card tool reuses.
- **Build sketch:** new `generate_card` in `CreativeTools.ts`, params `template` (quote|stat|og|announcement|receipt|leaderboard|now_playing), a per-template data object, theme/accent. New `src/services/CardService.ts` holding a template registry that builds a satori element tree (satori-html or plain `{type,props:{style,children}}`), bundle 1-2 fonts (Inter reg+bold as base64 under `src/services/assets/`), `satori()`→SVG, then `sharp` SVG→PNG. Store via `PersistentStore/EmbedAsset` (mirror `ChartService.storeChart`), serve from a `CreativeRoutes.ts` image route, `buildDisplay("image", pngUrl, {title})`. **The value is the template library + typography** — ship 2-3 strong templates (quote + stat/OG) first, not all six.
- **Effort:** M · **Impact:** high (most-converged finding; deterministic zero-API primitive filling the chart↔image gap).

#### ✨ `pixelate_image` / `dither_image` — retro pixel-art w/ Lospec palettes
**Sources:** [Tezumie/Image-to-Pixel](https://github.com/Tezumie/Image-to-Pixel) (MIT), [danielepiccone/ditherjs](https://github.com/danielepiccone/ditherjs)

Converts any photo into true pixel art with palette-tight quantization and selectable dithering (Floyd-Steinberg/Atkinson/ordered/2×2·4×4 Bayer/clustered) plus **live Lospec palette slugs** (Game Boy/NES/PICO-8) fetched from `lospec.com/palette-list/{slug}.json`. Reference impl is Tezumie/Image-to-Pixel (`pixelate({image,width,dither,strength,palette,resolution})`, all 6 dithers + Lospec). **Cleaner path: reimplement the same algorithms natively on Sharp** (already a dep) rather than pull Tezumie's DOM-oriented lib + node-canvas. (CanvasDither is 1-bit B/W only — drop from palette claim.)

- **Renders as:** `display{kind:"image"}`.
- **Recency:** Tezumie active (294★); Lospec API verified live.
- **Prism gap (missing):** grep `pixelat|dither|lospec|floyd|atkinson|bayer|quantize` → only ffmpeg GIF frame-reduction (`VideoService.ts:146`) and `convert_color` harmonies. `manipulate_image` (`ImageService.ts`) has grayscale/tint but NO quantization/dithering — genuinely can't produce sprites.
- **Build sketch:** new `pixelate_image` in `CreativeTools.ts`, POST `/compute/image/pixelate`. Extend `ImageService.ts` (or new `PixelArtService.ts`) — Sharp load → nearest-neighbor downscale → raw RGBA → nearest-palette map w/ dithering (~150-200 lines) → optional nearest upscale → PNG → MinIO. Params: input, width(64-256), dither enum, strength, palette (Lospec slug | hex array | null=median-cut auto), resolution. Fetch Lospec via native fetch, cache per-slug behind governor/TTL.
- **Effort:** M · **Impact:** medium (distinct aesthetic manipulate_image can't approximate; delightful, niche).

### 3.2 Creative — audio & music ✨

#### ✨ `generate_song` — full music w/ vocals+lyrics (ACE-Step 1.5)
**Source:** [ace-step/ACE-Step-1.5](https://github.com/ace-step/ACE-Step-1.5) (MIT, 11.6k★)

Open-source local music foundation model — an LM "planner" expanding a query into a song blueprint feeding a DiT decoder. Instrumental-or-vocal songs (10s up to ~10 min) from a style/genre prompt + optional lyrics across **50+ languages**, with cover/repaint/extend/multi-track/Vocal2BGM editing. Base/turbo 2B runs in <4GB VRAM, full song in <10s on an RTX 3090; XL 4B (Apr 2026) needs ~12-20GB. Ships a Gradio UI + REST API server. **Diffusion → cannot be served by vLLM; runs as its own GPU process.**

- **Renders as:** `display{kind:"audio"}` (native `<audio>` player, no client work).
- **Recency:** v0.1.8 May 2026, actively developed.
- **Prism gap (partial):** a tool named `generate_audio` exists but is the procedural `SoundSynthesizerService` step-tracker (waveforms/ADSR/instrument presets) — chiptune, no vocals/lyrics/neural music. `tool-policy.json` "audioTracker" even steers "make me a song" to it. `synthesize_speech` is spoken TTS, not singing. grep `ace.?step|generate_song|music.*generat` = none.
- **Build sketch:** new `generate_song` in `CreativeTools.ts` (name distinct from `generate_audio`). Params: `stylePrompt`, `lyrics` (empty=instrumental), `durationSec`, `language`, `action` (generate|repaint|extend|cover), optional `referenceAudio`. Fetcher `src/fetchers/creative/AceStepFetcher.ts` POSTs to the ACE-Step REST server on the GPU box; route in `CreativeRoutes.ts`; fetch WAV/MP3→MinIO→`buildDisplay("audio", url)`. **Wrap in governor cap + timeout + circuit breaker** (10s-to-minutes); consider async/job shape for XL.
- **Effort:** M · **Impact:** high (turns a bleepy tracker into a real "make me a song"; peak novelty).

#### ✨ `generate_sheet_music` — ABC/MEI → engraved score SVG + playable MIDI
**Sources:** [paulrosen/abcjs](https://github.com/paulrosen/abcjs) (MIT, v6.6.3), [rism-digital/verovio](https://github.com/rism-digital/verovio) (LGPL, WASM)

**abcjs** renders ABC-notation text to a staff-notation SVG score, plays it via a Web-Audio synth, and emits MIDI — one small client-side dep. **Verovio** (WASM/C++20) adds robust **headless (no-DOM)** engraving of ABC/MEI/MusicXML/Humdrum → SVG + `renderToMIDI`, usable server-side in Node. LLMs write ABC fluently, so one text input yields both a readable engraved score AND a playable audio/MIDI embed at zero API cost. abcjs rendering/synth is browser-side (embed); Verovio is the headless-Node path — the hybrid gives both.

- **Renders as:** `display{kind:"embed"}` (interactive read+hear score, like `create_vector_animation`) with static SVG `display{kind:"image"}` fallback + optional MIDI/WAV downloadUrl.
- **Recency:** abcjs 6.6.3 (~2mo); verovio active 2025 (5.0.0 Feb-2025).
- **Prism gap (partial):** grep `abcjs|verovio|vexflow|musicxml|engrav` = ZERO. The engraved-score IMAGE is a genuine hole; the audio half overlaps `generate_audio` (tracker synth). **Sell this on the READABLE SCORE, not playable audio.**
- **Build sketch:** new `generate_sheet_music` in `CreativeTools.ts`, new `SheetMusicService` at `/creative/sheet-music`. Params: `notation` (ABC/MEI/MusicXML), `format` enum, title, tempo. Hybrid: (1) Verovio WASM server-side `loadData()+renderToSVG()`/`renderToMIDI()`; (2) engine-owned embed bundling abcjs so the client renders+plays inline. Reuse the ffmpeg/remix_audio path for MIDI→WAV if a plain audio file is wanted.
- **Effort:** M · **Impact:** high (new artifact class; engine-owned embed pattern already exists).

### 3.3 Creative — text / ASCII / typography ✨

#### ✨ `render_code` (alias `code_to_image`) — carbon.now.sh-style code screenshot
**Sources:** [pi0/shiki-image](https://github.com/pi0/shiki-image), [charmbracelet/freeze](https://github.com/charmbracelet/freeze), [Aloxaf/silicon](https://github.com/Aloxaf/silicon)

Renders highlighted code (optionally ANSI terminal output) to a PNG with window chrome + themes, **no headless browser, zero per-call cost, deterministic**. Correction: shiki-image is "powered by shiki + **takumi**" (kane50613/takumi, a Rust HTML/CSS→image renderer with native Node bindings `@takumi-rs/core` that rasterizes straight to PNG without an SVG step) — not Satori/resvg. `codeToImage(code, {lang, theme, format})` returns a buffer. `charmbracelet/freeze` is a single-binary Go alt that also captures live ANSI via `--execute`.

- **Renders as:** `display{kind:"image"}` (web + Discord).
- **Recency:** Shiki + Takumi very active; shiki-image itself slightly stale (v0.1.4 Sept-2025, self-labeled experimental) → **prefer building on shiki + @takumi-rs/core directly**, or the zero-new-dep playwright+sharp path.
- **Prism gap (missing):** no code_to_image/carbon/silicon/freeze tool. Nearest: `render_latex` (KaTeX embed, `ComputeTools.ts:265`→`ComputeRoutes.ts:922`), `generate_diagram`. package.json has playwright + sharp but NO shiki/satori/resvg/takumi.
- **Build sketch:** new `render_code` in `getCreativeTools()`. Compute route mirroring `/compute/latex` in `ComputeRoutes.ts`: `{code, lang, theme, windowChrome?, background?, fontSize?, format?}` → `shiki-image` `codeToImage()` (or shiki + @takumi-rs/core) → PNG → persist → `display{kind:"image"}`. **Zero-new-dep alternative:** Shiki HTML into `buildEmbedHtml()` with faux-macOS chrome CSS, screenshot via the already-present playwright, post-process with sharp — this also emits a copy-able HTML embed. Whitelist langs/themes, cap code length.
- **Effort:** S · **Impact:** high (high-frequency — Prism emits code constantly; deterministic; 5-scout).

#### ✨ `generate_ascii_banner` (alias `render_text_banner`) — text → ASCII art
**Sources:** [patorjk/figlet.js](https://github.com/patorjk/figlet.js) (v1.11.2), [khrome/ascii-art](https://github.com/khrome/ascii-art)

**figlet.js** is a pure-JS full FIGfont-spec impl rendering text as large ASCII banners across ~290 fonts with all kerning/smushing layout modes; only runtime dep is `commander`, no native bindings. ANSI colorization via a tiny chalk/ANSI helper (prefer over khrome/ascii-art, which drags an optional native `canvas`).

- **Renders as:** raw string (Discord fenced code block) + optional `display{kind:"embed"}` reusing `buildEmbedHtml` with a live font dropdown (figlet runs client-side too).
- **Recency:** v1.11.2, active 2025-2026.
- **Prism gap (missing):** only the inverse `convert_image_to_ascii` exists (`CreativeTools.ts:309`, impl `ImageService.ts:581`, embed route `ComputeRoutes.ts:2548`). **Bonus: figlet@1.11.0 is already transitively in `pnpm-lock.yaml`** (via yargonaut) — friction-free.
- **Build sketch:** new `generate_ascii_banner` beside `convert_image_to_ascii`. Thin `figlet.textSync(text,{font,horizontalLayout,verticalLayout,width})` wrapper by the existing ASCII route in `ComputeRoutes.ts` (has asciiStore + embed builder). Params: text, font (default "Standard"), layout modes, width, color. Add `figlet@^1.11.2` as direct dep.
- **Effort:** S · **Impact:** medium (inverse-hole + retro/caveman-locale delight; simple novelty).

### 3.4 Video / media ✨

#### ✨ `generate_video` — text/image-to-video clips (LTX)
**Sources:** [Lightricks/LTX-Video](https://github.com/Lightricks/LTX-Video), [fal-ai/ltx-2](https://fal.ai/models/fal-ai/ltx-2/image-to-video), Replicate `lightricks/ltx-video`

Text/image→video. Apache-2.0 open weights: original **LTX-Video** (~2B DiT) does 30fps @1216×704 faster-than-real-time on a single consumer GPU with first/middle/last-keyframe conditioning ("make this picture move"). **LTX-2** (Jan 6 2026, 22B) adds native 4K + synced audio up to 50fps — heavier, not real-time; FP8 8-step distilled fits 16-24GB. Runs via ComfyUI / LTX Python inference (**not vLLM**). Cheapest path for a cost-sensitive owner is hosted per-second: **fal `fal-ai/ltx-2/image-to-video` Fast = $0.04/sec 1080p (~$0.24 for 6s)**, Pro = $0.06/sec w/ audio.

- **Renders as:** `display{kind:"video"}` — already a first-class kind, already emitted by `buildDisplay("video",…)` in `KnowledgeRoutes.ts:1089/1144` (download/trim); a generated MP4 auto-renders as native `<video>`.
- **Recency:** weeks old.
- **Prism gap (missing):** no generate/text-to/image-to-video. Video tooling is edit/download only (`convert_video_to_gif`, `trim_video`, `download_video` = pure ffmpeg + yt-dlp). MinIO wired; **no `FAL_KEY`/`REPLICATE_API_TOKEN` in config.ts yet** (new CONFIG entry); key-gating pattern exists (`ToolSchemaService.ts:916`).
- **Build sketch:** new `generate_video` in `CreativeTools.ts` (prompt, imageUrl, startFrame/midFrame/endFrame, durationSeconds, resolution, quality fast|pro). Handler in `CreativeRoutes.ts` → new `src/services/VideoGenerationService.ts`. **Path A (ship first):** fal.ai serverless — submit→poll queue→download MP4→MinIO→`buildDisplay("video",…)`; add `CONFIG.FAL_KEY`. **Path B (opt-in zero-marginal):** ComfyUI HTTP endpoint on the GPU box (LTX FP8 workflow). Feed `generate_image` output straight in as the conditioning image. Mirror generate_image's `softenPrompt` retry ladder; async "pending" UX for latency.
- **Effort:** M · **Impact:** high (single biggest hole in the creative suite).

#### ✨ `visualize_audio` — waveform/spectrum → image + reactive MP4
**Sources:** [FFmpeg showwaves/showspectrum](https://ffmpeg.org/ffmpeg-filters.html), [adefossez/seewav](https://github.com/adefossez/seewav) (optional), [jberg/butterchurn](https://github.com/jberg/butterchurn) (optional)

FFmpeg's `showspectrumpic`/`showwavespic` render spectrogram/waveform PNGs; `showspectrum`/`showwaves`/`avectorscope` render an audio-reactive MP4 — **a thin CLI over the ffmpeg Prism already shells to** (`execFile` + `CONFIG.FFMPEG_PATH` in `AudioRemixService.ts`/`VideoService.ts`), so the core path is zero-new-dependency. seewav (pycairo/numpy/tqdm) is optional prettier-bars polish; Butterchurn (MIT WebGL2 MilkDrop) is the interactive-embed path (bundle into a self-contained embed HTML page like vector-animation). "Near-zero dependency" is true only for the ffmpeg core.

- **Renders as:** `display{kind:"image"}` (PNG) or `{kind:"video"}` (MP4); optional `{kind:"embed"}` for Butterchurn.
- **Recency:** ffmpeg filters evergreen; seewav PyPI Mar-2025; butterchurn active 2025.
- **Prism gap (missing):** Prism makes/edits audio + makes visuals but nothing turns audio→visual. grep confirms no visualize_audio/spectrogram/waveform.
- **Build sketch:** new `visualize_audio` in `CreativeTools.ts`, new `AudioVisualizationService.ts` mirroring `VideoService.ts` (shell `CONFIG.FFMPEG_PATH`). Reuse AudioRemix input resolution. Params: `mode` (spectrogram|waveform|spectrum_video|waves_video|vectorscope), size, colors. Video modes mux generated video + original audio (libx264+aac). Upload via MinIO → image or video display. Route near `/remix-audio`. **Build the pure-ffmpeg core first (S); seewav + butterchurn are opt-in follow-ups.**
- **Effort:** M (core alone: S) · **Impact:** medium (upgrades the whole audio family with a shareable visual layer).

#### `compose_video` / `edit_video` — declarative NLE
**Sources:** [mifi/editly](https://github.com/mifi/editly) (MIT), [Trekky12/kburns-slideshow](https://github.com/Trekky12/kburns-slideshow)

**editly** compiles a JSON spec of clips/images/titles/audio + GL transitions into an MP4 via ffmpeg using streaming edits (no giant intermediates) — concat, crossfades, lower-thirds, background music, Ken-Burns. Caveats: last stable is 0.14.2 (~4y); current is 0.15.0-rc.1 (Jan 2025); **GL transitions need the `gl`/headless-gl native module which historically fails to build on Node 22 (WSL2 friction).** A leaner build hand-rolls the same NLE directly on ffmpeg `filter_complex` (xfade + zoompan + overlay + drawtext + amix), reusing VideoService's `execFile` pattern — sacrificing the fancy GL catalog but dropping the native-GL dep.

- **Renders as:** `display{kind:"video"}`.
- **Recency:** editly RC Jan-2025 [evergreen — ffmpeg filters are the durable foundation].
- **Prism gap (missing):** video surface is single-input transforms only (`download_video`, `trim_video`, `convert_video_to_gif`; `VideoService.ts` = convert+trim only). No editly/fluent-ffmpeg in package.json.
- **Build sketch:** new `compose_video` (+`edit_video` alias) in `KnowledgeTools.ts` near `trim_video`, POST `/knowledge/video/compose`, new `VideoComposeService.ts`. Input: a `spec` mirroring editly (outWidth/outHeight/fps + `clips[]` w/ `layers[]` + `transition` + top-level `audioFilePath`). Clip-array maps onto stable-id append. **Recommended: hand-rolled ffmpeg `filter_complex`** (avoid headless-gl); editly-as-library only if the GL catalog is truly wanted and builds cleanly. Upload MP4→MinIO→`buildDisplay("video",…)`. Enforce 200MB/duration caps + timeout.
- **Effort:** M · **Impact:** medium (niche personal-assistant ask; flashiest feature = riskiest part).

### 3.5 Games / novelty / fun ✨

#### ✨ `chess` — play & analysis (engine + validated board embed)
**Sources:** [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js), [jhlywa/chess.js](https://github.com/jhlywa/chess.js), [shaack/cm-chessboard](https://github.com/shaack/cm-chessboard), [andyruwruw/chess-image-generator](https://github.com/andyruwruw/chess-image-generator)

**Stockfish 18 WASM** (npm `stockfish`, updated 2026-02-11, Node-capable; use the lite single-threaded build to dodge SharedArrayBuffer) driven via UCI (FEN + `go depth N` → bestmove + cp/mate) + **chess.js** (legal moves/FEN/PGN/checkmate) lets the agent play a full game, solve tactics, or annotate a position. The board is drawn by **cm-chessboard** client-side inside the embed iframe from the FEN (it's a browser-DOM lib, not a Node SVG stringifier) — or server-side via chess-image-generator FEN→PNG.

- **Renders as:** `display{kind:"embed"}` (or "image" if server-rendered); stable-id upsert so one board mutates across turns for a live game.
- **Recency:** all current.
- **Prism gap (missing):** grep `chess|board|stockfish|fen|pgn|tactic|puzzle` = unrelated hits only. `GamingTools.ts` has only `get_dota` + `get_steam_profile`.
- **Build sketch:** new `chess` tool (action enum play|analyze|tactic|annotate; params fen, move, depth) in `GamingTools.ts` + handler in `GamingRoutes.ts` mirroring the `/bonfire` embed pattern (L349-380) and vector-animation TTL-Map+GET-embed (`CreativeRoutes.ts:1901-1955`). New `ChessService.ts` owns a **long-lived warm Stockfish WASM UCI worker** (load ~7MB once at service init, serialize UCI commands, cap `go depth` 12-18) + chess.js. Board embed via `buildEmbedHtml()` inlining cm-chessboard + FEN.
- **Effort:** M · **Impact:** medium (real delight, niche; the warm UCI worker is the one non-trivial piece).

#### ✨ `generate_meme` — template caption
**Sources:** [jacebrowning/memegen](https://github.com/jacebrowning/memegen) / api.memegen.link, [haltakov/meme-mcp](https://github.com/haltakov/meme-mcp) (Imgflip, worse)

Best path is **memegen via api.memegen.link** — verified live 2026-07-15, free, no key/auth, no rate limits, stateless URL API, **210 templates** (drake/distracted-boyfriend/this-is-fine/change-my-mind), custom `?background=<url>`, animated `.gif`/`.webp`. A local node-canvas/ImageMagick Impact renderer is the offline fallback.

- **Renders as:** `display{kind:"image"}` (GIF templates auto-animate); optional stable-id iterative caption editing.
- **Recency:** live 2026-07-15.
- **Prism gap (partial):** `manipulate_image` already captions a base image with top/bottom outlined `text` (`ImageService.ts:341-361`, `-gravity north/south`, `-stroke`/`-strokewidth`) and `composite`s cutouts — so the "local Impact renderer" half is effectively shipped (only the Impact.ttf install is missing; default Liberation-Sans). **Genuine delta = the named-template library** (meme WITHOUT supplying a base image) + one-call idiom + free GIF. Note: there is NO `remove_background` tool to pair with today — use `manipulate_image` composite or memegen `?background=`.
- **Build sketch:** new `generate_meme` in `CreativeTools.ts`, new `src/fetchers/creative/MemeFetcher.ts`: cache `GET /templates/` for fuzzy match, build deterministic URL `images/{template}/{top}/{bottom}.{png|gif}` with memegen escaping (`_`=space, `--`=dash, `~n`=newline), optional `?background=`, fetch bytes → `display{kind:"image"}`. Offline fallback: ImageService `text` op with bundled Impact.ttf.
- **Effort:** S · **Impact:** medium (catnip for lupos personas; partly redundant with manipulate_image).

#### ✨ `generate_avatar` / identicon — DiceBear
**Source:** [dicebear/dicebear](https://github.com/dicebear/dicebear) (v10.3, MIT)

**DiceBear 10** deterministically maps any seed string to an SVG avatar across 35+ styles (pixel-art, bottts, adventurer, identicon, thumbs, lorelei, avataaars); same seed → same face. Fully offline, MIT, pure-ESM, Node 22+ (Prism's Node 26 clears it). v10 API is `@dicebear/core` (Style/Avatar) + `@dicebear/styles` JSON packs (NOT the legacy `@dicebear/collection`).

- **Renders as:** `display{kind:"image"}`; data-URL output plugs straight into `create_custom_agent.avatar`.
- **Recency:** 10.3 released 2026-06-13.
- **Prism gap (missing):** no avatar/identicon/dicebear/blockies/jdenticon generator. `create_custom_agent` only CONSUMES an avatar; `generate_image` is paid/non-deterministic. Structural sibling `generate_qr_code` (`CreativeTools.ts:18`).
- **Build sketch:** new `generate_avatar` in `CreativeTools.ts` mirroring `generate_qr_code` — POST `/compute/avatar`, params `{seed, style (~35 enum), size, backgroundColor?, format? svg|png}`. Handler in `ComputeRoutes.ts` via `lazyImport("@dicebear/core")` + load the chosen `@dicebear/styles` JSON, `new Avatar(new Style(def),{seed,size}).toString()` → SVG; optionally rasterize to PNG via sharp (recommend PNG for Discord reliability); MinIO → `buildDisplay("image",…)`.
- **Effort:** S · **Impact:** medium (obvious hole; identity primitive for personas/NPCs/project icons; nearly copy-paste from generate_qr_code).

### 3.6 Core-agent / coding tools

#### `search_code_ast` / `rewrite_code_ast` — ast-grep structural search & rewrite
**Sources:** [ast-grep/ast-grep](https://github.com/ast-grep/ast-grep), [@ast-grep/napi](https://www.npmjs.com/package/@ast-grep/napi)

**@ast-grep/napi** (v0.44.1, 2026-07-04, MIT) is a first-class N-API binding matching/rewriting code by tree-sitter AST pattern across ~32 languages, prebuilt binaries for linux x86_64/aarch64 (WSL2 → no Rust compile). `parse(lang,src)→SgRoot`; `findAll(pattern)` with meta-vars (`console.log($A)`); `node.replace(text)→Edit`; `root.commitEdits(edits)`. Meta-var rewrite (`console.log($A)`→`logger.info($A)`) is core. Correction: token-efficient unified diffs + dry-run are NOT intrinsic — the Prism wrapper implements them.

- **Renders as:** code/diff embed (fenced unified diff); match list as text.
- **Recency:** 0.44.1, 11 days old.
- **Prism gap (partial):** `AgenticFileService.ts:968-970` `searchFileContents` = `new RegExp` (text/regex only); L661 `replaceInFile` = `content.replace(oldString,newString)` (exact string, single file). No AST tool; no ast-grep/tree-sitter in package.json.
- **Build sketch:** add `search_code_ast` + `rewrite_code_ast` (or one modal tool) to `CoreWorkspaceTools.ts`. New `AstGrepService.ts` using `@ast-grep/napi@^0.44.1`: reuse the workspace path-guard + find_files walk, per-file `parse(Lang.X,src).root().findAll(pattern)`, `node.replace()` collect Edit[], `commitEdits()` → new source, compute unified diff (e.g. `diff` npm). Map ext→Lang. dryRun default true. **Ignore ast-grep-mcp — it's Python; use napi directly in-process.**
- **Effort:** M · **Impact:** medium (correctness upgrade for refactors; no creative delight; secondary use for an owner who codes in their own editor).

#### `get_diagnostics` — post-edit type/lint verification loop
**Sources:** [isaacphi/mcp-language-server](https://github.com/isaacphi/mcp-language-server), [oraios/serena](https://github.com/oraios/serena)

Returns tsserver/pyright errors+warnings for a file/project, closing the edit-verify loop after `replace_in_file`/`write_file`. **Best framed as COMPLETING existing WIP:** tools-service already ships a multi-language LSP subsystem — the real gap is (a) `agenticLspAction` has no `diagnostics` case and (b) none of the LSP actions are exposed as an LLM tool.

- **Renders as:** compact severity-grouped structured list (text/embed).
- **Recency:** serena very active May-2026; mcp-language-server v0.1.1 May-2025 [borderline; tsc/eslint path evergreen].
- **Prism gap (partial):** `src/services/lsp/LspConfig.ts` configures ts-language-server/pyright/gopls/rust-analyzer/clangd; `LspServerInstance.ts:119` registers `publishDiagnostics`; `AgenticLspService.ts` `agenticLspAction` switch (L343-363) implements goToDefinition/findReferences/hover/documentSymbol but **NO diagnostics case**; `AgenticRoutes.ts:945` exposes `/lsp/action` as HTTP only. No LLM-callable LSP tool. `execute_command` offers a manual tsc/eslint path.
- **Build sketch:** (1) add `case "diagnostics"` to `agenticLspAction` returning captured `publishDiagnostics` (add a diagnostics store keyed by URI) → `{file,line,col,severity,message,ruleId?}[]`. (2) Add a tool def — focused `get_diagnostics` OR a broader **`code_intel`** (action enum diagnostics|definition|references|hover|documentSymbol) — in `CoreWorkspaceTools.ts`, endpoint POST `/lsp/action` (already live). Fallback: thin `tsc --noEmit`/`eslint --format json` wrapper within ALLOWED_ROOTS. **Rescope from "new tool" to "finish the LSP subsystem" — exposing def/refs/hover for free may beat diagnostics alone.**
- **Effort:** S · **Impact:** medium (high utility for the self-editing workflow; utilitarian, partly served today).

### 3.7 Knowledge / research

#### `query_wikidata` — structured knowledge-graph SPARQL
**Sources:** [zzaebok/mcp-wikidata](https://github.com/zzaebok/mcp-wikidata) (reference), [query.wikidata.org](https://query.wikidata.org/)

A trio: `search_entity(query)` + `search_property(query)` resolve free-text to Q/P-IDs via the MediaWiki `wbsearchentities` API (no key), and `execute_sparql(query)` runs arbitrary SPARQL against the Wikidata Query Service (`GET query.wikidata.org/sparql?format=json`, no key). ~115M items. Answers relational/aggregate questions Wikipedia prose can't ("films directed by X after 2010 by box office"). Caveats: (1) since May-2025 scholarly items moved to `query-scholarly.wikidata.org`; (2) WDQS enforces a descriptive User-Agent + rate limits and is slow/timeout-prone mid-2026 → **hard client-side timeout + governor/TTL cache mandatory**.

- **Renders as:** default `display{kind:"table"}` (or csv for the iterative csv tool); lat/long columns → `{kind:"map"}`; numeric → chart.
- **Recency:** endpoint evergreen; reference repo pushed <4mo.
- **Prism gap (missing):** grep `wikidata|sparql|knowledge.?graph|dbpedia` over the 280-key locale = ZERO. Only `get_wikipedia_summary` (summary-only) + `get_on_this_day`. Confirms the inventory's own "no Wikidata/knowledge-graph" note.
- **Build sketch:** 3 defs in `KnowledgeTools.ts` + en/caveman locale, backed by new `src/fetchers/knowledge/WikidataFetcher.ts` (plain fetch, no SDK). entity/property → `wbsearchentities`; sparql → WDQS with required descriptive User-Agent + ~30s AbortController. Parse `results.bindings[].<var>.value` → rows. Wrap in the archive-first governor/TTL. **Document the two-step resolve-then-query flow in the tool descriptions** (mitigates hallucinated Q/P IDs).
- **Effort:** M · **Impact:** medium (high day-to-day utility; friction = LLM must author valid SPARQL).

#### `translate_text` / `detect_language` — self-hosted MT
**Sources:** [LibreTranslate](https://github.com/LibreTranslate/LibreTranslate) (AGPL-v3), Argos Translate

**LibreTranslate** (v1.9.6, 2026-05-26) is a self-hosted Docker MT server (REST on :5000) built on Argos Translate/OpenNMT via CTranslate2. `POST /translate` supports `source:"auto"`, `format:"text"|"html"` (tag-aware), and batch (`q` array); `POST /detect` returns per-lang confidence; `GET /languages`. Auto-pivots through an intermediate language when no direct pair exists (only if intermediate packages are downloaded; offline needs pre-downloaded models).

- **Renders as:** plain text (no rich embed).
- **Recency:** release 7 weeks ago.
- **Prism gap (missing):** no MT tool among ~277. grep `translate|libretranslate|argos|deepl` hits only CSS `ctx.translate()`, a WSL path, and the i18n `translate("<key>")` locale accessor (localizes tool DESCRIPTIONS, not user text).
- **Build sketch:** add `translate_text` + `detect_language` to `KnowledgeTools.ts` (or `UtilitiesTools.ts` near `convert_*`). New `src/fetchers/knowledge/LibreTranslateFetcher.ts` POSTing to `{LIBRETRANSLATE_URL}/translate` + `/detect`; base URL from vault projects.json. Run the official Docker container (`with_models=true` or `LT_LOAD_ONLY` to trim pairs). Expose optional batch `string[]` + `format:"html"`.
- **Effort:** S · **Impact:** medium (fills a real hole cheaply; niche — every LLM provider already translates inline, so marginal value is deterministic/zero-token/offline/batch/HTML-preserving).

### 3.8 Communication / social

#### `send_email` / `read_email` / `search_email` — SMTP + IMAP
**Sources:** [codefuturist/email-mcp](https://github.com/codefuturist/email-mcp), [nodemailer](https://www.npmjs.com/package/nodemailer), [imapflow](https://www.npmjs.com/package/imapflow)

**nodemailer** (v9.0.3, MIT, 0 deps — SMTP send w/ HTML + attachments) + **imapflow** (v1.4.7, MIT, same author — promise-based IMAP read/search/fetch + mailbox locking) give full send/read/search over any mailbox with plain creds, no SaaS. codefuturist/email-mcp proves the exact combo. Caveat: imapflow's IDLE watcher suits a long-lived process, not stateless per-call HTTP — **new-mail watching should ride the cron daemon (poll) or a background watcher → webhook/push**, not the tool call. Clean bodies need `mailparser` (simpleParser) + `sanitize-html`.

- **Renders as:** read_email → `display{kind:"markdown"}` (sanitized body); inbox list → table/JSON; send → plain confirmation.
- **Recency:** both current (imapflow published ~2 days ago).
- **Prism gap (missing):** `CommunicationTools.ts` has only Twilio SMS + ntfy push + webhook + read-only Discord. grep `email|smtp|imap|mail` = incidental only. No nodemailer/imapflow.
- **Build sketch:** add `send_email/read_email/search_email/list_mailboxes` to `CommunicationTools.ts` (+ en/caveman locale). Routes `/communication/email/{send,read,search}` in `CommunicationRoutes.ts`. New `EmailService.ts` mirroring `TwilioService.ts`: nodemailer transport for send; imapflow `getMailboxLock` + `fetch(envelope/source)` + `mailparser.simpleParser` for read. Creds via vault projects.json (`SMTP_*`/`IMAP_*`). Deps: nodemailer, imapflow, mailparser, sanitize-html.
- **Effort:** M · **Impact:** high (closes an obvious core-comms hole for a personal assistant).

#### `post_to_social` / `get_social_timeline` — Bluesky / Mastodon / Nostr
**Sources:** [@atproto/api](https://github.com/bluesky-social/atproto/blob/main/packages/api/README.md), [masto.js](https://github.com/neet/masto.js), [nostr-tools](https://github.com/nbd-wtf/nostr-tools)

`@atproto/api` (app-password `agent.login`+`agent.post`) posts/reads Bluesky; **masto** (v7.12.0) `client.v1.statuses.create` w/ visibility/CW/media+alt-text; **nostr-tools** `finalizeEvent` (kind-1) + `SimplePool.publish` to relays. All current TS SDKs (Bluesky's canonical class is now Agent/AtpAgent; BskyAgent + app-password still supported).

- **Renders as:** created post → link/card or `display{kind:"markdown"}`; timeline read → markdown list (no social-card kind).
- **Recency:** masto 7.12.0 ~11 days ago.
- **Prism gap (partial):** Reddit/Discord are read-only; only write-ish social is `react_to_discord_message`. BUT unauthenticated read fetchers already exist: `src/fetchers/trend/BlueskyFetcher.ts` + `MastodonFetcher.ts` feed `get_trends`. **Net-new = auth + write + Nostr.**
- **Build sketch:** new `src/services/tool-definitions/SocialTools.ts` exposing `post_to_social` + `get_social_timeline`. New `src/services/social/` with BskyPoster/MastodonClient/NostrPublisher. Routes `/communication/social/*` mirroring `/communication/sms/send`. Secrets via vault (bsky handle+app-password; mastodon instance+token; nostr nsec+relays); reuse `MASTODON_INSTANCES`. **Gate posting behind tool-policy/autoApprove + a confirm step** (public, irreversible).
- **Effort:** M · **Impact:** medium (fills the outbound-social hole; text/links not rich embeds, so utility not delight).

#### ✨ Discord native poll / scheduled event / custom emoji (+ send_discord_message)
**Sources:** [discord.js Poll/Guild/Soundboard APIs](https://discord.js.org/docs/packages/discord.js/14.25.1/PollData:Interface)

**discord.js v14** (lupos-bot already runs ^14.26.4) exposes real write actions Prism lacks: native polls `channel.send({poll:{question,answers:[{text,emoji?}],duration(hrs),allowMultiselect}})`, `guild.scheduledEvents.create()`, `guild.emojis.create({attachment,name})`, `guild.soundboardSounds.create()`. Minting a `generate_image` result into a server emoji is a genuine creative persona action, native, no third-party bot.

- **Renders as:** poll/event → JSON/permalink confirmation; create_emoji → `display{kind:"image", url:<new emoji cdn url>}`.
- **Recency:** all verified against official docs; version already installed.
- **Prism gap (missing):** `DiscordTools.ts` has ~13 tools, only write is `react_to_discord_message` (L432, `/discord/guild/react`); `get_discord_guild_emojis` only LISTS. grep for poll/scheduled_event/create_emoji = none. **Write rail already proven:** `DiscordRoutes.ts` (L261 `LUPOS_BOT_URL`, POST proxy L434) → lupos-bot `GuildRoutes.ts` POST `/guild/react` (L763) `message.react()` via `DiscordWrapper.getClient('lupos')`.
- **Build sketch:** add handlers to lupos-bot `GuildRoutes.ts` mirroring `/guild/react` (same apiAuth + per-guild cooldown): POST `/guild/poll`, `/guild/scheduled-event`, `/guild/emoji` (fetch image → sharp resize to square <256KB), optionally `/guild/soundboard`. Matching tool defs in tools-service `DiscordTools.ts` (`dataSource: onDemand('Discord Live API')`) + en/caveman locale. No new lib. **Also add plain `send_discord_message`** (same `channel.send()` path; the flagged "no send/post message tool" gap; polls ride on top). Caveats: polls uneditable, duration in HOURS; scheduled events need Manage Events perm + correct entityType; soundboard has tight limits (least useful — droppable).
- **Effort:** M · **Impact:** medium (polls + emoji-minting carry most value; occasional persona flourishes).

### 3.9 Data / file extraction

#### `read_image_text` (OCR) — image/scan → text
**Sources:** [naptha/tesseract.js](https://github.com/naptha/tesseract.js), [allenai/olmocr](https://github.com/allenai/olmocr)

Two-tier: **tesseract.js** (WASM, CPU-only, 100+ langs, word/char bbox) as the free in-process baseline that renders an annotated-box overlay; route hard cases (math/dense tables/handwriting) to **olmOCR-2-7B-1025** (Qwen2.5-VL-7B, emits Markdown+HTML-tables+LaTeX) served on the existing vLLM box. Corrections: unpdf is NOT in the codebase (renderPageAsImage would be new); ImageMagick+Ghostscript already present (via manipulate_image hybrid) can rasterize PDF pages. A weak OCR-ish path exists via `describe_image` (paid Gemini VLM, describe-oriented, no bboxes).

- **Renders as:** `display{kind:"image"}` (annotated-box overlay) + extracted text/Markdown as the text payload.
- **Recency:** tesseract.js v6→v7 evergreen; olmOCR-2 released Oct-2025 (current SOTA open OCR VLM).
- **Prism gap (partial):** no OCR/tesseract/olmocr anywhere. Nearest: `describe_image` (`CreativeRoutes.ts:355`, paid Gemini, no bboxes), `read_pdf` (pdf-parse text-layer, no OCR for scans). sharp present both services.
- **Build sketch:** add `read_image_text` to `WebTools.ts` (near read_pdf) — params input (URL/base64/imageId), lang, tier ('fast'|'quality'|'auto'), overlayBoxes, PDF page range. New `OcrService.ts`. Tier 1 = tesseract.js `createWorker` → text + bbox. Tier 2 (auto-route on low confidence) = olmOCR on vLLM via the existing describe_image provider path. Scanned PDFs: rasterize via existing ImageMagick/Ghostscript (or add pdfjs/unpdf). Overlay via manipulate_image Sharp composite+text. **Ship tesseract+overlay first (S); the auto-tier to olmOCR is what makes it actually good — don't ship tesseract-only as final.** Keep both `describe_image` (semantic) and `read_image_text` (verbatim).
- **Effort:** M · **Impact:** high (no OCR today; pairs with read_pdf; olmOCR on vLLM beats the paid Gemini path for verbatim extraction).

#### `scan_barcode` / `read_qr` — image → decoded payload
**Source:** [Sec-ant/zxing-wasm](https://github.com/Sec-ant/zxing-wasm) (v3.1.1)

**zxing-wasm** (ZXing-C++ → WASM, TS types) decodes QR/Aztec/DataMatrix/PDF417 + 1D EAN/UPC/Code128/39 from a Blob/File/ArrayBuffer/ImageData via `readBarcodes()`, no external service. Node caveat: copy `dist/full/zxing_full.wasm` into the project and call `prepareZXingModule()` once (fs-read override) before first read.

- **Renders as:** JSON payload (agent acts on decoded text); optional `display{kind:"image"}` of the source.
- **Recency:** v3.1.1 landed 2026-07-12.
- **Prism gap (missing):** grep `qr|barcode|scan|zxing|datamatrix|aztec|pdf417|ean|upc|code128|decode` finds only `generate_qr_code` (CREATE) + `convert_encoding` (unrelated). Prism can write codes but not read them. package.json has qrcode + sharp but no zxing.
- **Build sketch:** add `scan_barcode` (alias `read_qr`) to `CreativeTools.ts` beside generate_qr_code. Handler in `ComputeRoutes.ts` mirroring the QR handler: `lazyImport("zxing-wasm/reader")` (same lazyImport pattern at L107), resolve input via existing ImageService, `prepareZXingModule` once serving the copied wasm from disk, `readBarcodes(bytes, {tryHarder:true, formats:[...]})`. Add `zxing-wasm@^3.1.1` + copy the wasm into assets. **Ensure the wasm ships with the deploy artifact (deploy-kit) so it isn't CDN-fetched at runtime; pin the version.** Support multi-symbol images.
- **Effort:** S · **Impact:** medium (near-copy of generate_qr_code; concrete decode capability — URL/WiFi/vCard from any screenshot).

### 3.10 Personal-assistant / IoT ✨

#### ✨ `generate_ambient_soundscape` — endless generative music embed
**Sources:** [Tone.js](https://github.com/Tonejs/Tone.js), [Strudel](https://strudel.cc) (Codeberg uzu/strudel)

An engine-owned interactive embed whose page runs a **Tone.js / Web Audio** generative engine (chord pool + randomized note timing/panning/velocity + filtered noise bed) to play a never-repeating Brian-Eno-style ambient piece live in the browser, parameterized by key/scale/density/mood — the audio analogue of `create_vector_animation`. Distinct from `generate_audio` (fixed WAV). Runs entirely client-side in the iframe = **zero per-call cost, no LLM round-trip.** Strudel (@strudel/embed web component) is a live-coding-pattern variant.

- **Renders as:** `display{kind:"embed"}` (sandboxed iframe, web + Discord).
- **Recency:** Tone.js evergreen best-in-class (stable 15.1.22); Strudel alive (repo moved to Codeberg).
- **Prism gap (missing):** only audio-authoring tools are generate_audio/remix_audio/synthesize_speech/transcribe. `generate_audio` (`CreativeTools.ts:1363`) is a step-grid tracker rendering a FIXED WAV. Interactive-embed precedent is visual-only (`create_vector_animation` → `buildDisplay("embed",…)` `CreativeRoutes.ts:1929`, GET `/creative/vector-animation/embed` serves `buildEmbedHtml` w/ play/pause). No soundscape tool.
- **Build sketch:** new `generate_ambient_soundscape` in `CreativeTools.ts`, POST `/creative/soundscape` + GET `/creative/soundscape/embed` mirroring vector-animation (TTL embeds Map, mint embedId, `buildLocalUrl`, `buildDisplay("embed", url, {height:200})`). Embed page via `buildEmbedHtml()` inlining a Tone.js generative engine (PolySynth/FMSynth voices, StereoPanner, Tone.Noise bed, reverb/delay; mood→reverb-wet/tempo/register/density). **Bundle/serve tone.js from the tools-service origin (not CDN)** for reliable iframe load; ship a play button (autoplay-with-sound is gesture-gated); keep deterministic-per-seed for reproducible sessions.
- **Effort:** M · **Impact:** medium (high creative-delight ceiling; fills the audio-embed hole; no server DSP needed).

### 3.11 Tool ergonomics / smartness

#### `run_code` / Code Mode — run tools as a typed API in a sandbox
**Sources:** [Anthropic code-exec-with-MCP](https://www.anthropic.com/engineering/code-execution-with-mcp), [Cloudflare Code Mode](https://blog.cloudflare.com/code-mode) (`@cloudflare/codemode`)

One innate tool the model calls with TypeScript/JS that reaches Prism's ~280 tools as a **generated typed API** over the currently-enabled subset. Each binding awaits `ToolOrchestratorService.executeTool(name,args,context)` host-side, so **intermediate results (scrapes, filtered rows) stay out of the LLM context and only the final value returns** — chaining scrape→filter→chart in one turn. Cloudflare reports ~99.9% schema-token reduction; Anthropic reports ~150k→2k (98.7%) on a tool-heavy workflow (the second 43.6k→27.3k figure was not independently confirmed). Correction: Prism's sandbox is node:vm + python3, NOT QuickJS/microsandbox — a real isolate is optional hardening, not a prerequisite.

- **Renders as:** passthrough — if the final value is a display-bearing artifact (chart/diagram/map/vector-animation), forward its `display{kind,url}`; else text/console.
- **Recency:** Cloudflare + Anthropic posts within 6 months; InfoQ Apr-2026.
- **Prism gap (partial):** sandbox substrate exists (`execute_javascript` node:vm, `execute_python`, `execute_shell/command/browser_script`) but no tool bindings (grep `callTool|toolRegistry|invokeTool` inside interpreters = 0). The dispatch half is already built in prism-service: `ToolOrchestratorService.executeTool(name,args,context)` (`:1318`) + `getToolSchemas()` (`:979`). Substance (tools-as-typed-API + intermediate elision + one-turn chaining) is MISSING.
- **Build sketch:** cleanest as an INNATE tool in **prism-service** (the typed API must call `executeTool` host-side). (1) `run_code` def registered in `InternalToolRegistry`. (2) From `getToolSchemas()` for the persona's enabled tools, generate a small TS API (`const prism = { search_web(args), generate_chart(args), … }`) — reuses existing discovery scoping. (3) Execute model code in a sandbox where each `prism.<tool>()` awaits `executeTool` — **requires making execution async + allowing awaited host callbacks (the main real work)**. Reuse `OutputAccumulator`, cap timeout/output. (4) **Gate which tools are callable** (exclude/confirm destructive smart-home/shell/torrent). Optional hardening: isolated-vm/quickjs-emscripten. **Lead the framing with chaining/intermediate-elision, not schema-token savings** — Prism already solves schema bloat via innate discovery + two-tier docs.
- **Effort:** M · **Impact:** high (genuine cost/latency/reliability win for chained scrape→filter→render; security: gate destructive tools since node:vm isn't a boundary).

---

## 4. IMPROVE-EXISTING by tool

### `execute_python` → rich result envelope (charts + tables)
**Source:** [e2b-dev/code-interpreter](https://github.com/e2b-dev/code-interpreter) (result model), matplotlib Agg pattern

**Weak today:** returns text-only `{success,stdout,stderr,exitCode}` — route `UtilityRoutes.ts:531` does a bare `res.json(result)`. **Upgrade:** adopt the Jupyter/e2b rich model — but NOT via Pyodide (the card's proposed mechanism is wrong). The harness runs a **native python3 subprocess** and the host python3.12.9 **already has matplotlib 3.10.8 / pandas 2.3.3 / numpy 2.2.6** installed. So the free path: inject a preamble forcing the Agg backend, monkeypatch `plt.show()/savefig` to emit base64 PNG between stdout sentinels, capture DataFrame reprs; the route parses sentinels, uploads via `MinioService.uploadToolAsset(buf,'image/png')`, attaches `display:buildDisplay('image',url)` — **the exact plumbing the chart tool already uses** (`UtilityRoutes.ts ~688-716`). **VERIFIED MUST-FIX:** the sandbox PREAMBLE sets `RLIMIT_AS=256MB` and numpy/OpenBLAS reserve huge virtual address space → matplotlib import hangs/SIGKILLs even at ~67MB real RSS. Relax to RLIMIT_DATA/cgroup RSS, or set `OPENBLAS_NUM_THREADS=1`/`OMP_NUM_THREADS=1`/`MALLOC_ARENA_MAX` in the subprocess env. Multiple figures/run need the `images[]` array envelope (per lupos memory note), not the single `display` field.
- **Build sketch:** improve-existing (no new def). Extend PREAMBLE in `PythonInterpreterService.ts` + fix RLIMIT; parse sentinels in `UtilityRoutes.ts` POST `/python/execute` → MinIO → `buildDisplay('image',url)`; update description in en/caveman locale. Extend `PythonInterpreterService.test.ts`.
- **Effort:** M · **Impact:** high (zero per-call cost; any matplotlib/DataFrame/generative-art snippet becomes an embed; avoids one-tool-per-computation).

### `generate_chart` → richer catalog (ECharts SSR)
**Source:** [Apache ECharts SSR handbook](https://apache.github.io/echarts-handbook/en/how-to/cross-platform/server/)

**Weak today:** hard-capped to bar/line/pie static PNG. Def `UtilitiesTools.ts:236` `type.enum:["bar","line","pie"]`; route `UtilityRoutes.ts:588` `VALID_CHART_TYPES`; backend `ChartService.ts` (chartjs-node-canvas). **Upgrade:** swap to **ECharts 6.x SSR SVG** (`echarts.init(null,null,{renderer:'svg',ssr:true,width,height}).renderToSVGString()`, zero native deps, no headless browser), rasterize SVG→PNG via the already-installed `sharp`, keep MinIO + `display{kind:image}` + the `chartId` iterative merge (already implemented `UtilityRoutes.ts:656-670`). Unlocks scatter/area/stacked/dual-axis/heatmap/calendar/sankey/treemap/radar/candlestick/funnel/boxplot. **Prefer ECharts direct** over @antv/gpt-vis-ssr (pulls native node-canvas) and antvis/mcp-server-chart (defaults to the hosted Alipay SaaS — wrong for self-host). ECharts 6.0.0 shipped 2025-07-30 (card's "5.5" is stale).
- **Build sketch:** widen `type.enum` + per-type input validation (scatter/heatmap [x,y,value]; candlestick OHLC; sankey nodes+links; treemap hierarchical) in `UtilitiesTools.ts` + `UtilityRoutes.ts`; rewrite `ChartService.ts` to build an ECharts `option` per type → SSR SVG → sharp PNG. Extend `src/types/chart.ts`. Candlestick pairs with existing `get_historical_prices` OHLCV. Watch: ECharts SSR needs explicit width/height; embedded SVG fonts must be on the box.
- **Effort:** M · **Impact:** high (fills an explicit inventory gap; axis-family types are mechanical; exotic series each need a shape+validator).

### `generate_diagram` → multi-engine (Kroki + D2)
**Sources:** [yuzutech/kroki](https://github.com/yuzutech/kroki), [terrastruct/d2](https://github.com/terrastruct/d2)

**Weak today:** Mermaid-only, rendered client-side via jsdelivr CDN inside an embed page. Def `ComputeTools.ts:295`; impl `ComputeRoutes.ts:953-1057` (`buildMermaidEmbedHtml` imports mermaid@11 from cdn.jsdelivr.net L970; iterative `diagramId` append L1014-1046). **Upgrade:** point at a self-hosted **Kroki** deployment (NOT one image — core covers PlantUML/GraphViz/C4/D2/Vega-Lite/WaveDrom natively; Mermaid/BPMN/Excalidraw/diagrams.net need companion containers) and add **D2** as a selectable engine (free through Kroki, or `@terrastruct/d2` WASM for sketch mode; Dagre/ELK layout bundled, TALA is separate proprietary). Both emit real server-side SVG/PNG, removing the CDN dep. (Drop "Wardley" — not a Kroki grammar.)
- **Build sketch:** add `engine` enum param to `generate_diagram` (`ComputeTools.ts:295`), keep definition/theme/diagramId + locale. Rework the diagram section of `ComputeRoutes.ts` into a Kroki client — `KROKI_URL` env, POST raw text to `${KROKI_URL}/${engine}/svg` (or GET w/ pako deflate+base64), store `{definition,engine,theme}` in the existing diagramStore (diagramId append preserved), add GET `/compute/diagram/render?id=`. Switch `display` to `kind:"image"` (CDN-free, Discord-native SVG). **Cost-sensitive path: run Kroki core only** (covers D2 + text grammars); add browser companions only on demand.
- **Effort:** M · **Impact:** high (breadth + self-host ethos + creative genres; marginal value = "more genres + no CDN").

### ✨ `synthesize_speech_local` → neural TTS + zero-shot voice cloning (Chatterbox)
**Sources:** [resemble-ai/chatterbox](https://github.com/resemble-ai/chatterbox) (MIT, 25.5k★), [devnen/Chatterbox-TTS-Server](https://github.com/devnen/Chatterbox-TTS-Server)

**Weak today:** espeak-ONLY (`TextToSpeechService.ts` `ESPEAK_BINARY="espeak-ng"`, static voice map — robotic, no cloning/emotion). The neural `synthesize_speech` is PAID-cloud only (elevenlabs.ts/inworld.ts) with NO voice cloning. **Upgrade:** add a **Chatterbox** neural backend — zero-shot voice cloning from a few seconds of reference audio, an `exaggeration` emotion knob + `cfg_weight`, self-hostable via **devnen/Chatterbox-TTS-Server** (OpenAI-compatible `/v1/audio/speech` + richer `/tts`). Free local, escapes per-char billing. (Correction: 23-lang coverage is the separate Multilingual-500M build; Turbo-350M is speed/English. Every output carries Resemble's 'Perth' watermark.)
- **Build sketch:** stand up devnen/Chatterbox-TTS-Server (Docker Compose) on the GPU box. Add a `backend:"espeak"|"chatterbox"` param (+ `referenceAudio`, `exaggeration`, `cfgWeight`, `language`) to `synthesize_speech_local` (`CreativeTools.ts`, route POST `/creative/local-text-to-speech`). New `ChatterboxTtsService.ts` POSTing to `/tts` (cloning needs it; `/v1/audio/speech` is the simpler drop-in). Reuse remix_audio's audio-input plumbing for reference. `isChatterboxAvailable()` health check → graceful espeak fallback. Reuse base64-audio shape → `display{kind:"audio"}`.
- **Effort:** M (wiring is S; real cost = standing up the GPU server) · **Impact:** high (free local ElevenLabs-grade + voice-design for personas).

### `replace_in_file` → atomic multi-edit + lazy fast-apply
**Sources:** Claude Code MultiEdit, [Morph Fast Apply](https://www.morphllm.com/fast-apply-model), [openai/codex apply_patch V4A](https://github.com/openai/codex)

**Weak today:** single exact-match edit per call (`CoreWorkspaceTools.ts:85`; impl `AgenticFileService.ts:597` `agenticStringReplace` — exact indexOf, `writeFileAtomic`), brittle on whitespace, half-applied multi-round-trip states. **Upgrade (Part A, the high-confidence win):** accept an ordered `edits[]` array applied as **one all-or-nothing transaction** against an in-memory buffer (Claude Code MultiEdit semantics — each edit matches uniquely, sequential edits see prior output, write once, roll back on any miss). Provider-agnostic, free, local. **Part B (weaker for this owner):** lazy fast-apply — Morph is paid SaaS (no free self-host) and Prism already does targeted edits not whole-file rewrites, so token savings are smaller than Morph's headline; V4A only benefits OpenAI/vLLM not Claude. **Note the DORMANT `agenticPatchFile`** (`AgenticFileService.ts:692`, applies unified diff via `diff` npm, routed `AgenticRoutes.ts:264`) that no tool def exposes — expose it as a local `apply_patch` before building anything paid.
- **Build sketch:** extend `replace_in_file` schema with optional `edits:[{oldString,newString,allowMultiple?}]` (keep back-compat), generalize `agenticStringReplace` to fold edits sequentially (validate all match counts before mutating) → single `writeFileAtomic`, atomic rollback on failure. + en/caveman locale + tests. Defer paid Morph unless a self-hosted fast-apply model lands on the vLLM box.
- **Effort:** M (Part A alone S-M) · **Impact:** medium (removes the half-applied-batch failure class; the flashy fast-apply half is the most cost-questionable).

### ✨ `generate_image` → aspect/size/count/seed knobs + local FLUX backend
**Sources:** [Gemini 3 Pro Image](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-pro-image), [ComfyUI](https://github.com/comfyanonymous/ComfyUI) + [SaladTechnologies/comfyui-api](https://github.com/SaladTechnologies/comfyui-api), [FLUX.2](https://github.com/black-forest-labs/flux)

**Reframe:** instruct-editing + multi-reference compositing **already ships** (orchestrator auto-injects N reference images `ToolOrchestratorService.ts:1357-1408` + editing-system-prompt swap) — drop that from the pitch. **Buildable delta:** (1) expose **aspect ratio / resolution (1K/2K/4K) / count / seed** as explicit knobs — Gemini-3-pro-image supports them natively but Prism never threads `imageConfig/aspectRatio` (hardcoded 1K in an unused path `google.ts:1102`) and the route returns only `images[0]`; (2) add an optional **self-hosted ComfyUI FLUX.2/SDXL backend** for zero-per-call cost (entirely absent — grep `comfy|flux|sdxl|8188` = nothing).
- **Build sketch, two independent pieces:** **(A, M)** add params to `generate_image` in `CreativeTools.ts` (aspectRatio enum, imageSize 1K/2K/4K, count 1-4, seed) + locale; pass through `/creative/generate-image` in `CreativeRoutes.ts`; in prism-service extend `ProviderOptions` (`ProviderTypes.ts`) and set `config.imageConfig={imageSize,aspectRatio}` in `buildGenerateConfig` (`google.ts:303`); return N images. **(B, L, the substantive work)** new `ComfyUIService` POSTing a workflow-JSON template to `${COMFY_URL}/prompt` (reuse SaladTechnologies/comfyui-api for sync base64 response); add `COMFY_URL` + `backend` select ("gemini"|"flux-local"); upload via MinIO.
- **Effort:** L · **Impact:** medium (cost-savings + 4K/seed/aspect are real creative control; large chunk of claimed value already in prod).

### `execute_javascript` → true WASM isolation (QuickJS)
**Source:** [sebastianwessel/quickjs](https://github.com/sebastianwessel/quickjs) (v3.1.0)

**Weak today:** node:vm, **not a security boundary** — `JavaScriptInterpreterService.ts` default "sandboxed" tier nulls require/process/fetch but injects real host constructors, so `Function('return process')()` escapes (`this.constructor.constructor(...)`). Route `ComputeRoutes.ts:114` always runs the default tier; the `privileged` branch (L119) is unreachable. Real risk: indirect prompt injection via read_web_page/scrape tools steering model code to read vault secrets/MONGO_URI off the host. **Upgrade:** replace with **@sebastianwessel/quickjs v3.1.0** — QuickJS→WASM, true interpreter/WASM isolation, `executionTimeout`/`memoryLimit`/`maxStackSize` + optional `allowFs`(memfs)/`allowFetch`/`transformTypescript`. Two npm pkgs (wrapper + a `@jitl/quickjs-*-wasmfile-*` variant), both pure-WASM, zero infra on WSL2. microsandbox (libkrun) needs KVM/nested-virt — not the WSL2 path.
- **Build sketch:** backend swap in ONE file (`JavaScriptInterpreterService.ts`). At boot `const {runSandboxed} = await loadQuickJs(variant)` (cache the promise). Rewrite `executeJavaScript` to async: `await runSandboxed(async ({evalCode}) => evalCode(code), {executionTimeout, memoryLimit, allowFs:false, allowFetch:false})`. Map QuickJS result onto the existing `{success,output,result,...}` shape; pass a custom console into globals → `OutputAccumulator`. Make `ComputeRoutes.ts` `/js/execute` + `/js/stream` await (sync today). Rewrite the test with an escape-attempt assertion. Tradeoffs: interpreter (slower hot loops), WASM module load up front (then fast per-call), async needs the asyncify variant.
- **Effort:** M · **Impact:** medium (closes a real RCE→secret-exfil path; plumbing-grade, no embed delight).

### `control_browser` → natural-language act/extract (Stagehand)
**Source:** [browserbase/stagehand](https://github.com/browserbase/stagehand) (v3.7.0, MIT)

**Weak today:** pure Playwright, one-action-per-call — `AgenticBrowserService.ts` action enum navigate/click/type/scroll/snapshot/click_ref/… (selector + ARIA-ref driven), no NL `act()`, no schema-typed `extract()`, no `observe()`. **Upgrade:** layer **Stagehand** (`act('click sign-in')`, `extract(instruction, zodSchema)→typed`, `observe()→candidates`, action caching + selfHeal) **fully local** via `env:'LOCAL'` + a `CustomOpenAIClient` pointed at the vLLM/Ollama box (no Browserbase cloud). **Honest downside capping it at medium:** local-model reliability is the documented weak link — extract()'s strict Zod validation frequently fails on smaller self-hosted models (keep the selector/ref actions as deterministic fallback, pin a capable instruction-tuned model at low temp).
- **Build sketch:** add act/extract/observe to `BrowserTools.ts` action enum + `instruction`/`schema` params. New `StagehandBrowserService.ts` (or extend AgenticBrowserService): `npm i @browserbasehq/stagehand openai`, lazily construct Stagehand keyed by sessionId with `enableCaching:true, selfHeal:true`. Minimal build = Stagehand owns its own Chromium session; full build hands it the existing per-session page (watch issue #1392). Convert the JSON-schema `schema` param → zod for extract(). Config via `PRISM_SERVICE_URL` gateway or new `TOOLS_BROWSER_LLM_URL/MODEL`. extract → structured data (text/table, no new embed); screenshots already render.
- **Effort:** M · **Impact:** medium (smarter browser control, fewer round-trips; utility not novelty; local-model flakiness is the risk).

### `read_pdf` / `read_docx` → layout + tables + OCR (unpdf / Docling)
**Sources:** [unjs/unpdf](https://github.com/unjs/unpdf), [docling-project/docling-serve](https://github.com/docling-project/docling-serve)

**Weak today:** `read_pdf` (`PdfFetcher.ts`, pdf-parse) is text-only — metadata + links + page selection but no table structure/OCR/page images, so scanned/columnar PDFs degrade. **Two complementary upgrades:** **(1, S, cheap win)** **unpdf** (v1.6.2, pure-JS PDF.js) adds `extractImages/extractLinks/renderPageAsImage` — a `display{kind:image}` page or OCR feedstock; needs pdfjs-dist + a canvas native dep; does NOT do tables/OCR itself. **(2, L, the tables/OCR headline)** **docling-serve** (v1.26.0, MIT, CPU+CUDA containers) converts PDF/DOCX/PPTX→Markdown with TableFormer table-structure recognition (~97.9% complex-table) + OCR for scans — cost is a 4.4–11.4GB self-hosted container (owner's vLLM GPU box could host the CUDA image). **Corrections:** `read_docx` (mammoth) ALREADY emits markdown tables and `read_spreadsheet` (exceljs) ALREADY handles XLSX — so the genuinely-new value is PDF table/layout + OCR + PPTX + page-image, NOT docx tables or xlsx.
- **Build sketch:** extend `read_pdf` (add renderPage/highFidelity/ocr params) or add `read_document` in `WebTools.ts`. **unpdf path:** add unpdf + @napi-rs/canvas, enrich `PdfFetcher.ts` with extractImages/extractLinks + renderPage → `display{kind:"image"}`. **Docling path:** new `DoclingFetcher.ts` POSTing to a self-hosted docling-serve container's convert endpoint; map md_content→markdown and tables→rows that pipe into `generate_chart` (iterative). **Build unpdf first (S, high ROI); Docling is an optional heavier tier for scanned/tabular PDFs + PPTX.**
- **Effort:** M (unpdf S, docling L) · **Impact:** medium (PDF-OCR + page-image axis genuinely additive; partial redundancy with existing docx/xlsx tools).

### `search_papers` → citation network + author metrics + trends (OpenAlex)
**Source:** [oksure/openalex-research-mcp](https://github.com/oksure/openalex-research-mcp) (TS blueprint)

**Weak today:** arXiv keyword-only — def `KnowledgeTools.ts:334`, impl `ArxivFetcher.ts` (Atom XML), route `KnowledgeRoutes.ts:186`. grep `openalex|citation|h-index|seminal|semantic.?scholar|collaborator` = ZERO. **Upgrade:** an **OpenAlex**-backed literature-review layer (240M+ works, plain REST/JSON): forward/backward citation traversal (`cited_by`/`referenced_works`), citation-network graph, find_seminal/find_review, author h-index+i10+collaborators (read straight from `summary_stats`, no computation), topic-trend analysis, OA resolution. **Correction to "free keyless":** since 13-Feb-2025 OpenAlex is usage-priced — data free, keyless ~$0.10/day, **a FREE API key (30-sec signup) = ~$1/day (~10k filter calls / 1k searches)**; ID/DOI lookups $0. At single-user volume effectively free with the key — store `OPENALEX_API_KEY` + polite-pool email in vault.
- **Build sketch:** new `src/fetchers/knowledge/OpenAlexFetcher.ts` (plain fetch; JSON not XML). Keep the tool count TIGHT (~4-5, not the reference MCP's 31): upgrade `search_papers` to optionally hit OpenAlex; `get_paper_citations`; `get_citation_network`→`display{kind:"diagram"}` Mermaid graph (PageRank-style ranking like Inciteful); `get_author_metrics`; `analyze_topic_trends`→`display{kind:"chart"}`. Reference blueprint: oksure/openalex-research-mcp.
- **Effort:** M · **Impact:** medium (turns flat search into a lit-review engine; citation networks render as diagram embeds; usage depth unknown).

### ✨ `paint_lights_from_image` — photo → LIFX lighting scene
**Source:** [Vibrant-Colors/node-vibrant](https://github.com/Vibrant-Colors/node-vibrant) (v4.0.4)

*(Classified improve-existing — extends the LIFX suite by consuming an existing batch tool.)* **node-vibrant v4** runs server-side (`import {Vibrant} from "node-vibrant/node"`); `Vibrant.from(src).getPalette()` returns 6 weighted semantic swatches (Vibrant/Muted/Dark/Light + population), each rgb/hex/hsl. Its Node backend is **sharp** (already a dep). Sort swatches by population and distribute the top N across Prism's EXISTING `set_light_states` batch tool to build "set the room to match this photo," sourced from generate_image/search_images/attachments.
- **Renders as:** optional `display{kind:"image"}` palette strip.
- **Prism gap (missing):** both halves exist but were never joined — `set_light_states` (`SmartHomeTools.ts:354` → `LightsDataService.setStates` `:156`, PUT `/lights/states`) + image sources, but NO image→palette extraction (`convert_color` is single-color; manipulate_image metadata has no dominant colors). grep `node-vibrant|dominant.?color|getPalette|quantize` = zero.
- **Build sketch:** add `paint_lights_from_image` to `SmartHomeTools.ts`. New method (LightsDataService or a creative fetcher): resolve image via `ImageService.ts` → buffer → `Vibrant.from(buffer).getPalette()` → sort by population → map top N to LIFX selectors (default 'all') → `setStates()`. Optional palette-strip PNG via sharp. Add `node-vibrant@^4` (verify its sharp coexists with ^0.34.5).
- **Effort:** S · **Impact:** medium (all heavy plumbing exists; creative-lighting delight for a circadian-engine hobbyist).

### `input_examples` on tool definitions
**Source:** [Anthropic advanced-tool-use](https://www.anthropic.com/engineering/advanced-tool-use)

**Weak today:** Prism embeds example invocations only as free-text prose inside locale descriptions (`generate_diagram.params.definition` "Examples: graph TD…", `draw_turtle_graphics` "EXAMPLES:…", `generate_audio.params.timeSignature`). `ToolDefinition` (`src/types/tools.ts`) has no examples field; `anthropic.ts` `buildTools()` (L534-543) emits only `{name,description,input_schema}`. **Upgrade:** add an optional structured `inputExamples` field (1-5 curated minimal/partial/full invocations) and emit it as Anthropic's native `input_examples` (beta header `advanced-tool-use-2025-11-20`) — Anthropic reports complex-parameter accuracy 72%→90% (Nov 24 2025). For vLLM/OpenAI/Ollama the same examples fold into the description as a few-shot block.
- **Build sketch:** add `inputExamples?: Array<Record<string,unknown>>` to `ToolDefinition` (flows to `ToolSchemaForAI` automatically). Curate 1-5 JSON examples on the trickiest defs (create_vector_animation, generate_diagram, draw_turtle_graphics, generate_audio, evaluate_expression, render_latex, iterative chart/map/csv) — arg-value objects, no locale translation needed. In `anthropic.ts buildTools()` (~L537) add `input_examples` + set the beta header when any tool carries examples. For non-Anthropic providers append a serialized few-shot block to the description.
- **Effort:** M (mechanism S; curation is the cost) · **Impact:** medium (incremental accuracy on already-working tools; lands when full schema is pulled on demand).

### `response_format`/verbosity toggle + human-readable result fields
**Source:** [Anthropic writing-tools-for-agents](https://www.anthropic.com/engineering/writing-tools-for-agents)

**Weak today (partial):** the semantic-field-naming half is ALREADY done — `DiscordDataService` compact mode comments "human-readable names," FIELDS lists are semantic, and the `mime_type/uuid` hits are internal Minio/Image/Video/TTS plumbing, not agent-facing. `search_discord_messages` already has a real verbosity toggle (`mode: messages|count|compact`, `DiscordTools.ts:69`); `read_pdf` already has maxChars/maxPages. **Genuine net-new:** add a single SHARED `response_format:"concise"|"detailed"` enum (localized once) to the still-verbose tools — **read_pdf, analyze_csv, web_search/fetch_url, and the classifieds/products search_* family** — where "concise" server-side projects to high-signal fields (mirror the Discord compact pattern). grep `response_format|verbosity` = 0 hits.
- **Build sketch:** add a reusable `responseFormatParam()` helper in `tool-definitions/utils.ts` (or fields.ts), spread into the target defs; thread through each fetcher/service where a concise branch trims fields; one `common.response_format` string in en/caveman. Per-tool unit test asserting concise omits trimmed fields.
- **Effort:** M (param alone is a no-op without the per-tool projection) · **Impact:** medium (standardize the verbosity pattern Prism already uses in Discord across other chatty tools; do opportunistically when touching each fetcher).

### `control_browser` / `execute_browser_script` → screenshot ergonomics
**Sources:** [simonw/shot-scraper](https://shot-scraper.datasette.io/en/stable/screenshots.html), Playwright device emulation

**Weak today:** selector element capture AND full-page stitching **already exist** (`AgenticBrowserService.ts` `actionScreenshot` L257-284, `element.screenshot()` + fullPage) — so the card oversells. **Genuine net-new (~3 ergonomics):** selector `padding`, `retina`/`scaleFactor` (deviceScaleFactor — context-level, so needs a dedicated scaled context — the real work), and an inline `preShotJs` hook to dismiss cookie banners before the shot (already 2-call-able via `evaluate`→`screenshot`). Plus an optional **device-frame mockup** output (Playwright device descriptors give only viewport/DPR/UA — you must source+bundle bezel PNG assets and Sharp-composite; the card's own idea, not shot-scraper).
- **Build sketch:** add `padding`/`retina`/`preShotJs` params to `BrowserTools.ts` + locale; in `actionScreenshot`: preShotJs → `page.evaluate` before capture (trivial); padding → boundingBox+expand→`page.screenshot({clip})`; retina → dedicated context with `{deviceScaleFactor}`. Device-frame: new `device_mockup` action reading `devices[name]` → screenshot into that context → Sharp `.composite()` onto a bundled bezel PNG. Rides the existing screenshot→MinIO image-embed path (`ToolOrchestratorService.ts:1559-1582`).
- **Effort:** M · **Impact:** medium (retina + selector-padding modestly sharpen "just the chart" shots; device frames niche-but-delightful — split into a separate creative tool gated on bezel assets).

---

## 5. Quick-wins shortlist (S-effort, high-delight)

Ship these first — small, mostly self-contained, high creative or utility payoff:

| Tool | Kind | Why it's a quick win |
|------|------|----------------------|
| ✨ `render_code` (code→image) | new | S; Prism emits code constantly; deterministic; copies `/compute/latex` + `buildEmbedHtml`; **zero-new-dep** playwright+sharp path exists |
| ✨ `generate_avatar` (DiceBear) | new | S; near copy-paste from `generate_qr_code`; identity primitive feeding create_custom_agent |
| ✨ `generate_ascii_banner` (figlet) | new | S; figlet already transitively in the lockfile; renders in Discord code blocks; completes the ASCII pair |
| `scan_barcode` (zxing-wasm) | new | S; near-copy of the QR route; ImageService input already solved; complements generate_qr_code |
| ✨ `paint_lights_from_image` | improve | S; both halves already ship (set_light_states + ImageService); just add node-vibrant + a mapping fn |
| ✨ `generate_meme` (memegen) | new | S; keyless free URL API; slots into CreativeTools + a thin fetcher |
| `translate_text` (LibreTranslate) | new | S; thin two-endpoint REST wrapper; only cost is standing up the container |

Also worth flagging as **near-free existing-code wins:** exposing the dormant `agenticPatchFile` as a local `apply_patch` tool, and adding a `diagnostics` case to the already-built LSP subsystem (`get_diagnostics`/`code_intel`) — both "finish WIP" rather than greenfield.

---

## 6. Appendices

### Appendix A — full candidate → theme → effort → impact

| Candidate | Kind | Theme | Creative | Status | Eff | Imp |
|-----------|------|-------|:-------:|--------|-----|-----|
| generate_3d_model / image_to_3d | new | creative-visual | ✨ | missing | M | high |
| remove_background | new | creative-visual | ✨ | missing | M | high |
| generate_card (Satori) | new | creative-visual | ✨ | missing | M | high |
| pixelate_image / dither | new | creative-visual | ✨ | missing | M | med |
| generate_image upgrade (aspect/size/count/FLUX) | improve | creative-visual | ✨ | partial | L | med |
| generate_song (ACE-Step) | new | creative-audio | ✨ | partial | M | high |
| generate_sheet_music (abcjs/Verovio) | new | creative-audio | ✨ | partial | M | high |
| synthesize_speech_local upgrade (Chatterbox) | improve | creative-audio | ✨ | partial | M | high |
| render_code (code→image) | new | creative-text | ✨ | missing | S | high |
| generate_ascii_banner (figlet) | new | creative-text | ✨ | missing | S | med |
| generate_video (LTX) | new | video-media | ✨ | missing | M | high |
| visualize_audio (ffmpeg) | new | video-media | ✨ | missing | M | med |
| compose_video / edit_video (editly/ffmpeg) | new | video-media | | missing | M | med |
| chess (Stockfish/chess.js) | new | games-novelty | ✨ | missing | M | med |
| generate_meme (memegen) | new | games-novelty | ✨ | partial | S | med |
| generate_avatar (DiceBear) | new | games-novelty | ✨ | missing | S | med |
| generate_chart upgrade (ECharts SSR) | improve | data-viz | | partial | M | high |
| generate_diagram upgrade (Kroki+D2) | improve | data-viz | | partial | M | high |
| generate_map upgrade (staticmaps) | improve | data-viz | | partial | M | med |
| ast-grep structural search/rewrite | new | core-coding | | partial | M | med |
| replace_in_file upgrade (multi-edit) | improve | core-coding | | partial | M | med |
| get_diagnostics / code_intel (LSP) | new | core-coding | | partial | S | med |
| control_browser upgrade (Stagehand) | improve | browser | | partial | M | med |
| browser screenshot ergonomics | improve | browser | | partial | M | med |
| search_papers upgrade (OpenAlex) | improve | knowledge | | partial | M | med |
| query_wikidata (SPARQL) | new | knowledge | | missing | M | med |
| translate_text (LibreTranslate) | new | knowledge | | missing | S | med |
| execute_python upgrade (rich results) | improve | dev-ops | | partial | M | high |
| execute_javascript upgrade (QuickJS) | improve | dev-ops | | partial | M | med |
| send_email / read_email (SMTP/IMAP) | new | comms-social | | missing | M | high |
| post_to_social (Bsky/Masto/Nostr) | new | comms-social | | partial | M | med |
| Discord poll/event/emoji (+send_message) | new | comms-social | ✨ | missing | M | med |
| read_pdf/read_docx upgrade (unpdf/Docling) | improve | data-extraction | | partial | M | med |
| read_image_text (OCR) | new | data-extraction | | partial | M | high |
| scan_barcode / read_qr (zxing) | new | data-extraction | | missing | S | med |
| paint_lights_from_image (node-vibrant) | improve | personal-iot | ✨ | missing | S | med |
| generate_ambient_soundscape (Tone.js) | new | personal-iot | ✨ | missing | M | med |
| run_code / Code Mode | new | tool-ergonomics | | partial | M | high |
| input_examples on tool defs | improve | tool-ergonomics | | partial | M | med |
| response_format / verbosity toggle | improve | tool-ergonomics | | partial | M | med |

*Impact values are the verifiers' refined (adversarial) ratings, which downgrade several original claims (generate_image, ast-grep, replace_in_file, execute_javascript, control_browser, read_pdf → medium).*

### Appendix B — rejected candidates
None. Every surveyed candidate was confirmed real, current, and either genuinely missing or genuinely weaker-than-proposed in Prism. One item carries a recency flag: **generate_map / staticmaps** — `recencyOk=false` [evergreen/older: staticmaps is 2.5y stale with a pinned old sharp 0.33.2; acceptable only as the niche leader or by vendoring ~200 lines of tile compositing].
