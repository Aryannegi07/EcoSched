import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { formatDate, label, CATEGORIES, priorityLabel } from '../constants.js';
import DataState from '../components/DataState.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import useFetch from '../hooks/useFetch.js';

function Detail({ id }) {
  const data = useFetch(async () => {
    const request = await api.requests.get(id);
    const [item, user, teams] = await Promise.all([api.ewaste.get(request.item_id), api.users.get(request.user_id), api.teams.list()]);
    const team = request.team_id ? teams.find((t) => t.team_id === request.team_id) : null;
    return { request, item, user, team };
  }, [id]);

  return (
    <DataState loading={data.loading} error={data.error} onRetry={data.reload}>
      {data.data && (() => {
        const { request: r, item, user, team } = data.data;
        return (
          <dl className="details">
            <dt>Request ID</dt><dd>#{r.request_id}</dd>
            <dt>Status</dt><dd><StatusBadge status={r.status} /></dd>
            <dt>Priority</dt><dd>{r.priority} / 10 ({priorityLabel(r.priority)})</dd>
            <dt>Request time</dt><dd>{formatDate(r.request_time)}</dd>
            <dt>Pickup location</dt><dd>{r.location}</dd>
            <dt>User</dt><dd>{user.full_name} ({user.email})</dd>
            <dt>E-waste</dt><dd>{item.item_name} - {label(CATEGORIES, item.category)}, {item.quantity} x, {item.weight_kg} kg</dd>
            <dt>Assigned team</dt>
            <dd>{team ? `${team.team_name} (${team.contact_phone}${team.vehicle_number ? `, ${team.vehicle_number}` : ''})` : 'No team assigned yet'}</dd>
          </dl>
        );
      })()}
    </DataState>
  );
}

export default function RequestStatus() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(id || '');
  const [error, setError] = useState('');

  function search(e) {
    e.preventDefault();
    if (!/^[0-9]+$/.test(input.trim())) {
      setError('Enter a numeric request ID');
      return;
    }
    setError('');
    navigate(`/status/${input.trim()}`);
  }

  return (
    <div className="card narrow">
      <h2>Request Status</h2>
      <form onSubmit={search} className="inline-form" noValidate>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Request ID" aria-label="Request ID" />
        <button className="btn">Check</button>
      </form>
      {error && <span className="field-error">{error}</span>}
      {id && <Detail id={id} />}
    </div>
  );
}
