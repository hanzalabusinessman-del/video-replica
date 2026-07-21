import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Captions, Film, Layers3, Music2, Plus, Redo2, Scissors, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react'
import type { TimelineClip, TimelineTrack } from '../../../shared/types'

export interface TimelineEditorHandle {
  undo(): void
  redo(): void
  split(): void
  remove(): void
}

interface TimelineEditorProps {
  tracks: TimelineTrack[]
  duration: number
  playhead: number
  onSeek(value: number): void
  onChange(tracks: TimelineTrack[]): void
  onImport(): void
  onSelect?(clip?: TimelineClip): void
}

type Selection = { trackId: string; clipId: string }
type DragMode = 'move' | 'trim-left' | 'trim-right'
type DragState = { mode: DragMode; selection: Selection; startX: number; width: number; original: TimelineTrack[] }

const cloneTracks = (tracks: TimelineTrack[]): TimelineTrack[] => tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => ({ ...clip })) }))
const snap = (value: number): number => Math.round(value / 100) * 100
const timeLabel = (ms: number): string => {
  const seconds = Math.max(0, Math.floor(ms / 1000)); const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export const TimelineEditor = forwardRef<TimelineEditorHandle, TimelineEditorProps>(function TimelineEditor({ tracks, duration, playhead, onSeek, onChange, onImport, onSelect }, ref): React.JSX.Element {
  const [selection, setSelection] = useState<Selection>()
  const [zoom, setZoom] = useState(72)
  const undoStack = useRef<TimelineTrack[][]>([])
  const redoStack = useRef<TimelineTrack[][]>([])
  const drag = useRef<DragState | undefined>(undefined)
  const canvasRef = useRef<HTMLDivElement>(null)
  const maximumEnd = useMemo(() => Math.max(0, ...tracks.flatMap((track) => track.clips.map((clip) => clip.startMs + clip.durationMs))), [tracks])
  const total = Math.max(duration, maximumEnd, 30_000)
  const selectedClip = selection ? tracks.find((track) => track.id === selection.trackId)?.clips.find((clip) => clip.id === selection.clipId) : undefined

  const setSelected = (next?: Selection): void => {
    setSelection(next)
    const clip = next ? tracks.find((track) => track.id === next.trackId)?.clips.find((item) => item.id === next.clipId) : undefined
    onSelect?.(clip)
  }
  const remember = (snapshot = tracks): void => {
    undoStack.current.push(cloneTracks(snapshot)); if (undoStack.current.length > 80) undoStack.current.shift(); redoStack.current = []
  }
  const undo = (): void => {
    const previous = undoStack.current.pop(); if (!previous) return
    redoStack.current.push(cloneTracks(tracks)); onChange(previous)
  }
  const redo = (): void => {
    const next = redoStack.current.pop(); if (!next) return
    undoStack.current.push(cloneTracks(tracks)); onChange(next)
  }
  const remove = (): void => {
    if (!selection) return
    remember(); onChange(tracks.map((track) => track.id === selection.trackId ? { ...track, clips: track.clips.filter((clip) => clip.id !== selection.clipId) } : track)); setSelected()
  }
  const split = (): void => {
    let target = selection
    if (!target) {
      for (const track of tracks) {
        const clip = track.clips.find((item) => playhead > item.startMs + 249 && playhead < item.startMs + item.durationMs - 249)
        if (clip) { target = { trackId: track.id, clipId: clip.id }; break }
      }
    }
    if (!target) return
    const track = tracks.find((item) => item.id === target!.trackId); const clip = track?.clips.find((item) => item.id === target!.clipId)
    if (!track || !clip || playhead <= clip.startMs + 249 || playhead >= clip.startMs + clip.durationMs - 249) return
    const leftDuration = snap(playhead - clip.startMs); const rightDuration = clip.durationMs - leftDuration
    if (leftDuration < 250 || rightDuration < 250) return
    const right: TimelineClip = { ...clip, id: `${clip.id}-cut-${Date.now()}`, label: `${clip.label} (cut)`, startMs: clip.startMs + leftDuration, durationMs: rightDuration }
    remember(); onChange(tracks.map((item) => item.id === track.id ? { ...item, clips: item.clips.flatMap((entry) => entry.id === clip.id ? [{ ...entry, durationMs: leftDuration }, right] : [entry]) } : item)); setSelected({ trackId: track.id, clipId: right.id })
  }
  useImperativeHandle(ref, () => ({ undo, redo, split, remove }))

  useEffect(() => {
    const move = (event: PointerEvent): void => {
      const active = drag.current; if (!active) return
      const delta = snap(((event.clientX - active.startX) / Math.max(1, active.width)) * total)
      onChange(active.original.map((track) => {
        if (track.id !== active.selection.trackId) return track
        return { ...track, clips: track.clips.map((clip) => {
          if (clip.id !== active.selection.clipId) return clip
          if (active.mode === 'move') return { ...clip, startMs: Math.max(0, snap(clip.startMs + delta)) }
          if (active.mode === 'trim-left') { const applied = Math.max(-clip.startMs, Math.min(clip.durationMs - 250, delta)); return { ...clip, startMs: snap(clip.startMs + applied), durationMs: snap(clip.durationMs - applied) } }
          return { ...clip, durationMs: Math.max(250, snap(clip.durationMs + delta)) }
        }) }
      }))
    }
    const up = (): void => { drag.current = undefined }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [onChange, total])

  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => {
      const element = event.target as HTMLElement | null; if (element?.closest('input,textarea,[contenteditable="true"]')) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo() }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') { event.preventDefault(); split() }
      else if (event.key === 'Delete' || event.key === 'Backspace') { if (selection) { event.preventDefault(); remove() } }
    }
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown)
  })

  const seekFromPointer = (event: React.PointerEvent<HTMLDivElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect(); onSeek(Math.max(0, Math.min(total, ((event.clientX - rect.left) / rect.width) * total)))
  }
  const startDrag = (event: React.PointerEvent, next: Selection, mode: DragMode): void => {
    event.preventDefault(); event.stopPropagation(); setSelected(next); remember()
    drag.current = { mode, selection: next, startX: event.clientX, width: canvasRef.current?.getBoundingClientRect().width ?? 1, original: cloneTracks(tracks) }
  }
  const rulerTicks = Array.from({ length: 11 }, (_, index) => index)

  return <div className="timeline capcut-timeline" tabIndex={0}>
    <div className="timeline-tools"><div>
      <button title="Undo (Ctrl+Z)" disabled={!undoStack.current.length} onClick={undo}><Undo2 /></button>
      <button title="Redo (Ctrl+Shift+Z)" disabled={!redoStack.current.length} onClick={redo}><Redo2 /></button><i />
      <button title="Split at playhead (Ctrl+B)" onClick={split}><Scissors /></button>
      <button title="Delete selected clip" disabled={!selection} onClick={remove}><Trash2 /></button>
      <button title="Import media" onClick={onImport}><Plus /></button>
      {selectedClip && <small className="timeline-selection">{selectedClip.label} · {timeLabel(selectedClip.startMs)} · {(selectedClip.durationMs / 1000).toFixed(1)}s</small>}
    </div><div><button title="Zoom out" onClick={() => setZoom((value) => Math.max(40, value - 10))}><ZoomOut /></button><input aria-label="Timeline zoom" type="range" min="40" max="130" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /><button title="Zoom in" onClick={() => setZoom((value) => Math.min(130, value + 10))}><ZoomIn /></button></div></div>
    <div className="timeline-body"><div className="track-labels"><div className="ruler-label" />{tracks.map((track) => <div key={track.id}><span>{track.type === 'video' ? <Film /> : track.type === 'audio' ? <Music2 /> : track.type === 'caption' ? <Captions /> : <Layers3 />}</span><p>{track.label}</p></div>)}</div>
      <div className="timeline-scroll"><div ref={canvasRef} className="timeline-canvas" style={{ width: `${Math.max(100, zoom / 72 * 100)}%` }} onPointerDown={(event) => { if ((event.target as HTMLElement).closest('.timeline-clip')) return; setSelected(); seekFromPointer(event) }}>
        <div className="time-ruler">{rulerTicks.map((index) => <span key={index} style={{ left: `${index * 10}%` }}>{timeLabel((total / 10) * index)}</span>)}</div><div className="playhead" style={{ left: `${Math.min(100, (playhead / total) * 100)}%` }}><i /><span /></div>
        {tracks.map((track) => <div className={`track-row ${track.type}`} key={track.id}>{track.clips.map((clip) => { const selected = selection?.trackId === track.id && selection.clipId === clip.id; const next = { trackId: track.id, clipId: clip.id }; return <div key={clip.id} className={`timeline-clip ${selected ? 'selected' : ''}`} title={`${clip.label} · drag to move · drag edges to trim`} style={{ left: `${(clip.startMs / total) * 100}%`, width: `${Math.max(.35, (clip.durationMs / total) * 100)}%`, '--clip-color': clip.color } as React.CSSProperties} onPointerDown={(event) => startDrag(event, next, 'move')}><b className="trim-handle left" onPointerDown={(event) => startDrag(event, next, 'trim-left')} /><i />{clip.source && !/\.mp4(?:$|\?)/i.test(clip.source) && <img src={clip.source} alt="" />}<span>{clip.label}</span><b className="trim-handle right" onPointerDown={(event) => startDrag(event, next, 'trim-right')} /></div>})}</div>)}
      </div></div></div>
  </div>
})
