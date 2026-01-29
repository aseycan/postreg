import express from 'express'
import cors from 'cors'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

type SocketRow = {
  protocol: 'TCP' | 'UDP' | string
  localAddress: string
  localPort: number | null
  foreignAddress: string
  state?: string
  pid?: number
  processName?: string
  link?: string
}

type DockerContainer = {
  id: string
  name: string
  image: string
  ports: string
}

type CmdResult = {
  command: string
  args: string[]
  exitCode: number | null
  stdout: string
  stderr: string
}

function parsePortFromAddress(addr: string): number | null {
  // Examples:
  // 127.0.0.1:5173
  // [::1]:5173
  // [::]:0
  const m = addr.match(/:(\d+)\s*$/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

async function run(cmd: string, args: string[], opts?: { timeoutMs?: number; maxBuffer?: number }): Promise<CmdResult> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      windowsHide: true,
      timeout: opts?.timeoutMs ?? 8000,
      maxBuffer: opts?.maxBuffer ?? 4 * 1024 * 1024,
    })
    return { command: cmd, args, exitCode: 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') }
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; code?: number }
    return {
      command: cmd,
      args,
      exitCode: typeof err.code === 'number' ? err.code : null,
      stdout: String(err.stdout ?? ''),
      stderr: String(err.stderr ?? (e instanceof Error ? e.message : String(e))),
    }
  }
}

async function getTasklistPidToName(): Promise<Map<number, string>> {
  if (process.platform !== 'win32') return new Map()
  // tasklist /FO CSV /NH
  const { stdout } = await execFileAsync('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true })
  const map = new Map<number, string>()
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    // "Image Name","PID","Session Name","Session#","Mem Usage"
    // naive CSV split (ok for tasklist output)
    const cols = line.split('","').map((c) => c.replace(/^"|"$/g, ''))
    const image = cols[0]
    const pidStr = cols[1]
    const pid = Number(pidStr)
    if (!Number.isFinite(pid)) continue
    map.set(pid, image)
  }
  return map
}

async function findListeningPidByPort(port: number): Promise<number | null> {
  if (process.platform !== 'win32') return null
  const res = await run('netstat', ['-ano'], { timeoutMs: 8000, maxBuffer: 10 * 1024 * 1024 })
  if (res.exitCode !== 0) return null

  const re = new RegExp(`\\sLISTENING\\s+(\\d+)\\s*$`)
  for (const rawLine of res.stdout.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    if (!line.includes(`:${port}`)) continue
    if (!line.includes('LISTENING')) continue
    const m = line.match(re)
    if (!m) continue
    const pid = Number(m[1])
    if (Number.isFinite(pid)) return pid
  }
  return null
}

async function snapshotWindows(): Promise<{ sockets: SocketRow[]; docker: DockerContainer[] }> {
  const pidToName = await getTasklistPidToName()
  const { stdout } = await execFileAsync('netstat', ['-ano'], { windowsHide: true, maxBuffer: 10 * 1024 * 1024 })
  const sockets: SocketRow[] = []

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('Proto') || line.startsWith('Active')) continue

    // netstat formats:
    // TCP  [::1]:5173  [::]:0  LISTENING  156284
    // UDP  0.0.0.0:1900  *:*  1234
    const parts = line.split(/\s+/)
    const proto = parts[0]

    if (proto === 'TCP') {
      const localAddress = parts[1] ?? ''
      const foreignAddress = parts[2] ?? ''
      const state = parts[3]
      const pid = Number(parts[4])
      const localPort = parsePortFromAddress(localAddress)
      const processName = Number.isFinite(pid) ? pidToName.get(pid) : undefined
      const link = localPort && state === 'LISTENING' ? `http://localhost:${localPort}/` : undefined
      sockets.push({
        protocol: proto,
        localAddress,
        localPort,
        foreignAddress,
        state,
        pid: Number.isFinite(pid) ? pid : undefined,
        processName,
        link,
      })
      continue
    }

    if (proto === 'UDP') {
      const localAddress = parts[1] ?? ''
      const foreignAddress = parts[2] ?? ''
      const pid = Number(parts[3])
      const localPort = parsePortFromAddress(localAddress)
      const processName = Number.isFinite(pid) ? pidToName.get(pid) : undefined
      sockets.push({
        protocol: proto,
        localAddress,
        localPort,
        foreignAddress,
        pid: Number.isFinite(pid) ? pid : undefined,
        processName,
      })
    }
  }

  const docker = await snapshotDocker()
  return { sockets, docker }
}

async function snapshotDocker(): Promise<DockerContainer[]> {
  try {
    const { stdout } = await execFileAsync(
      'docker',
      ['ps', '--format', '{{.ID}}|{{.Names}}|{{.Image}}|{{.Ports}}'],
      { windowsHide: true, timeout: 4000, maxBuffer: 2 * 1024 * 1024 },
    )
    const rows: DockerContainer[] = []
    for (const rawLine of stdout.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line) continue
      const [id, name, image, ports] = line.split('|')
      rows.push({ id, name, image, ports })
    }
    return rows
  } catch {
    return []
  }
}

async function snapshot(): Promise<{ sockets: SocketRow[]; docker: DockerContainer[] }> {
  if (process.platform === 'win32') return snapshotWindows()
  // Best-effort non-Windows: return docker only for now
  const docker = await snapshotDocker()
  return { sockets: [], docker }
}

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.get('/api/snapshot', async (_req, res) => {
  try {
    const data = await snapshot()
    res.json({
      ts: new Date().toISOString(),
      ...data,
    })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

app.post('/api/kill/pid', async (req, res) => {
  const pidRaw = (req.body as { pid?: unknown } | undefined)?.pid
  const pid = Number(pidRaw)
  if (!Number.isFinite(pid) || pid <= 0) return res.status(400).json({ error: 'invalid pid' })
  if (process.platform !== 'win32') return res.status(501).json({ error: 'not supported on this OS yet' })

  const result = await run('taskkill', ['/PID', String(pid), '/T', '/F'], { timeoutMs: 8000 })
  return res.json({ ok: result.exitCode === 0, pid, result })
})

app.post('/api/kill/port', async (req, res) => {
  const portRaw = (req.body as { port?: unknown } | undefined)?.port
  const port = Number(portRaw)
  if (!Number.isFinite(port) || port < 1 || port > 65535) return res.status(400).json({ error: 'invalid port' })
  if (process.platform !== 'win32') return res.status(501).json({ error: 'not supported on this OS yet' })

  const pid = await findListeningPidByPort(port)
  if (!pid) return res.status(404).json({ error: 'no LISTENING pid found for port', port })

  const result = await run('taskkill', ['/PID', String(pid), '/T', '/F'], { timeoutMs: 8000 })
  return res.json({ ok: result.exitCode === 0, port, pid, result })
})

app.post('/api/docker/kill', async (req, res) => {
  const idRaw = (req.body as { id?: unknown } | undefined)?.id
  const id = typeof idRaw === 'string' ? idRaw.trim() : ''
  if (!id) return res.status(400).json({ error: 'invalid container id' })

  // Try kill first (immediate), then stop as fallback.
  const killRes = await run('docker', ['kill', id], { timeoutMs: 8000 })
  if (killRes.exitCode === 0) return res.json({ ok: true, id, result: killRes })

  const stopRes = await run('docker', ['stop', id], { timeoutMs: 10000 })
  return res.json({ ok: stopRes.exitCode === 0, id, result: stopRes, fallbackFrom: killRes })
})

const PORT = Number(process.env.PORT ?? 8787)
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`api listening on http://localhost:${PORT}/api/snapshot`)
})

