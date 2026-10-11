import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatDate } from '../constants.js';
import DataState from '../components/DataState.jsx';
import Empty from '../components/Empty.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import UserSelect from '../components/UserSelect.jsx';
import useFetch from '../hooks/useFetch.js';
import useCurrentUser from '../hooks/useCurrentUser.js';

export default function RequestHistory() {
  const data = useFetch(() => Promise.all([api.users.list(), api.requests.list(), api.ewaste.list(), api.teams.list()]));
  const [userId, setUserId] = useCurrentUser();
  const [users, requests, items, teams] = data.data || [[], [], [], []];

  const itemName = (id) => items.find((i) => i.item_id === id)?.item_name || `#${id}`;
  const teamName = (id) => (id ? teams.find((t) => t.team_id === id)?.team_name || `#${id}` : 'Not assigned');
  const mine = requests.filter((r) => String(r.user_id) === userId).sort((a, b) => b.request_id - a.request_id);

  return (
    <div className="card">
      <h2>My Requests</h2>
      <DataState loading={data.loading && !data.data} error={data.error} onRetry={data.reload}>
        <div className="narrow">
          <UserSelect users={users} value={userId} onChange={setUserId} />
        </div>
        {!userId ? (
          <Empty>Select a user to see their requests.</Empty>
        ) : mine.length === 0 ? (
          <Empty>No requests for this user yet. <Link to="/request">Create a pickup request</Link>.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Request ID</th><th>E-Waste</th><th>Priority</th><th>Request Time</th><th>Status</th><th>Assigned Team</th><th></th></tr>
              </thead>
              <tbody>
                {mine.map((r) => (
                  <tr key={r.request_id}>
                    <td>#{r.request_id}</td>
                    <td>{itemName(r.item_id)}</td>
                    <td>{r.priority}</td>
                    <td>{formatDate(r.request_time)}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>{teamName(r.team_id)}</td>
                    <td><Link to={`/status/${r.request_id}`}>Details</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataState>
    </div>
  );
}
