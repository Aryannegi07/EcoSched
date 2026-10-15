import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { CATEGORIES, formatDate, label } from '../constants.js';
import { useUsers } from '../context/UserContext.jsx';
import useFetch from '../hooks/useFetch.js';
import DataState from '../components/DataState.jsx';
import Icon from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';
import PriorityGauge from '../components/PriorityGauge.jsx';
import RequestTracker from '../components/RequestTracker.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const MESSAGES = {
  PENDING: 'Waiting for a team. The scheduler assigns the most urgent requests first.',
  ASSIGNED: 'A team has been assigned and will start the pickup soon.',
  IN_PROGRESS: 'The team is on the way to collect your item.',
  COMPLETED: 'Your item has been collected. Thank you for recycling.',
};

function Detail({ id }) {
  // Re-checks every 10 s so the page follows the request while you watch it.
  const data = useFetch(async () => {
    const request = await api.requests.get(id);
    const [item, owner, teams] = await Promise.all([api.ewaste.get(request.item_id), api.users.get(request.user_id), api.teams.list()]);
    const team = request.team_id ? teams.find((t) => t.team_id === request.team_id) : null;
    return { request, item, owner, team };
  }, [id], { intervalMs: 10000 });

  return (
    <DataState loading={data.loading} error={data.error} onRetry={data.reload} rows={5}>
      {data.data && (() => {
        const { request: r, item, owner, team } = data.data;
        return (
          <>
            <div className="panel">
              <div className="panel-head">
                <h2>Request #{r.request_id}</h2>
                <StatusBadge status={r.status} />
              </div>
              {r.status === 'CANCELLED'
                ? <div className="notice warn"><Icon name="alert" /><div>This request was cancelled. You can create a new one from your items.</div></div>
                : <>
                  <RequestTracker status={r.status} />
                  <p className="muted" style={{ margin: '18px 0 0' }}>{MESSAGES[r.status]}</p>
                </>}
            </div>

            <div className="split even">
              <div className="panel">
                <h3 style={{ marginBottom: 14 }}>Pickup details</h3>
                <dl className="facts">
                  <dt>Item</dt><dd>{item.item_name}, {label(CATEGORIES, item.category)}</dd>
                  <dt>Amount</dt><dd>{item.quantity} &times; &middot; {item.weight_kg} kg</dd>
                  <dt>Priority</dt><dd><PriorityGauge value={r.priority} /></dd>
                  <dt>Location</dt><dd>{r.location}</dd>
                  <dt>Requested</dt><dd>{formatDate(r.request_time)}</dd>
                  <dt>Requested by</dt><dd>{owner.full_name}</dd>
                </dl>
              </div>
              <div className="panel">
                <h3 style={{ marginBottom: 14 }}>Collection team</h3>
                {team ? (
                  <dl className="facts">
                    <dt>Team</dt><dd>{team.team_name}</dd>
                    <dt>Phone</dt><dd>{team.contact_phone}</dd>
                    <dt>Vehicle</dt><dd>{team.vehicle_number || 'Not listed'}</dd>
                  </dl>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>
                    {r.status === 'CANCELLED' ? 'No team was assigned.' : 'No team is assigned yet. This page updates by itself.'}
                  </p>
                )}
              </div>
            </div>
          </>
        );
      })()}
    </DataState>
  );
}

export default function RequestStatus() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useUsers();
  const [input, setInput] = useState(id || '');
  const [error, setError] = useState('');
  const mine = useFetch(() => (user ? api.requests.forUser(user.user_id) : Promise.resolve([])), [user?.user_id]);

  function search(e) {
    e.preventDefault();
    if (!/^[0-9]+$/.test(input.trim())) {
      setError('Enter the request number, digits only');
      return;
    }
    setError('');
    navigate(`/status/${input.trim()}`);
  }

  const recent = [...(mine.data || [])].sort((a, b) => b.request_id - a.request_id).slice(0, 6);

  return (
    <>
      <PageHeader title="Track a request" lead="Enter a request number to see where the pickup stands." />
      <div className="panel narrow">
        <form onSubmit={search} noValidate>
          <div className="field" style={{ marginBottom: recent.length ? 12 : 0 }}>
            <label htmlFor="req-id">Request number</label>
            <div className="inline-form">
              <input id="req-id" inputMode="numeric" value={input} onChange={(e) => setInput(e.target.value)} placeholder="For example 4"
                aria-invalid={error ? 'true' : undefined} />
              <button className="btn"><Icon name="search" />Track</button>
            </div>
            {error && <span className="field-error" role="alert"><Icon name="alert" />{error}</span>}
          </div>
        </form>
        {recent.length > 0 && (
          <div className="chips" aria-label="Your recent requests">
            {recent.map((r) => (
              <Link key={r.request_id} to={`/status/${r.request_id}`} className="chip">
                <span style={String(r.request_id) === id ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' } : undefined}>
                  #{r.request_id} <StatusBadge status={r.status} />
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
      {id && <Detail id={id} />}
    </>
  );
}
