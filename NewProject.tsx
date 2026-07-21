import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BookOpen, Check, Film, FileText, LayoutTemplate, Link2, Mic2, MonitorPlay, Plus, Radio, Sparkles, WandSparkles, X } from 'lucide-react'
import type { AspectRatio, CreateProjectInput, Resolution, VideoMode, VisualDensity } from '../../../shared/types'
import { templates } from '../../../shared/types'
import { useAppStore } from '../store'

interface FormValues { name: string; urls: string; customScript: string }
const modes: Array<{ id: VideoMode; name: string; detail: string; icon: typeof Mic2 }> = [
  { id: 'original', name: 'Original narration', detail: 'Keep the source voice and create entirely new visuals.', icon: Radio },
  { id: 'story', name: 'Story Maker', detail: 'Follow a YouTube story beat by beat with continuity-aware stock visuals.', icon: BookOpen },
  { id: 'ai-voice', name: 'AI narration', detail: 'Rewrite for retention and render a professional voice.', icon: Mic2 },
  { id: 'hybrid', name: 'Hybrid production', detail: 'Mix original and AI narration section by section.', icon: Sparkles },
  { id: 'custom', name: 'Custom script', detail: 'Build the complete production from your own script.', icon: FileText }
]

export function NewProject(): React.JSX.Element {
  const navigate = useNavigate(); const queryClient = useQueryClient(); const setJob = useAppStore((state) => state.setJob); const setActiveJob = useAppStore((state) => state.setActiveJob)
  const [step, setStep] = useState(1); const [mode, setMode] = useState<VideoMode>('original'); const [template, setTemplate] = useState('dark-motivation')
  const [aspectRatio, setAspect] = useState<AspectRatio>('16:9'); const [resolution, setResolution] = useState<Resolution>('1080p'); const [density, setDensity] = useState<VisualDensity>('balanced'); const [error, setError] = useState('')
  const { register, watch, trigger, formState: { errors } } = useForm<FormValues>({ defaultValues: { name: 'Untitled production', urls: '', customScript: '' } })
  const values = watch(); const urls = useMemo(() => values.urls.split(/\r?\n|,/).map((url) => url.trim()).filter(Boolean), [values.urls])
  const create = useMutation({ mutationFn: async (input: CreateProjectInput) => { const project = await window.videoReplica.projects.create(input); const job = await window.videoReplica.jobs.start(project.id); return { project, job } }, onSuccess: ({ project, job }) => { setJob(job); setActiveJob(job.id); void queryClient.invalidateQueries({ queryKey: ['projects'] }); navigate(`/project/${project.id}`) }, onError: (reason) => setError(reason instanceof Error ? reason.message : 'Unable to create project') })

  const next = async (): Promise<void> => {
    setError('')
    if (step === 1) {
      const ok = await trigger('name'); if (!ok) return
      if (mode !== 'custom' && !urls.length) return setError('Add at least one valid source video URL.')
      if (mode !== 'custom' && urls.some((url) => { try { new URL(url); return false } catch { return true } })) return setError('One or more source links are not valid URLs.')
      if (mode === 'custom' && values.customScript.trim().length < 20) return setError('Add a script of at least 20 characters.')
    }
    if (step < 3) setStep(step + 1)
    else create.mutate({ name: values.name.trim(), sourceUrls: urls, mode, template, aspectRatio, resolution, density, customScript: mode === 'custom' ? values.customScript : undefined })
  }

  return <div className="wizard-page">
    <div className="wizard-top"><button className="icon-button" onClick={() => step === 1 ? navigate('/') : setStep(step - 1)}><ArrowLeft /></button><div><span className="eyebrow">NEW PRODUCTION</span><h1>Direct your next video.</h1></div><div className="wizard-progress">{[1,2,3].map((item) => <div key={item} className={item <= step ? 'active' : ''}><span>{item < step ? <Check /> : item}</span><p>{['Source','Creative direction','Output'][item - 1]}</p>{item < 3 && <i />}</div>)}</div></div>
    <div className="wizard-body">
      {step === 1 && <section className="wizard-panel"><div className="panel-heading"><div className="step-icon"><Link2 /></div><div><h2>Start with your source</h2><p>Bring a reference video or switch to a custom script.</p></div></div>
        <label className="field"><span>Production name</span><input {...register('name', { required: 'Give your production a name', minLength: 2 })} placeholder="e.g. The Future of Clean Energy" />{errors.name && <small>{errors.name.message}</small>}</label>
        <div className="mode-mini">{modes.map(({ id, name, icon: Icon }) => <button key={id} className={mode === id ? 'selected' : ''} onClick={() => { setMode(id); if (id === 'story') setTemplate('story'); else if (mode === 'story') setTemplate('dark-motivation') }}><Icon /><span>{name}</span>{mode === id && <Check />}</button>)}</div>
        {mode === 'custom' ? <label className="field"><span>Your script</span><textarea className="script-area" {...register('customScript')} placeholder="Paste or write your narration here…" /><small>{values.customScript.length.toLocaleString()} characters</small></label> : <label className="field"><span>Source video links</span><div className="url-box"><MonitorPlay /><textarea {...register('urls')} placeholder={'https://youtube.com/watch?v=…\nAdd another link on a new line'} /><button><Plus /></button></div><small>Supports single videos, multiple links, and public playlists. Licensed assets will replace the source visuals.</small></label>}
      </section>}
      {step === 2 && <section className="wizard-panel"><div className="panel-heading"><div className="step-icon"><WandSparkles /></div><div><h2>Set the creative direction</h2><p>Choose a production language. Every detail remains editable.</p></div></div>
        <div className="template-grid">{templates.map((item) => <button key={item.id} className={`template-option ${template === item.id ? 'selected' : ''}`} onClick={() => setTemplate(item.id)} style={{ '--accent': item.accent } as React.CSSProperties}><div><LayoutTemplate /><span>{item.category}</span></div><strong>{item.name}</strong><p>{item.description}</p>{template === item.id && <b><Check /></b>}</button>)}</div>
        <div className="density-row"><div><strong>Visual energy</strong><span>Controls cut frequency, motion, and caption intensity.</span></div>{(['minimal','balanced','dynamic','viral'] as VisualDensity[]).map((item) => <button className={density === item ? 'selected' : ''} key={item} onClick={() => setDensity(item)}>{item}</button>)}</div>
      </section>}
      {step === 3 && <section className="wizard-panel"><div className="panel-heading"><div className="step-icon"><Film /></div><div><h2>Frame the final production</h2><p>Choose your canvas and review the director’s brief.</p></div></div>
        <div className="output-grid"><div className="choice-section"><span>Aspect ratio</span><div className="aspect-options">{([['16:9','Landscape'],['9:16','Vertical'],['1:1','Square']] as Array<[AspectRatio,string]>).map(([id,label]) => <button key={id} className={aspectRatio === id ? 'selected' : ''} onClick={() => setAspect(id)}><i className={`ratio ratio-${id.replace(':','')}`} /><strong>{label}</strong><small>{id}</small></button>)}</div></div><div className="choice-section"><span>Master resolution</span><div className="resolution-options">{(['1080p','1440p','4K'] as Resolution[]).map((id) => <button key={id} className={resolution === id ? 'selected' : ''} onClick={() => setResolution(id)}><strong>{id}</strong><small>{id === '1080p' ? 'Full HD' : id === '1440p' ? 'Quad HD' : 'Ultra HD'}</small>{resolution === id && <Check />}</button>)}</div></div></div>
        <div className="brief-card"><div><span>DIRECTOR'S BRIEF</span><h3>{values.name || 'Untitled production'}</h3><p>{mode === 'custom' ? 'Original script' : `${urls.length} source ${urls.length === 1 ? 'video' : 'videos'}`} · {templates.find((item) => item.id === template)?.name} · {density} energy</p></div><div className="brief-score"><Sparkles /><strong>AI planned</strong><span>~{Math.max(6, Math.ceil((mode === 'custom' ? values.customScript.length : urls.length * 800) / 550))} scenes</span></div></div>
      </section>}
      {error && <div className="form-error"><X /> {error}</div>}
      <div className="wizard-actions"><button className="button ghost" onClick={() => step === 1 ? navigate('/') : setStep(step - 1)}>Back</button><button className="button primary wide" onClick={() => void next()} disabled={create.isPending}>{create.isPending ? 'Starting the crew…' : step === 3 ? <><Sparkles /> Generate first cut</> : <>Continue <ArrowRight /></>}</button></div>
    </div>
  </div>
}
