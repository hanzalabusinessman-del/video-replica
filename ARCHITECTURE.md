# Architecture and engine boundaries

## Desktop boundary

The React renderer is treated as untrusted UI. It cannot import Node.js, Electron, filesystem, database, or provider modules. A minimal typed preload API exposes only validated project, job, settings, and system operations. The main process denies permissions, new windows, and renderer navigation.

## Production pipeline

Each generation request becomes a persistent job and runs in a `PQueue` worker. The current stages are:

1. prepare isolated project directories;
2. extract source audio with yt-dlp/FFmpeg;
3. transcribe with Groq Whisper and persist word timestamps;
4. analyze narrative intent and plan scenes with Groq;
5. discover licensed media from Pexels and Pixabay concurrently;
6. choose non-duplicate assets and build the timeline tracks;
7. create captions/graphics metadata and calculate a production score;
8. persist a ready-to-review first cut.

Every stage publishes a typed `JobUpdate` event. The renderer can close the progress panel without interrupting work. A cancelled job stops at the next stage boundary. Failures are persisted and logged without crashing the UI.

## Extension interfaces

- `ProviderHub` is the replaceable LLM, transcription, voice, and stock boundary. New providers should normalize their response into `TranscriptResult`, `PlannedScene`, or `StockResult`.
- `MediaService` owns process execution and must remain the only place that invokes yt-dlp/FFmpeg download operations.
- `ProductionPipeline` coordinates engines but should not contain provider-specific request code.
- `ProjectDatabase` owns persistence. UI components never receive raw database rows.
- `python/worker.py` is a JSON-lines process boundary for OpenCV/ONNX/MediaPipe tasks; it can be scaled to a worker pool without changing renderer IPC.

## Persistence and recovery

SQLite runs in-process through WebAssembly, so end users do not need Python, Visual Studio, node-gyp, or a database service to open projects. Mutating operations export the database atomically to the application data directory. Each production also receives a self-contained directory for sources, transcripts, assets, voice, previews, and renders.

The Prisma schema mirrors the production model for migrations, inspection, future server synchronization, and typed backend expansion.

## Rendering

`RenderService` is isolated from the creative pipeline so an FFmpeg failure cannot corrupt the scene plan. It materializes provider previews into a project-scoped render cache, creates correctly timed scene inputs, compiles an FFmpeg filter graph, maps generated or original narration, embeds an SRT-derived caption track, and writes a fast-start MP4 through the native save dialog. The current encoder is the portable `libx264` fallback; hardware encoder probing can be added behind this service without changing the editor or database model.
