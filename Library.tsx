import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Boxes, Film, FolderOpen, Plus, Search, UploadCloud } from 'lucide-react'

export function Library({ title, kind }: { title: string; kind: 'projects' | 'assets' | 'renders' }): React.JSX.Element {
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => window.videoReplica.projects.list() })
  const Icon = kind === 'projects' ? FolderOpen : kind === 'assets' ? Boxes : UploadCloud
  return <div className="page"><div className="page-heading"><div><span className="eyebrow">STUDIO LIBRARY</span><h1>{title}</h1><p>{kind === 'projects' ? 'Every production, version, and first cut in one place.' : kind === 'assets' ? 'Licensed media, analyzed, scored, and ready to reuse.' : 'Monitor background exports and completed masters.'}</p></div>{kind === 'projects' && <Link to="/new" className="button primary"><Plus /> New production</Link>}</div>
    <div className="library-toolbar"><div><Search /><input placeholder={`Search ${kind}…`} /></div><button>All types</button><button>Recently updated</button></div>
    {kind === 'projects' && projects.length ? <div className="library-list">{projects.map((project) => <Link to={`/project/${project.id}`} key={project.id}><div className={`library-thumb status-${project.status}`}><Film /><span>{project.progress}%</span></div><section><strong>{project.name}</strong><p>{project.template} · {project.aspectRatio} · {project.resolution}</p></section><span className={`library-status ${project.status}`}>{project.status}</span><small>{new Date(project.updatedAt).toLocaleDateString()}</small></Link>)}</div> : <div className="big-empty"><div><Icon /></div><h2>{kind === 'projects' ? 'No productions yet' : kind === 'assets' ? 'Your intelligent media library is empty' : 'Nothing is rendering'}</h2><p>{kind === 'projects' ? 'Start with a source link or your own script.' : kind === 'assets' ? 'Assets are added automatically as the AI Director builds productions.' : 'Exports will appear here with live FPS, bitrate, and progress.'}</p>{kind === 'projects' && <Link to="/new" className="button primary"><Plus /> Create production</Link>}</div>}
  </div>
}
