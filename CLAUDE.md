# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Port Sentinel — a Windows-first local ops dashboard: a React UI that lists listening ports (with owning process) and running Docker containers, and can kill a process by PID, kill whatever listens on a port, or kill/stop a container. Meant for local use only; the API has no auth and must not be exposed to untrusted networks.

## Commands

This is a monorepo **without npm workspaces** — root, `apps/api`, and `apps/web` each have their own `package.json` and must be installed separately (root only holds `concurrently`).

```bash
# Install (all three)
npm install
npm --prefix apps/api install
npm --prefix apps/web install

# Run both dev servers (Windows one-shot; also installs missing deps and clears stale Vite cache)
start_project.bat

# Or individually
npm --prefix apps/api run dev    # Express API on http://localhost:8787 (tsx watch)
npm --prefix apps/web run dev    # Vite on http://localhost:5173 (strictPort — fails if taken)

# Web app
npm --prefix apps/web run build  # tsc -b && vite build
npm --prefix apps/web run lint   # eslint
```

There are no tests anywhere in the repo. The API has no build/lint script; it runs from source via `tsx`.

## Architecture

Two independent apps talking over HTTP; the Vite dev server proxies `/api` → `http://localhost:8787` (see `apps/web/vite.config.ts`), so the web app always fetches relative `/api/...` paths.

**API (`apps/api/src/index.ts` — the entire backend is this one file).** Express + CORS. It has no native bindings: all system data comes from shelling out via `execFile` to Windows tools (`netstat -ano`, `tasklist /FO CSV`, `taskkill /PID x /T /F`) and the `docker` CLI, then parsing stdout. Endpoints: `GET /api/health`, `GET /api/snapshot` (sockets + docker containers), `POST /api/kill/pid`, `POST /api/kill/port`, `POST /api/docker/kill`. Socket inspection and kill endpoints return 501 on non-Windows (`process.platform !== 'win32'` guards); Docker listing works anywhere the CLI exists and silently returns `[]` on failure. Port via `PORT` env, default 8787.

**Web (`apps/web/src/App.tsx` — the entire UI is this one component).** React 19 + Vite. Polls `/api/snapshot` every 2.5 s, filters to `LISTENING` TCP rows client-side, renders ports + docker panels. i18n is a hardcoded `I18N` dict in the same file with five languages (`tr`, `en`, `la`, `de`, `fr`) — new UI strings must be added to all five. Destructive actions gate on `window.confirm`.

**Shared types are duplicated, not shared.** `SocketRow` / `DockerContainer` are defined separately in `apps/api/src/index.ts` and `apps/web/src/App.tsx`; changing the snapshot shape means updating both by hand.

## Known repo-hygiene issues (pending cleanup)

- `apps/web/public/` contains ~3,600 git-tracked hash-named `.json` files that are Babel transform-cache junk from an unrelated project (antd/react-router code) — the only real asset there is `vite.svg`. `apps/web/dist/` mirrors them but is gitignored.
- `apps/web/src/zealous-mclean` is a stray git-reflog fragment, also tracked.
- Both are deletion candidates during revision; nothing in the app references them.
