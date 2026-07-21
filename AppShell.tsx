import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Aperture, Blocks, Clapperboard, FolderKanban, Gauge, Layers3, LibraryBig, Plus, Search, Settings2, Sparkles, UploadCloud } from 'lucide-react'

const nav = [
  { to: '/', label: 'Home', icon: Gauge },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/assets', label: 'Assets', icon: LibraryBig },
  { to: '/templates', label: 'Templates', icon: Blocks },
  { to: '/renders', label: 'Render queue', icon: UploadCloud }
]

export function Logo(): React.JSX.Element {
  return <div className="brand"><div className="brand-mark"><Aperture size={18} strokeWidth={2.1} /></div><div><strong>VIDEO REPLICA</strong><span>AI PRODUCTION STUDIO</span></div></div>
}

export function AppShell(): React.JSX.Element {
  const location = useLocation()
  const inEditor = location.pathname.startsWith('/project/')
  return <div className="app-frame">
    <header className="titlebar"><Logo /><div className="titlebar-center"><Search size={14} /><span>Search projects, assets, commands</span><kbd>⌘ K</kbd></div><div className="status-pill"><i /> Systems ready</div></header>
    <aside className="sidebar">
      <NavLink to="/new" className="new-project"><Plus size={17} /> New production <span>⌘N</span></NavLink>
      <nav>{nav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'}><Icon size={17} /><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-divider" />
      <div className="sidebar-label">Production tools</div>
      <button className="sidebar-tool"><Clapperboard size={17} /> AI Director <em>ON</em></button>
      <button className="sidebar-tool"><Layers3 size={17} /> Timeline Engine</button>
      <div className="sidebar-spacer" />
      <div className="upgrade-card"><Sparkles size={18} /><strong>Production engine</strong><p>All creative systems are online and ready.</p><div><span>11 / 11</span><span>active</span></div></div>
      <NavLink to="/settings" className="settings-link"><Settings2 size={17} /><span>Settings</span></NavLink>
    </aside>
    <main className={inEditor ? 'main-content editor-main' : 'main-content'}>
      <motion.div key={location.pathname} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .28 }} className="route-wrap"><Outlet /></motion.div>
    </main>
  </div>
}
