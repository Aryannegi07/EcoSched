
import { useEffect, useState } from 'react';
import {
  Routes,
  Route,
  NavLink,
  Link,
  useLocation,
} from 'react-router-dom';

import { api, API_BASE } from './api.js';
import { initials } from './constants.js';
import { useUsers } from './context/UserContext.jsx';
import useFetch from './hooks/useFetch.js';

import Icon from './components/Icon.jsx';

import Home from './pages/Home.jsx';
import RegisterUser from './pages/RegisterUser.jsx';
import RegisterEwaste from './pages/RegisterEwaste.jsx';
import CreateRequest from './pages/CreateRequest.jsx';
import RequestHistory from './pages/RequestHistory.jsx';
import RequestStatus from './pages/RequestStatus.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import TeamManagement from './pages/TeamManagement.jsx';
import SchedulingDashboard from './pages/SchedulingDashboard.jsx';

const NAV = [
  [
    'Citizen',
    [
      ['/', 'Home', 'home'],
      ['/ewaste', 'Add e-waste', 'box'],
      ['/request', 'Request pickup', 'truck'],
      ['/history', 'My requests', 'list'],
      ['/status', 'Track a request', 'search'],
    ],
  ],
  [
    'Operations',
    [
      ['/admin', 'Dashboard', 'grid'],
      ['/scheduler', 'Scheduler', 'cpu'],
      ['/teams', 'Teams', 'users'],
    ],
  ],
];

function Account() {
  const { user, logout } = useUsers();

  if (!user) {
    return (
      <div className="actor">
        <Link className="btn quiet sm" to="/login">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="actor">
      <span className="avatar">
        {initials(user.full_name)}
      </span>

      <span>{user.full_name}</span>

      <button
        className="btn quiet sm"
        onClick={logout}
      >
        Log out
      </button>
    </div>
  );
}

function Connection() {
  const [state, setState] = useState('checking');

  useEffect(() => {
    let active = true;

    async function checkBackend() {
      try {
        const response = await fetch(`${API_BASE}/auth/me`, {
          credentials: 'include',
        });

        if (active) {
          // 401 means the backend responded, even if logged out.
          setState(response.status < 500 ? 'up' : 'down');
        }
      } catch {
        if (active) {
          setState('down');
        }
      }
    }

    checkBackend();

    const timer = window.setInterval(checkBackend, 20000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const text =
    state === 'up'
      ? 'Backend reachable'
      : state === 'down'
        ? 'Backend not reachable'
        : 'Checking backend...';

  return (
    <div className="conn" title={API_BASE}>
      <span className={`dot ${state}`} />
      <span>{text}</span>
    </div>
  );
}

export default function App() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Read the current user from the shared UserContext.
  const { user } = useUsers();

  // Select navigation links according to the user's role.
  const isAdmin = user?.role === 'ADMIN';
  const [group, links] = isAdmin ? NAV[1] : NAV[0];

  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to content
      </a>

      <aside
        className={`rail ${open ? 'open' : ''}`}
        aria-label="Main"
      >
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Icon name="leaf" />
          </span>
          EcoSched
        </Link>

        <Account />

        <nav className="nav">
          <div className="nav-group">
            <p className="nav-title">{group}</p>

            {links.map(([to, text, icon]) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/' || to === '/status'}
              >
                <Icon name={icon} />
                {text}
              </NavLink>
            ))}
          </div>
        </nav>

        <Connection />
      </aside>

      <div
        className={`scrim ${open ? 'open' : ''}`}
        onClick={() => setOpen(false)}
      />

      <div className="stage">
        <header className="topbar">
          <button
            className="icon-btn"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Icon name="menu" />
          </button>

          <Link to="/" className="brand">
            EcoSched
          </Link>
        </header>

        <main id="main">
          <Routes>
            <Route path="/" element={<Home />} />

            <Route
              path="/register"
              element={<RegisterUser />}
            />

            <Route
              path="/login"
              element={<RegisterUser login />}
            />

            <Route
              path="/ewaste"
              element={<RegisterEwaste />}
            />

            <Route
              path="/request"
              element={<CreateRequest />}
            />

            <Route
              path="/history"
              element={<RequestHistory />}
            />

            <Route
              path="/status"
              element={<RequestStatus />}
            />

            <Route
              path="/status/:id"
              element={<RequestStatus />}
            />

            <Route
              path="/admin"
              element={<AdminDashboard />}
            />

            <Route
              path="/teams"
              element={<TeamManagement />}
            />

            <Route
              path="/scheduler"
              element={<SchedulingDashboard />}
            />

            <Route
              path="*"
              element={
                <div className="panel narrow">
                  <h1>Page not found</h1>

                  <p className="muted">
                    That address does not exist in EcoSched.
                  </p>

                  <Link className="btn" to="/">
                    Back to home
                  </Link>
                </div>
              }
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}
