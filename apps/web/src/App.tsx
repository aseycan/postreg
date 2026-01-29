import { useEffect, useMemo, useState } from 'react'
import './App.css'

type SocketRow = {
  protocol: string
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

type Snapshot = {
  ts: string
  sockets: SocketRow[]
  docker: DockerContainer[]
}

type Lang = 'tr' | 'en' | 'la' | 'de' | 'fr'

const I18N: Record<Lang, Record<string, string>> = {
  tr: {
    title: 'Port Sentinel',
    subtitle: 'Yerel port & servis envanteri',
    search: 'Ara (pid, süreç, port)',
    refresh: 'Yenile',
    ports: 'Portlar',
    docker: 'Docker',
    none: 'Yok',
    pid: 'PID',
    process: 'Süreç',
    proto: 'Protokol',
    local: 'Local',
    link: 'Link',
    actions: 'Aksiyon',
    killPid: 'Kill PID',
    killPort: 'Kill Port',
    kill: 'KILL',
    confirm: 'Emin misin?',
  },
  en: {
    title: 'Port Sentinel',
    subtitle: 'Local port & service registry',
    search: 'Search (pid, process, port)',
    refresh: 'Refresh',
    ports: 'Ports',
    docker: 'Docker',
    none: 'None',
    pid: 'PID',
    process: 'Process',
    proto: 'Proto',
    local: 'Local',
    link: 'Link',
    actions: 'Actions',
    killPid: 'Kill PID',
    killPort: 'Kill Port',
    kill: 'KILL',
    confirm: 'Are you sure?',
  },
  la: {
    title: 'Port Sentinel',
    subtitle: 'Index portuum localium',
    search: 'Quaere (pid, processus, portus)',
    refresh: 'Renova',
    ports: 'Portus',
    docker: 'Docker',
    none: 'Nihil',
    pid: 'PID',
    process: 'Processus',
    proto: 'Proto',
    local: 'Localis',
    link: 'Nexus',
    actions: 'Actiones',
    killPid: 'Interfice PID',
    killPort: 'Interfice Portum',
    kill: 'KILL',
    confirm: 'Certusne es?',
  },
  de: {
    title: 'Port Sentinel',
    subtitle: 'Lokales Port- & Service-Register',
    search: 'Suchen (PID, Prozess, Port)',
    refresh: 'Aktualisieren',
    ports: 'Ports',
    docker: 'Docker',
    none: 'Keine',
    pid: 'PID',
    process: 'Prozess',
    proto: 'Proto',
    local: 'Lokal',
    link: 'Link',
    actions: 'Aktionen',
    killPid: 'PID killen',
    killPort: 'Port killen',
    kill: 'KILL',
    confirm: 'Bist du sicher?',
  },
  fr: {
    title: 'Port Sentinel',
    subtitle: 'Registre local des ports et services',
    search: 'Rechercher (pid, processus, port)',
    refresh: 'Rafraîchir',
    ports: 'Ports',
    docker: 'Docker',
    none: 'Aucun',
    pid: 'PID',
    process: 'Processus',
    proto: 'Proto',
    local: 'Local',
    link: 'Lien',
    actions: 'Actions',
    killPid: 'Tuer PID',
    killPort: 'Tuer Port',
    kill: 'KILL',
    confirm: 'Tu es sûr ?',
  },
}

function App() {
  const [lang, setLang] = useState<Lang>('tr')
  const t = useMemo(() => I18N[lang], [lang])

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [killPid, setKillPid] = useState('')
  const [killPort, setKillPort] = useState('')

  async function load() {
    setIsRefreshing(true)
    try {
      setError(null)
      const res = await fetch('/api/snapshot')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as Snapshot
      setSnapshot(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsRefreshing(false)
    }
  }

  async function postJson(path: string, body: unknown) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error((data && (data.error as string)) || `HTTP ${res.status}`)
    return data
  }

  async function killByPid(pid: number) {
    if (!Number.isFinite(pid) || pid <= 0) return
    if (!window.confirm(t.confirm)) return
    try {
      setActionMsg(null)
      await postJson('/api/kill/pid', { pid })
      setActionMsg(`OK: killed pid ${pid}`)
      await load()
    } catch (e) {
      setActionMsg(`ERR: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function killByPort(port: number) {
    if (!Number.isFinite(port) || port < 1 || port > 65535) return
    if (!window.confirm(t.confirm)) return
    try {
      setActionMsg(null)
      await postJson('/api/kill/port', { port })
      setActionMsg(`OK: killed port ${port}`)
      await load()
    } catch (e) {
      setActionMsg(`ERR: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function killDocker(id: string, name: string) {
    if (!id) return
    if (!window.confirm(`${t.confirm}\n${name}`)) return
    try {
      setActionMsg(null)
      await postJson('/api/docker/kill', { id })
      setActionMsg(`OK: docker kill ${name}`)
      await load()
    } catch (e) {
      setActionMsg(`ERR: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), 2500)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = snapshot?.sockets ?? []
    return all
      .filter((r) => r.state === 'LISTENING')
      .filter((r) => {
        if (!q) return true
        return (
          String(r.localPort ?? '').includes(q) ||
          String(r.pid ?? '').includes(q) ||
          (r.processName ?? '').toLowerCase().includes(q) ||
          (r.localAddress ?? '').toLowerCase().includes(q)
        )
      })
      .sort((a, b) => (a.localPort ?? 0) - (b.localPort ?? 0))
  }, [snapshot, query])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brandTitle">
            <span className="sigil">{'>'}</span> {t.title}
          </div>
          <div className="brandSub">{t.subtitle}</div>
        </div>

        <div className="controls">
          <input
            className="search"
            placeholder={t.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <button className="btn" onClick={() => void load()} disabled={isRefreshing}>
            {t.refresh}
          </button>

          <select className="lang" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            <option value="tr">TR</option>
            <option value="en">EN</option>
            <option value="la">LA</option>
            <option value="de">DE</option>
            <option value="fr">FR</option>
          </select>
        </div>
      </header>

      <main className="grid">
        <section className="panel">
          <div className="panelHead">
            <div className="panelTitle">{t.ports}</div>
            <div className="meta">
              {snapshot?.ts ? new Date(snapshot.ts).toLocaleTimeString() : '—'} • {rows.length}
            </div>
          </div>

          {error ? <div className="error">ERR: {error}</div> : null}
          {actionMsg ? <div className={actionMsg.startsWith('ERR:') ? 'error' : 'notice'}>{actionMsg}</div> : null}

          <div className="table">
            <div className="tbody">
              <div className="thead sticky">
                <div>{t.pid}</div>
                <div>{t.process}</div>
                <div>{t.proto}</div>
                <div>{t.local}</div>
                <div className="right">{t.actions}</div>
              </div>
              {rows.map((r, idx) => (
                <div key={`${r.protocol}-${r.localAddress}-${r.pid ?? 'x'}-${idx}`} className="tr">
                  <div className="mono">{r.pid ?? '—'}</div>
                  <div className="mono dim">{r.processName ?? '—'}</div>
                  <div className="mono">{r.protocol}</div>
                  <div className="mono neon">{r.localAddress}</div>
                  <div className="actionsCell">
                    {r.link ? (
                      <a className="link linkMono" href={r.link} target="_blank" rel="noreferrer">
                        {r.link}
                      </a>
                    ) : (
                      <span className="dim">—</span>
                    )}
                    {r.pid ? (
                      <button className="pill danger" onClick={() => void killByPid(r.pid!)}>
                        {t.kill}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panelHead">
            <div className="panelTitle">{t.docker}</div>
            <div className="meta">{(snapshot?.docker?.length ?? 0) || 0}</div>
          </div>

          <div className="dockList">
            <div className="dockActions">
              <div className="dockActionRow">
                <span className="dockLabel">{t.killPid}</span>
                <input
                  className="dockInput"
                  inputMode="numeric"
                  value={killPid}
                  onChange={(e) => setKillPid(e.target.value)}
                  placeholder="12345"
                />
                <button
                  className="pill danger"
                  onClick={() => void killByPid(Number(killPid))}
                  disabled={!killPid.trim()}
                >
                  {t.kill}
                </button>
              </div>
              <div className="dockActionRow">
                <span className="dockLabel">{t.killPort}</span>
                <input
                  className="dockInput"
                  inputMode="numeric"
                  value={killPort}
                  onChange={(e) => setKillPort(e.target.value)}
                  placeholder="5173"
                />
                <button
                  className="pill danger"
                  onClick={() => void killByPort(Number(killPort))}
                  disabled={!killPort.trim()}
                >
                  {t.kill}
                </button>
              </div>
            </div>

            {(snapshot?.docker?.length ?? 0) === 0 ? (
              <div className="dim">{t.none}</div>
            ) : (
              snapshot!.docker.map((c) => (
                <div key={c.id} className="dockRow">
                  <div className="dockHead">
                    <div className="mono neon">{c.name}</div>
                    <button className="pill danger" onClick={() => void killDocker(c.id, c.name)}>
                      {t.kill}
                    </button>
                  </div>
                  <div className="mono dim">{c.image}</div>
                  <div className="mono">{c.ports || '—'}</div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
