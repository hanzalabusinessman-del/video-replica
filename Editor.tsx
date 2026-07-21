import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Captions, ChevronDown, CircleGauge, Download, Film, Image, Layers3, Maximize2, Music2, Pause, Play, Plus, Redo2, Scissors, SkipBack, SkipForward, Sparkles, TextCursorInput, Undo2, Volume2, WandSparkles, X, ZoomIn, ZoomOut } from 'lucide-react'
import type { AspectRatio, JobUpdate, Scene, TimelineClip, TimelineTrack } from '../../../shared/types'
import { pipelineStages } from '../../../shared/types'
import { useAppStore } from '../store'
import { TimelineEditor, type TimelineEditorHandle } from '../components/TimelineEditor'

const timecode = (ms: number) => {
  const total = Math.max(0, ms) / 1000; const minutes = Math.floor(total / 60); const seconds = Math.floor(total % 60); const frames = Math.floor((total % 1) * 30)
  return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}:${String(frames).padStart(2,'0')}`
}

const isVideoAsset = (scene?: Scene): boolean => !!scene?.assetUrl && scene.visualType === 'video' && !/\.(?:jpe?g|png|webp)(?:$|\?)/i.test(scene.assetUrl)
const playableSource = (source?: string): string | undefined => source && !/^[a-z][a-z\d+.-]*:/i.test(source) ? encodeURI(`file:///${source.replace(/\\/g, '/')}`) : source

function GenerationPanel({ job, onClose, onRetry }: { job: JobUpdate; onClose(): void; onRetry(): void }): React.JSX.Element {
  const currentIndex = pipelineStages.findIndex(([id]) => id === job.stage)
  return <motion.div className="generation-panel" initial={{ opacity: 0, x: 25 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 25 }}>
    <div className="generation-head"><div className={`director-orb ${job.status === 'failed' ? 'failed' : ''}`}><span /><WandSparkles /></div><div><span>AI PRODUCTION CREW</span><h3>{job.status === 'complete' ? 'First cut ready' : job.status === 'failed' ? 'Production stopped' : 'Directing your video'}</h3></div>{['complete','failed'].includes(job.status) && <button onClick={onClose}><X /></button>}</div>
    <div className="generation-score"><strong>{job.progress}<small>%</small></strong><div><span>{job.detail}</span><div><i style={{ width: `${job.progress}%` }} /></div></div></div>
    <div className="stage-list">{pipelineStages.map(([id, label], index) => <div key={id} className={index < currentIndex || job.status === 'complete' ? 'done' : index === currentIndex ? 'active' : ''}><span>{index < currentIndex || job.status === 'complete' ? '✓' : index + 1}</span><p>{label}</p>{index === currentIndex && job.status === 'running' && <i />}</div>)}</div>
    {job.status === 'failed' ? <div className="generation-error"><strong>What happened</strong><p>{job.error || 'The production pipeline could not continue.'}</p><button className="button primary" onClick={onRetry}><Sparkles /> Retry production</button></div> : <p className="generation-note">You can keep working in Video Replica. The production crew runs safely in the background.</p>}
  </motion.div>
}

function Preview({ scene, playing, playhead, referenceStyle, aspectRatio }: { scene?: Scene; playing: boolean; playhead: number; referenceStyle: boolean; aspectRatio: AspectRatio }): React.JSX.Element {
  const sceneWords = scene?.narration.split(/\s+/).filter(Boolean) ?? []
  const sceneProgress = scene ? Math.max(0, Math.min(.999, (playhead - scene.startMs) / Math.max(1, scene.endMs - scene.startMs))) : 0
  const referenceWord = sceneWords[Math.floor(sceneProgress * sceneWords.length)] ?? ''
  return <div className={`preview-canvas ratio-${aspectRatio.replace(':','-')}`} style={{ aspectRatio: aspectRatio.replace(':', ' / ') }}><div className="preview-noise" />{isVideoAsset(scene) ? <video src={playableSource(scene?.assetUrl)} autoPlay={playing} muted loop playsInline /> : scene?.assetUrl && <img src={playableSource(scene.assetUrl)} alt="Selected stock preview" />}
    <div className="preview-gradient" />{referenceStyle ? <div className="reference-caption-preview">{referenceWord}</div> : <div className="preview-content"><span>{scene?.topic ?? 'AI DIRECTOR'}</span><h2>{scene?.narration ?? 'Your visual story is taking shape.'}</h2><div className="caption-preview">{(scene?.narration ?? 'BUILD SOMETHING REMARKABLE').split(/\s+/).slice(0, 5).map((word, index) => <b key={`${word}-${index}`} className={index === 2 ? 'active' : ''}>{word} </b>)}</div></div>}
    {!scene?.assetUrl && <div className={`preview-orb ${playing ? 'playing' : ''}`}><span /><Sparkles /></div>}<div className="safe-frame" /></div>
}

