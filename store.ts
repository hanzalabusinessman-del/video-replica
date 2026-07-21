import { create } from 'zustand'
import type { JobUpdate } from '../../shared/types'

interface AppStore {
  jobs: Record<string, JobUpdate>
  activeJobId?: string
  setJob: (job: JobUpdate) => void
  setActiveJob: (id?: string) => void
}

export const useAppStore = create<AppStore>((set) => ({
  jobs: {},
  setJob: (job) => set((state) => ({ jobs: { ...state.jobs, [job.id]: job } })),
  setActiveJob: (activeJobId) => set({ activeJobId })
}))
