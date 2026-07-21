import { existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const runtime = resolve(root, 'runtime')
const folders = ['Projects', 'Cache', 'Assets', 'Images', 'Videos', 'Music', 'Voice', 'Transcript', 'Exports', 'Renders', 'Logs', 'Settings', 'Temp', 'Database']
for (const folder of folders) mkdirSync(resolve(runtime, folder), { recursive: true })

const example = resolve(root, '.env.example')
const localEnv = resolve(root, '.env')
if (!existsSync(localEnv) && existsSync(example)) copyFileSync(example, localEnv)

// npm security policies can skip dependency install hooks. Ensure the desktop
// runtime exists explicitly so `npm install && npm run dev` is dependable.
const electronBinary = resolve(root, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')
const electronInstaller = resolve(root, 'node_modules', 'electron', 'install.js')
if (!existsSync(electronBinary) && existsSync(electronInstaller)) {
  const electronInstall = spawnSync(process.execPath, [electronInstaller], { cwd: root, stdio: 'inherit' })
  if (electronInstall.status !== 0) throw new Error('Electron runtime download failed')
}

const generatedClient = resolve(root, 'node_modules', '.prisma', 'client', 'index.js')
if (!existsSync(generatedClient)) {
  const npmCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const prisma = spawnSync(npmCommand, ['prisma', 'generate'], { cwd: root, stdio: 'inherit', shell: false })
  if (prisma.status !== 0) console.warn('[setup] Prisma generation will be retried on the next install/build.')
}

if (process.env.VIDEO_REPLICA_SKIP_PYTHON !== '1') {
  const python = process.platform === 'win32' ? 'python' : 'python3'
  const venv = resolve(root, '.venv')
  if (!existsSync(venv)) spawnSync(python, ['-m', 'venv', venv], { cwd: root, stdio: 'inherit' })
  const pip = process.platform === 'win32' ? resolve(venv, 'Scripts', 'python.exe') : resolve(venv, 'bin', 'python')
  const marker = resolve(venv, '.video-replica-ready')
  if (existsSync(pip) && !existsSync(marker)) {
    const result = spawnSync(pip, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', resolve(root, 'requirements.txt')], { cwd: root, stdio: 'inherit' })
    if (result.status === 0) writeFileSync(marker, new Date().toISOString())
    else console.warn('[setup] Optional computer-vision packages could not be installed; core video workflow remains available.')
  }
}

console.log(`[setup] Video Replica runtime initialized at ${runtime}`)
