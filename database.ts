import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { Logger } from 'winston'
import type { CreateProjectInput, ProjectDetail, ProjectSummary, Scene, TimelineTrack } from '../../shared/types'
import type { RuntimePaths } from './paths'

interface ProjectRow {
  id: string; name: string; status: string; progress: number; mode: string; template: string; aspectRatio: string; resolution: string; density: string
  sourceUrls: string; customScript: string | null; duration: number; thumbnail: string | null; productionScore: number; createdAt: string; updatedAt: string
}
type JobRow = { id: string; projectId: string; status: string; stage: string; progress: number; detail: string; error?: string; createdAt: string }

export class ProjectDatabase {
  private constructor(private db: Database, private dbPath: string, private logger: Logger) { this.migrate() }

  static async create(paths: RuntimePaths, logger: Logger): Promise<ProjectDatabase> {
    const require = createRequire(import.meta.url)
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')
    const SQL: SqlJsStatic = await initSqlJs({ locateFile: () => wasmPath })
    const dbPath = join(paths.get('Database'), 'video-replica.db')
    const db = existsSync(dbPath) ? new SQL.Database(readFileSync(dbPath)) : new SQL.Database()
    return new ProjectDatabase(db, dbPath, logger)
  }

  private migrate(): void {
    this.db.run(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', progress INTEGER NOT NULL DEFAULT 0,
        mode TEXT NOT NULL, template TEXT NOT NULL, aspectRatio TEXT NOT NULL, resolution TEXT NOT NULL, density TEXT NOT NULL,
        sourceUrls TEXT NOT NULL, customScript TEXT, duration INTEGER NOT NULL DEFAULT 0, thumbnail TEXT,
        productionScore INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS scenes (
        id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, position INTEGER NOT NULL,
        startMs INTEGER NOT NULL, endMs INTEGER NOT NULL, narration TEXT NOT NULL, topic TEXT NOT NULL, emotion TEXT NOT NULL,
        keywords TEXT NOT NULL, visualType TEXT NOT NULL, assetUrl TEXT, qualityScore INTEGER NOT NULL DEFAULT 0,
        UNIQUE(projectId, position)
      );
      CREATE TABLE IF NOT EXISTS timelines (
        id TEXT PRIMARY KEY, projectId TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
        tracks TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updatedAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, type TEXT NOT NULL,
        status TEXT NOT NULL, stage TEXT NOT NULL, progress INTEGER NOT NULL, detail TEXT, error TEXT,
        createdAt TEXT NOT NULL, startedAt TEXT, finishedAt TEXT
      );
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedAt TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updatedAt DESC);
      CREATE INDEX IF NOT EXISTS idx_scenes_project ON scenes(projectId);
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
      UPDATE jobs SET status='failed', stage='interrupted', detail='Production was interrupted. Retry to continue.',
        error='The application closed before this job completed.', finishedAt=datetime('now')
        WHERE status IN ('queued','running');
    `)
    this.persist(); this.logger.info('SQLite database initialized')
  }

  private persist(): void { writeFileSync(this.dbPath, Buffer.from(this.db.export())) }
  private all<T>(sql: string, values: Array<string | number | null> = []): T[] {
    const statement = this.db.prepare(sql)
    try { statement.bind(values); const rows: T[] = []; while (statement.step()) rows.push(statement.getAsObject() as T); return rows } finally { statement.free() }
  }
  private one<T>(sql: string, values: Array<string | number | null> = []): T | undefined { return this.all<T>(sql, values)[0] }
  private summary(row: ProjectRow): ProjectSummary {
    return { ...row, sourceUrls: JSON.parse(row.sourceUrls), customScript: row.customScript ?? undefined, thumbnail: row.thumbnail ?? undefined } as ProjectSummary
  }

  listProjects(): ProjectSummary[] { return this.all<ProjectRow>('SELECT * FROM projects ORDER BY updatedAt DESC').map((row) => this.summary(row)) }
  getProject(id: string): ProjectDetail | null {
    const row = this.one<ProjectRow>('SELECT * FROM projects WHERE id = ?', [id]); if (!row) return null
    const scenes = this.all<Array<Omit<Scene, 'keywords'> & { keywords: string }>[number]>('SELECT * FROM scenes WHERE projectId = ? ORDER BY position', [id]).map((scene) => ({ ...scene, keywords: JSON.parse(scene.keywords) }))
    const timeline = this.one<{ tracks: string }>('SELECT tracks FROM timelines WHERE projectId = ?', [id])
    return { ...this.summary(row), scenes, tracks: timeline ? JSON.parse(timeline.tracks) : [] }
  }
  createProject(input: CreateProjectInput): ProjectSummary {
    const now = new Date().toISOString(); const id = randomUUID()
    this.db.run(`INSERT INTO projects (id,name,status,progress,mode,template,aspectRatio,resolution,density,sourceUrls,customScript,duration,productionScore,createdAt,updatedAt) VALUES (?,?, 'draft',0,?,?,?,?,?,?,?,0,0,?,?)`, [id,input.name,input.mode,input.template,input.aspectRatio,input.resolution,input.density,JSON.stringify(input.sourceUrls),input.customScript ?? null,now,now])
    this.persist(); return this.getProject(id)!
  }
  updateProject(id: string, patch: Partial<CreateProjectInput> & { status?: string; progress?: number; duration?: number; productionScore?: number }): ProjectSummary {
    const allowed = ['name','mode','template','aspectRatio','resolution','density','customScript','status','progress','duration','productionScore'] as const
    const parts = ['updatedAt=?']; const values: Array<string | number | null> = [new Date().toISOString()]
    for (const key of allowed) if (patch[key] !== undefined) { parts.push(`${key}=?`); values.push(patch[key] as string | number) }
    if (patch.sourceUrls) { parts.push('sourceUrls=?'); values.push(JSON.stringify(patch.sourceUrls)) }
    values.push(id); this.db.run(`UPDATE projects SET ${parts.join(',')} WHERE id=?`, values); this.persist(); return this.getProject(id)!
  }
  deleteProject(id: string): void { this.db.run('DELETE FROM projects WHERE id = ?', [id]); this.persist() }
  replaceScenes(projectId: string, scenes: Omit<Scene, 'id'>[]): void {
    this.db.run('BEGIN')
    try { this.db.run('DELETE FROM scenes WHERE projectId = ?', [projectId]); for (const scene of scenes) this.db.run('INSERT INTO scenes (id,projectId,position,startMs,endMs,narration,topic,emotion,keywords,visualType,assetUrl,qualityScore) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [randomUUID(),projectId,scene.position,scene.startMs,scene.endMs,scene.narration,scene.topic,scene.emotion,JSON.stringify(scene.keywords),scene.visualType,scene.assetUrl ?? null,scene.qualityScore]); this.db.run('COMMIT') } catch (error) { this.db.run('ROLLBACK'); throw error }
    this.persist()
  }
  saveTimeline(projectId: string, tracks: TimelineTrack[]): void {
    const existing = this.one<{ id: string; version: number }>('SELECT id,version FROM timelines WHERE projectId=?', [projectId]); const now = new Date().toISOString()
    if (existing) this.db.run('UPDATE timelines SET tracks=?,version=?,updatedAt=? WHERE projectId=?', [JSON.stringify(tracks),existing.version + 1,now,projectId])
    else this.db.run('INSERT INTO timelines (id,projectId,tracks,version,updatedAt) VALUES (?,?,?,?,?)', [randomUUID(),projectId,JSON.stringify(tracks),1,now])
    const duration = Math.max(0, ...tracks.flatMap((track) => track.clips.map((clip) => clip.startMs + clip.durationMs)))
    this.db.run('UPDATE projects SET duration=?,updatedAt=? WHERE id=?', [duration,now,projectId]); this.persist()
  }
  createJob(projectId: string): string { const id=randomUUID(); this.db.run('INSERT INTO jobs (id,projectId,type,status,stage,progress,detail,createdAt) VALUES (?,? ,? ,? ,? ,? ,? ,?)',[id,projectId,'generate','queued','queued',0,'Waiting for an available worker',new Date().toISOString()]); this.persist(); return id }
  activeJob(projectId: string): JobRow | undefined { return this.one<JobRow>("SELECT id,projectId,status,stage,progress,detail,error,createdAt FROM jobs WHERE projectId=? AND status IN ('queued','running') ORDER BY createdAt DESC LIMIT 1",[projectId]) }
  updateJob(id: string, status: string, stage: string, progress: number, detail: string, error?: string): void {
    const existing = this.one<{ startedAt?: string; finishedAt?: string }>('SELECT startedAt,finishedAt FROM jobs WHERE id=?',[id]); const now=new Date().toISOString()
    const startedAt=existing?.startedAt ?? (status==='running'?now:null); const finishedAt=['complete','failed','cancelled'].includes(status)?now:existing?.finishedAt ?? null
    this.db.run('UPDATE jobs SET status=?,stage=?,progress=?,detail=?,error=?,startedAt=?,finishedAt=? WHERE id=?',[status,stage,progress,detail,error??null,startedAt,finishedAt,id]); this.persist()
  }
  listJobs(): JobRow[] { return this.all<JobRow>('SELECT id,projectId,status,stage,progress,detail,error,createdAt FROM jobs ORDER BY createdAt DESC') }
  setSetting(key: string, value: string): void { const now=new Date().toISOString(); if (this.getSetting(key)!==undefined) this.db.run('UPDATE settings SET value=?,updatedAt=? WHERE key=?',[value,now,key]); else this.db.run('INSERT INTO settings (key,value,updatedAt) VALUES (?,?,?)',[key,value,now]); this.persist() }
  getSetting(key: string): string | undefined { return this.one<{ value: string }>('SELECT value FROM settings WHERE key=?',[key])?.value }
}