export function Editor(): React.JSX.Element {
  const { projectId = '' } = useParams(); const navigate = useNavigate(); const queryClient = useQueryClient(); const jobs = useAppStore((state) => state.jobs); const setJob = useAppStore((state) => state.setJob)
  const [selectedScene, setSelectedScene] = useState(0); const [playing, setPlaying] = useState(false); const [playhead, setPlayhead] = useState(0); const [showGeneration, setShowGeneration] = useState(true)
  const [exporting, setExporting] = useState(false); const [exportedPath, setExportedPath] = useState(''); const [exportError, setExportError] = useState('')
  const [audioAvailable, setAudioAvailable] = useState(true); const audioRef = useRef<HTMLAudioElement>(null)
  const [tracks, setTracks] = useState<TimelineTrack[]>([]); const [timelineSaving, setTimelineSaving] = useState(false)
  const timelineRef = useRef<TimelineEditorHandle>(null); const loadedProject = useRef(''); const saveTimer = useRef<number | undefined>(undefined)
  const { data: project, isLoading } = useQuery({ queryKey: ['project', projectId], queryFn: () => window.videoReplica.projects.get(projectId), refetchInterval: 2500 })
  const job = useMemo(() => Object.values(jobs).filter((item) => item.projectId === projectId).sort((a,b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')).at(-1), [jobs, projectId])
  const duration = Math.max(project?.scenes.at(-1)?.endMs ?? 0, project?.duration ?? 0, ...tracks.flatMap((track) => track.clips.map((clip) => clip.startMs + clip.durationMs)), 0)
  useEffect(() => { if (project && loadedProject.current !== project.id) { loadedProject.current = project.id; setTracks(project.tracks) } }, [project])
  useEffect(() => () => { if (saveTimer.current) window.clearTimeout(saveTimer.current) }, [])
  const updateTimeline = useCallback((next: TimelineTrack[]): void => {
    setTracks(next); setTimelineSaving(true); if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => { void window.videoReplica.projects.saveTimeline(projectId, next).then(() => queryClient.invalidateQueries({ queryKey: ['project', projectId] })).finally(() => setTimelineSaving(false)) }, 450)
  }, [projectId, queryClient])
  useEffect(() => { if (!playing || !duration || audioAvailable) return; const timer = window.setInterval(() => setPlayhead((value) => value >= duration ? 0 : value + 100), 100); return () => window.clearInterval(timer) }, [playing, duration, audioAvailable])
  useEffect(() => { if (!project?.scenes.length) return; const index = project.scenes.findIndex((scene) => playhead >= scene.startMs && playhead < scene.endMs); if (index >= 0) setSelectedScene(index) }, [playhead, project?.scenes])
  if (isLoading || !project) return <div className="editor-loading"><div className="director-orb"><span /><WandSparkles /></div> Opening production…</div>
  const scene = project.scenes[selectedScene]
  const activeVisualClip = tracks.find((track) => track.type === 'video')?.clips.find((clip) => playhead >= clip.startMs && playhead < clip.startMs + clip.durationMs)
  const activeScene = activeVisualClip ? project.scenes.find((item) => item.id === activeVisualClip.sceneId) ?? scene : scene
  const previewScene: Scene | undefined = activeVisualClip && activeScene ? { ...activeScene, topic: activeVisualClip.label, startMs: activeVisualClip.startMs, endMs: activeVisualClip.startMs + activeVisualClip.durationMs, assetUrl: activeVisualClip.source ?? activeScene.assetUrl, visualType: /\.(?:jpe?g|png|webp)$/i.test(activeVisualClip.source ?? '') ? 'image' : 'video' } : activeScene
  const retryGeneration = async (): Promise<void> => { const nextJob = await window.videoReplica.jobs.start(project.id); setJob(nextJob); setShowGeneration(true) }
  const exportVideo = async (): Promise<void> => { setExportError(''); setExportedPath(''); setExporting(true); try { const path = await window.videoReplica.renders.export(project.id); if (path) setExportedPath(path) } catch (error) { setExportError(error instanceof Error ? error.message : 'Export failed') } finally { setExporting(false) } }
  const togglePlayback = async (): Promise<void> => { const audio = audioRef.current; if (audioAvailable && audio) { if (audio.paused) { try { await audio.play() } catch { setAudioAvailable(false); setPlaying(true) } } else audio.pause() } else setPlaying((value) => !value) }
  const seekTo = (value: number): void => { setPlayhead(value); if (audioAvailable && audioRef.current) audioRef.current.currentTime = value / 1000 }
  const importMedia = async (): Promise<void> => {
    const media = await window.videoReplica.system.pickMedia(); if (!media) return
    const type = media.kind === 'audio' ? 'audio' : 'video'; const target = tracks.find((track) => track.type === type)
    const clip: TimelineClip = { id: `import-${Date.now()}`, label: media.name, startMs: Math.round(playhead / 100) * 100, durationMs: media.kind === 'image' ? 4000 : 5000, color: media.kind === 'audio' ? '#55bd8b' : '#4b9cff', source: media.path }
    if (target) updateTimeline(tracks.map((track) => track.id === target.id ? { ...track, clips: [...track.clips, clip] } : track))
    else updateTimeline([...tracks, { id: `imported-${type}`, type, label: media.kind === 'audio' ? 'Imported audio' : 'Imported visuals', clips: [clip] }])
  }
  const selectTimelineClip = (clip?: TimelineClip): void => { if (!clip?.sceneId) return; const index = project.scenes.findIndex((item) => item.id === clip.sceneId); if (index >= 0) setSelectedScene(index) }
  return <div className="editor-page">
    <div className="editor-header"><div className="editor-project"><button onClick={() => navigate('/')}><ArrowLeft /></button><div><span>PRODUCTION</span><strong>{project.name}</strong></div><i className={`status-dot ${project.status}`} /><small>{timelineSaving ? 'Saving timeline…' : project.status === 'processing' ? `${project.progress}% processing` : project.status === 'failed' ? 'Generation failed' : 'Autosaved'}</small></div><div className="editor-actions"><button title="Undo timeline edit" onClick={() => timelineRef.current?.undo()}><Undo2 /></button><button title="Redo timeline edit" onClick={() => timelineRef.current?.redo()}><Redo2 /></button><button className="button ghost"><CircleGauge /> Score {project.productionScore || '—'}</button><button className="button primary" disabled={exporting || !project.scenes.length} onClick={() => void exportVideo()}><Download /> {exporting ? 'Rendering…' : 'Export MP4'}</button></div></div>
    <div className="editor-workspace"><aside className="scene-panel"><div className="panel-tabs"><button className="active">Scenes</button><button>Assets</button><button>Transcript</button></div><div className="scene-list">{project.scenes.length ? project.scenes.map((item, index) => <button key={item.id} className={selectedScene === index ? 'selected' : ''} onClick={() => { setSelectedScene(index); setPlayhead(item.startMs) }}><div>{isVideoAsset(item) ? <span><Film /></span> : item.assetUrl ? <img src={item.assetUrl} alt="" /> : <span><Image /></span>}<i>{index + 1}</i></div><section><strong>{item.topic}</strong><p>{item.narration}</p><small>{timecode(item.endMs - item.startMs).slice(3)}</small></section></button>) : <div className="scenes-empty"><Sparkles /><strong>Planning scenes</strong><p>The director will place each scene here as the story develops.</p></div>}</div><button className="add-scene"><Plus /> Add scene</button></aside>
      <section className="preview-area"><audio ref={audioRef} src={`vr-media://project/${project.id}/narration?v=${encodeURIComponent(project.updatedAt)}`} preload="metadata" onCanPlay={() => setAudioAvailable(true)} onError={() => setAudioAvailable(false)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setPlayhead(0) }} onTimeUpdate={(event) => setPlayhead(event.currentTarget.currentTime * 1000)} /><div className="preview-toolbar"><div><button className="active">Program</button><button>Source</button></div><span>{project.aspectRatio} · {project.resolution}</span><button><Maximize2 /></button></div><Preview scene={previewScene} playing={playing} playhead={playhead} referenceStyle={project.sourceUrls.length > 0} aspectRatio={project.aspectRatio} /><div className="play-controls"><span>{timecode(playhead)}</span><div><button onClick={() => seekTo(Math.max(0, playhead - 5000))}><SkipBack /></button><button className="play-button" onClick={() => void togglePlayback()}>{playing ? <Pause /> : <Play />}</button><button onClick={() => seekTo(Math.min(duration, playhead + 5000))}><SkipForward /></button></div><div title={audioAvailable ? 'Narration ready' : 'Narration unavailable'}><Volume2 /><div><i style={{ width: audioAvailable ? '60%' : '0%' }} /></div></div></div></section>
      <aside className="inspector"><div className="inspector-title"><span>INSPECTOR</span><strong>{scene ? `Scene ${selectedScene + 1}` : 'Production'}</strong></div><div className="inspector-tabs"><button className="active">Design</button><button>Motion</button><button>Audio</button></div><div className="property"><label>Visual intent</label><button>{scene?.visualType ?? 'Automatic'} <ChevronDown /></button></div><div className="property"><label>Emotion</label><button>{scene?.emotion ?? 'Automatic'} <ChevronDown /></button></div><div className="property"><label>Camera movement</label><div className="segmented"><button>None</button><button className="active">Push</button><button>Pan</button></div></div><div className="property"><label>Asset quality</label><div className="quality-bar"><i style={{ width: `${scene?.qualityScore ?? 0}%` }} /><span>{scene?.qualityScore || '—'}</span></div></div><div className="property"><label>Search intelligence</label><div className="keyword-list">{scene?.keywords.map((word) => <span key={word}>{word}</span>) ?? <small>Available after scene planning</small>}</div></div><button className="button inspector-button" disabled={job?.status === 'running' || job?.status === 'queued'} onClick={() => void retryGeneration()}><WandSparkles /> {job?.status === 'running' || job?.status === 'queued' ? 'Rebuilding visuals…' : 'Rebuild all visuals'}</button></aside>
    </div>
    <TimelineEditor ref={timelineRef} tracks={tracks} duration={duration} playhead={playhead} onSeek={seekTo} onChange={updateTimeline} onImport={() => void importMedia()} onSelect={selectTimelineClip} />
    <AnimatePresence>{job && showGeneration && ['running','queued','complete','failed'].includes(job.status) && <GenerationPanel job={job} onClose={() => setShowGeneration(false)} onRetry={() => void retryGeneration()} />}</AnimatePresence>
    {job && !showGeneration && job.status === 'running' && <button className="generation-fab" onClick={() => setShowGeneration(true)}><Sparkles /> {job.progress}%</button>}
    {(exportedPath || exportError) && <div className={`export-toast ${exportError ? 'error' : ''}`}><div>{exportError ? <X /> : <Download />}<span><strong>{exportError ? 'Export failed' : 'Master export ready'}</strong><small>{exportError || exportedPath}</small></span></div>{exportedPath && <button onClick={() => window.videoReplica.system.showItem(exportedPath)}>Show file</button>}<button onClick={() => { setExportedPath(''); setExportError('') }}><X /></button></div>}
  </div>
}
