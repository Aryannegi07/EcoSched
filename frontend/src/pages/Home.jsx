import { Link } from 'react-router-dom';
import { api, API_BASE } from '../api.js';
import useFetch from '../hooks/useFetch.js';

const steps = [
  ['1', 'Register', '/register', 'Create your user account.'],
  ['2', 'Register e-waste', '/ewaste', 'Add the item you want collected.'],
  ['3', 'Create pickup request', '/request', 'Choose the item, location and priority.'],
  ['4', 'My requests', '/history', 'See all your requests and their status.'],
  ['5', 'Request status', '/status', 'Check priority, status and assigned team.'],
];

export default function Home() {
  const { loading, error } = useFetch(() => api.teams.available());

  return (
    <>
      <div className="card hero">
        <h1>EcoSched</h1>
        <p>Smart E-Waste Management and Collection Scheduling System</p>
        <p className={`conn ${loading ? '' : error ? 'down' : 'up'}`}>
          {loading ? 'Checking backend...' : error ? `Backend not reachable at ${API_BASE}` : `Backend connected (${API_BASE})`}
        </p>
      </div>

      <h2>How it works</h2>
      <div className="grid">
        {steps.map(([n, title, to, text]) => (
          <Link key={to} to={to} className="card step">
            <span className="step-no">{n}</span>
            <h3>{title}</h3>
            <p>{text}</p>
          </Link>
        ))}
      </div>

      <h2>Administration</h2>
      <div className="grid">
        <Link to="/admin" className="card step"><h3>Admin Dashboard</h3><p>Live counts and tables of all records.</p></Link>
        <Link to="/teams" className="card step"><h3>Team Management</h3><p>Add and view collection teams.</p></Link>
        <Link to="/scheduler" className="card step"><h3>Scheduling Dashboard</h3><p>Run the C priority scheduler and complete pickups.</p></Link>
      </div>
    </>
  );
}
