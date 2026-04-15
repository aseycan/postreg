# Port Sentinel

Port Sentinel is a Windows-first local operations dashboard for developers who want to inspect listening ports, see which processes own them, review active Docker containers, and terminate a process, port, or container from one interface.

## Why This Project Exists

When you are developing locally, it is easy to lose track of which app is holding a port, whether Docker is still exposing a container, or which PID should be terminated. Port Sentinel brings that information into a single React UI backed by a lightweight Express API.

## Highlights

- Inspect local TCP and UDP socket data from a single dashboard
- Focus on listening ports with process names, PIDs, and localhost links
- Search by PID, process name, port, or local address
- Refresh automatically every 2.5 seconds
- Kill a process directly by PID
- Kill the process currently listening on a given port
- Kill or stop active Docker containers
- Switch the interface language between Turkish, English, Latin, German, and French

## Tech Stack

- React 19
- TypeScript
- Vite 7
- Node.js
- Express
- Docker CLI integration
- Windows system tools: `netstat`, `tasklist`, `taskkill`

## Quick Start

### Windows quick launch

Use the bundled starter script from the repository root:

```bat
start_project.bat
```

This script installs missing dependencies and starts both services:

- Web UI: `http://localhost:5173`
- API: `http://localhost:8787`

### Manual setup

Install dependencies:

```bash
npm install
npm --prefix apps/api install
npm --prefix apps/web install
```

Start the API:

```bash
npm --prefix apps/api run dev
```

Start the web app in a second terminal:

```bash
npm --prefix apps/web run dev
```

The web app proxies `/api` requests to `http://localhost:8787`.

## What You Can Do

### Ports view

- See listening TCP ports with PID and process name
- Open detected localhost services directly from the UI
- Filter rows instantly with the search box

### Docker view

- List currently running containers
- Review container image and published ports
- Stop a container directly from the dashboard

### Actions

- Kill by PID
- Kill by port
- Kill Docker container

## API Endpoints

- `GET /api/health`
- `GET /api/snapshot`
- `POST /api/kill/pid`
- `POST /api/kill/port`
- `POST /api/docker/kill`

## Platform Notes

- Full socket inspection and process termination are currently implemented for Windows.
- On non-Windows systems, Docker listing may still work if the `docker` CLI is available, but socket/process actions are limited.

## Security Note

This project is meant for local development and machine administration. The API can terminate processes and containers, so it should not be exposed to untrusted networks without adding authentication and authorization.

## Roadmap

- Add Linux and macOS socket/process support
- Add auth for shared environments
- Add richer Docker metadata and logs
- Add exportable snapshots and action history
- Ship screenshots and a public demo page

## License

MIT
