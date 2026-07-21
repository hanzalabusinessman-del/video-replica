import { Check, LayoutTemplate, Plus, Sparkles } from 'lucide-react'
import { templates } from '../../../shared/types'

export function Templates(): React.JSX.Element {
  return <div className="page"><div className="page-heading"><div><span className="eyebrow">CREATIVE SYSTEMS</span><h1>Production templates</h1><p>Reusable direction for captions, pacing, music, transitions, and graphics.</p></div><button className="button primary"><Plus /> Create template</button></div>
    <div className="template-library">{templates.map((item, index) => <article key={item.id} style={{ '--accent': item.accent } as React.CSSProperties}><div className="template-preview"><span /><LayoutTemplate /><small>{item.category}</small><b>{index === 0 && <><Check /> DEFAULT</>}</b></div><section><div><strong>{item.name}</strong><span>{item.category}</span></div><p>{item.description}</p><footer><span><Sparkles /> AI-directed</span><button>Use template</button></footer></section></article>)}</div>
  </div>
}
