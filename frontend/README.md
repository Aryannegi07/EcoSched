# EcoSched Frontend (React + Vite)

Needs Node.js 18+.

```bash
npm install
npm start          # http://localhost:3000
npm run build      # production build in dist/
```

The backend must be running (default `http://localhost:8080`, see `../README.md`).
To use another API address, copy `.env.example` to `.env` and change `VITE_API_BASE_URL`.
Fonts (Bricolage Grotesque, IBM Plex Sans) are bundled through npm, so the app looks the same offline.

## How the interface is organised

The left menu has two groups and one switch:

- **Acting as** - pick the user once; every citizen page uses that user. The choice is remembered in the browser. There is no login yet.
- **Citizen** - Home, Add e-waste, Request pickup, My requests, Track a request.
- **Operations** - Dashboard, Scheduler, Teams.
- A dot at the bottom shows whether the backend is reachable.

## Pages

| Route | Page |
|-------|------|
| `/` | Home: the next step for the active user, their progress, live operations counts |
| `/register` | Create an account (becomes the active user) |
| `/ewaste` | Add e-waste; lists the user's items with a "Request pickup" shortcut |
| `/request` | Request a pickup (`?item=ID` preselects an item); Low / Medium / Urgent presets plus a 1-10 slider |
| `/history` | The user's requests with filters; Pending and Assigned requests can be cancelled |
| `/status`, `/status/:id` | Progress tracker, details and assigned team; refreshes every 10 s |
| `/admin` | Dashboard: MySQL totals, e-waste by category, searchable tables |
| `/teams` | Add, edit and delete collection teams |
| `/scheduler` | Run the C scheduler, pending queue, active pickups (start / complete / cancel), teams, last run, and the OS-DBMS pipeline |

## Code map

- `src/context/` - `UserContext` (users + active user) and `Feedback` (toasts and the confirm dialog)
- `src/components/` - shared pieces (`StatusBadge`, `PriorityGauge`, `RequestTracker`, `FlowDiagram`, `Field`, `DataState`, ...)
- `src/pages/` - one file per route
- `src/api.js` - every backend call; `src/hooks/useFetch.js` - loading, error and polling
- `src/styles.css` - all styling, with colours and sizes defined as variables at the top

The browser never calculates scheduling results: every number on the Scheduler page comes from the backend.
