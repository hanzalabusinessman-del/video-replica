import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AppShell } from './components/AppShell'
import { Dashboard } from './pages/Dashboard'
import { NewProject } from './pages/NewProject'
import { Editor } from './pages/Editor'
import { Library } from './pages/Library'
import { Templates } from './pages/Templates'
import { Settings } from './pages/Settings'
import { useAppStore } from './store'

export function App(): React.JSX.Element {
  const setJob = useAppStore((state) => state.setJob)
  const queryClient = useQueryClient()
  useEffect(() => {
    void window.videoReplica.jobs.list().then((jobs) => jobs.forEach(setJob))
    return window.videoReplica.onJobUpdate((job) => {
      setJob(job)
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      void queryClient.invalidateQueries({ queryKey: ['project', job.projectId] })
    })
  }, [queryClient, setJob])

  return <Routes>
    <Route element={<AppShell />}>
      <Route index element={<Dashboard />} />
      <Route path="new" element={<NewProject />} />
      <Route path="project/:projectId" element={<Editor />} />
      <Route path="projects" element={<Library title="Project library" kind="projects" />} />
      <Route path="assets" element={<Library title="Asset intelligence" kind="assets" />} />
      <Route path="renders" element={<Library title="Render queue" kind="renders" />} />
      <Route path="templates" element={<Templates />} />
      <Route path="settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>
}
