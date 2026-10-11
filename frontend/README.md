# EcoSched Frontend (React + Vite)

Needs Node.js 18+.

```bash
npm install
npm start          # http://localhost:3000
npm run build      # production build in dist/
```

The backend must be running at `http://localhost:8080` (see `../README.md`).
To use another API address, copy `.env.example` to `.env` and change `VITE_API_BASE_URL`.

## Pages

| Route | Page |
|-------|------|
| `/` | Home (shows backend connection status) |
| `/register` | User registration |
| `/ewaste` | E-waste registration |
| `/request` | Create pickup request |
| `/history` | Requests of the selected user |
| `/status`, `/status/:id` | Request status, priority, assigned team |
| `/admin` | Dashboard counts and tables (users, e-waste, requests, teams) |
| `/teams` | Team management |
| `/scheduler` | Scheduling dashboard placeholder (priority queue) |

No login exists yet: forms use a user dropdown, and the last registered/selected user is remembered in the browser.
