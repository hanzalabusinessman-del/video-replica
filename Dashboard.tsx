import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, CheckCircle2, Clock3, Cpu, Film, FolderOpen, HardDrive, MemoryStick, Plus, Sparkles, WandSparkles } from 'lucide-react'
import type { ProjectSummary } from '../../../shared/types'

const formatDate = (value: string) => new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.max(-30, Math.round((new Date(value).getTime() - Date.now()) / 86_400_000)), 'day')

function ProjectCard({ project }: { project: ProjectSummary }): React.JSX.Element {
  const gradients = ['gold', 'violet', 'blue', 'green']
  const gradient = gradients[Math.abs(project.name.length) % gradients.length]
  return <Link to={`/project/${project.id}`} className="project-card">
    <div className={`project-thumb ${gradient}`}>
      <div className="thumb-orbit" /><Film size={28} /><span>{project.template}</span>
      {project.status === 'processing' && <div className="processing-badge"><i /> {project.progress}%</div>}
    </div>
    <div className="project-card-body"><div><strong>{project.name}</strong><span>{project.aspectRatio} · {project.resolution}</span></div><p>{formatDate(project.updatedAt)}</p></div>
  </Link>
}

export function Dashboard(): React.JSX.Element {
  const { data: projects = [], isLoading } = useQuery({ queryKey: ['projects'], queryFn: () => window.videoReplica.projects.list() })
  const { data: system } = useQuery({ queryKey: ['system'], queryFn: () => window.videoReplica.system.snapshot() })
  const complete = projects.filter((project) => project.status === 'ready' || project.status === 'complete').length
  return <div className="page dashboard-page">
    <div className="page-heading"><div><span className="eyebrow">CREATIVE COMMAND CENTER</span><h1>Good evening, creator.</h1><p>What story are we bringing to life today?</p></div><Link to="/new" className="button primary"><Plus size={17} /> Start new production</Link></div>
    <section className="hero-panel">
      <div className="hero-glow" /><div className="hero-rings"><span /><span /><span /><WandSparkles /></div>
      <div className="hero-copy"><div className="ai-chip"><Sparkles size={13} /> AI DIRECTOR READY</div><h2>Turn any idea into a<br /><em>production-ready video.</em></h2><p>Add a source video or your own script. Video Replica directs the story, finds the visuals, builds the timeline, and prepares your first cut.</p><Link to="/new" className="button hero-button">Create with AI <ArrowRight size={17} /></Link></div>
      <div className="hero-steps"><div className="active"><span>01</span><p>Source</p></div><i /><div><span>02</span><p>Direct</p></div><i /><div><span>03</span><p>Review</p></div><i /><div><span>04</span><p>Export</p></div></div>
    </section>
    <section className="stats-row">
      <div className="stat-card"><div className="stat-icon gold"><FolderOpen /></div><div><span>Total productions</span><strong>{projects.length}</strong><small>Lifetime projects</small></div></div>
      <div className="stat-card"><div className="stat-icon green"><CheckCircle2 /></div><div><span>First cuts ready</span><strong>{complete}</strong><small>Ready to review</small></div></div>
      <div className="stat-card"><div className="stat-icon violet"><Cpu /></div><div><span>Creative engines</span><strong>11</strong><small>All systems active</small></div></div>
      <div className="stat-card"><div className="stat-icon blue"><Clock3 /></div><div><span>Time reclaimed</span><strong>{Math.max(0, complete * 3.5).toFixed(1)}h</strong><small>Estimated this month</small></div></div>
    </section>
    <section className="section-block"><div className="section-heading"><div><h3>Recent productions</h3><p>Continue where you left off.</p></div><Link to="/projects">View all <ArrowRight size={15} /></Link></div>
      {isLoading ? <div className="loading-grid">Loading your studio…</div> : projects.length ? <div className="project-grid">{projects.slice(0, 4).map((project) => <ProjectCard key={project.id} project={project} />)}<Link to="/new" className="project-add"><Plus /><strong>New production</strong><span>Start from a link or script</span></Link></div> : <div className="empty-recent"><div><Film /></div><h3>Your studio is ready.</h3><p>Create your first AI-directed video production.</p><Link to="/new" className="button primary"><Plus size={16} /> Create first production</Link></div>}
    </section>
    <section className="system-strip"><div><i className="pulse" /><span>Production system</span><strong>Operational</strong></div><div><MemoryStick /><span>Memory available</span><strong>{system ? `${system.freeMemoryGb} GB` : '—'}</strong></div><div><Cpu /><span>Processing</span><strong>{system ? `${system.cpuCores} threads` : '—'}</strong></div><div><HardDrive /><span>Media tools</span><strong>{system?.tools.filter((tool) => tool.available).length ?? '—'} detected</strong></div></section>
  </div>
}
