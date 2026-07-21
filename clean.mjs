import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
for (const folder of ['out', 'release']) rmSync(resolve(root, folder), { recursive: true, force: true })
