import { Routes, Route, NavLink, Link } from 'react-router-dom';
import Home from './pages/Home.jsx';
import RegisterUser from './pages/RegisterUser.jsx';
import RegisterEwaste from './pages/RegisterEwaste.jsx';
import CreateRequest from './pages/CreateRequest.jsx';
import RequestHistory from './pages/RequestHistory.jsx';
import RequestStatus from './pages/RequestStatus.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import TeamManagement from './pages/TeamManagement.jsx';
import SchedulingDashboard from './pages/SchedulingDashboard.jsx';

const links = [
  ['/', 'Home'],
  ['/register', 'Register'],
  ['/ewaste', 'E-Waste'],
  ['/request', 'New Request'],
  ['/history', 'My Requests'],
  ['/status', 'Status'],
  ['/admin', 'Admin'],
  ['/teams', 'Teams'],
  ['/scheduler', 'Scheduler'],
];

export default function App() {
  return (
    <>
      <header className="navbar">
        <Link to="/" className="brand">EcoSched</Link>
        <nav>
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>
          ))}
        </nav>
      </header>
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/register" element={<RegisterUser />} />
          <Route path="/ewaste" element={<RegisterEwaste />} />
          <Route path="/request" element={<CreateRequest />} />
          <Route path="/history" element={<RequestHistory />} />
          <Route path="/status" element={<RequestStatus />} />
          <Route path="/status/:id" element={<RequestStatus />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/teams" element={<TeamManagement />} />
          <Route path="/scheduler" element={<SchedulingDashboard />} />
          <Route path="*" element={<div className="card"><h2>Page not found</h2><Link to="/">Back to home</Link></div>} />
        </Routes>
      </main>
    </>
  );
}
