# Video Replica

Video Replica is a cross-platform Electron production studio that turns a source video or original script into an editable, AI-directed first cut. It combines transcription, scene direction, licensed stock discovery, caption planning, a multi-track timeline, secure provider management, and background job orchestration behind a premium desktop interface.

## Run

1. Copy `.env.example` to `.env` and add the four provider keys (or add them later in **Settings → AI & providers**).
2. Run:

```powershell
npm install
npm run dev
```

Production commands:

```powershell
npm run build       # type-check and bundle Electron, preload, and renderer
npm run package     # create the Windows installer
```

### macOS packages

macOS packages must be built on macOS so Electron, FFmpeg, and yt-dlp match the target CPU. The workflow in `.github/workflows/build-macos.yml` creates both:

- `Video-Replica-<version>-arm64.dmg` for Apple Silicon MacBooks (M1 and newer);
- `Video-Replica-<version>-x64.dmg` for Intel MacBooks.

Push the source to GitHub, open **Actions → Build macOS installers → Run workflow**, then download the appropriate artifact. Local Mac builds can use:

```bash
VIDEO_REPLICA_SKIP_PYTHON=1 npm ci
npm run package:mac
```

CI artifacts are unsigned development builds. For public distribution, configure an Apple Developer ID certificate and notarization credentials instead of disabling identity discovery.

`npm install` automatically:

- downloads the Electron runtime even when npm install hooks are restricted;
- generates the Prisma client and creates the runtime directory structure;
- creates a Python virtual environment and installs the media-analysis requirements;
- detects or provides FFmpeg/FFprobe and yt-dlp binaries;
- prepares SQLite persistence with no database server or compiler toolchain.

Set `VIDEO_REPLICA_SKIP_PYTHON=1` only in CI or frontend-only development when the optional computer-vision worker is not needed.

## Implemented product flow

- Premium black/gold dashboard with projects, operational status, recent work, and system capacity.
- Three-step production wizard for source links/custom scripts, narration mode, visual energy, templates, format, and resolution.
- Non-blocking production queue with cancel-safe jobs and live stage progress.
- Real yt-dlp audio extraction and Groq Whisper word-timestamp transcription when Groq is configured.
- Groq scene direction with a deterministic offline fallback for local UI development.
- Parallel Pexels/Pixabay licensed-stock discovery and duplicate-aware asset selection.
- ElevenLabs narration generation for AI-voice and custom-script productions.
- Persistent scene plan and editable five-track timeline (visuals, graphics, captions, narration, music).
- Native save dialog and local FFmpeg MP4 export with scene composition, narration, and embedded captions.
- Program monitor, playhead, scene inspector, production score, template library, project library, render queue, and asset library.
- OS-encrypted API-key storage; credentials never enter renderer memory unless the user types a replacement.
- Local SQLite database, automatic project directories, cache/log locations, and structured Winston logs.
- Sandboxed renderer, isolated preload bridge, validated IPC payloads, denied remote navigation/popups, and restrictive CSP.

## Architecture

```text
React renderer
  └─ typed preload bridge (context isolation + sandbox)
      └─ Electron main process
          ├─ ProjectDatabase (SQLite/WASM, atomic file persistence)
          ├─ ProductionPipeline (concurrent PQueue jobs)
          ├─ ProviderHub (Groq, Pexels, Pixabay; ElevenLabs-ready boundary)
          ├─ MediaService (yt-dlp + FFmpeg)
          ├─ SettingsService (Electron safeStorage)
          ├─ RuntimePaths / logs / cache
          └─ Python JSON-lines media worker
```

Shared types and Zod validation live in `src/shared`. Privileged code is kept in `src/main`; the renderer has no Node.js access.

## Data locations

At first launch the app creates these folders below Electron's per-user application-data directory:

`Projects`, `Cache`, `Assets`, `Images`, `Videos`, `Music`, `Voice`, `Transcript`, `Exports`, `Renders`, `Logs`, `Settings`, `Temp`, and `Database`.

The repository also creates a git-ignored `runtime/` mirror during setup so build tooling can validate directory initialization without touching user projects.

## Technology decisions

- **Electron-Vite** provides a maintained, fast three-process build instead of a custom webpack stack.
- **React + TypeScript + Tailwind CSS 4** power a strict, component-based renderer.
- **SQLite via sql.js** avoids Visual Studio/node-gyp requirements and works from paths containing spaces. Prisma remains the canonical relational schema and generated typed model for future native/server deployments.
- **PQueue** provides lightweight, dependency-free background concurrency appropriate for a single-user desktop app; a Redis/BullMQ service would add an unnecessary external install.
- **FFmpeg static + system detection** provides a clone-and-run fallback while preferring a working system binary when present.
- **Electron safeStorage** protects API keys with the operating-system credential encryption facility.

## Security

Do not commit `.env`; it is excluded by `.gitignore`. If a credential has ever been pasted into a chat, issue tracker, or public log, rotate it with the provider before shipping the application.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for engine boundaries and extension points.
