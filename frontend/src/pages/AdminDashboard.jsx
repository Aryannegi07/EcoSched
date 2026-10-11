import { useState } from 'react';
import { api } from '../api.js';
import { CATEGORIES, CONDITIONS, formatDate, label } from '../constants.js';
import DataState from '../components/DataState.jsx';
import Empty from '../components/Empty.jsx';
import RefreshBar from '../components/RefreshBar.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import useFetch from '../hooks/useFetch.js';

const TABS = ['Users', 'E-Waste', 'Pickup Requests', 'Collection Teams'];

function Table({ head, rows, emptyText }) {
  if (rows.length === 0) return <Empty>{emptyText}</Empty>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

const POLL_SECONDS = 10;

export default function AdminDashboard() {
  const [auto, setAuto] = useState(true);
  const interval = auto ? POLL_SECONDS * 1000 : 0;
  // The numbers come from GET /api/admin/stats (COUNT/SUM computed by MySQL); the tables come from the list endpoints.
  const statsQ = useFetch(() => api.admin.stats(), [], { intervalMs: interval });
  const data = useFetch(() => Promise.all([api.users.list(), api.ewaste.list(), api.requests.list(), api.teams.list()]), [], { intervalMs: interval });
  const [tab, setTab] = useState(TABS[2]);
  const [users, items, requests, teams] = data.data || [[], [], [], []];
  const st = statsQ.data;

  const userName = (id) => users.find((u) => u.user_id === id)?.full_name || `#${id}`;
  const itemName = (id) => items.find((i) => i.item_id === id)?.item_name || `#${id}`;
  const teamName = (id) => (id ? teams.find((t) => t.team_id === id)?.team_name || `#${id}` : '-');
  const reload = () => { statsQ.reload(); data.reload(); };

  const stats = st ? [
    ['Total Users', st.total_users],
    ['Total E-Waste', `${st.total_ewaste_items} items`, `${st.total_ewaste_units} units, ${Number(st.total_ewaste_kg).toFixed(2)} kg`],
    ['Pending Requests', st.pending_requests],
    ['Assigned Requests', st.assigned_requests],
    ['In-Progress Requests', st.in_progress_requests],
    ['Completed Requests', st.completed_requests],
    ['Available Teams', st.available_teams],
    ['Busy Teams', st.busy_teams],
  ] : [];

  return (
    <>
      <div className="page-head">
        <h2>Admin Dashboard</h2>
        <button className="btn secondary" onClick={reload}>Refresh</button>
      </div>
      <RefreshBar auto={auto} onToggle={setAuto} seconds={POLL_SECONDS}
        updatedAt={statsQ.updatedAt} pollError={statsQ.pollError || data.pollError} />
      <DataState loading={(statsQ.loading && !statsQ.data) || (data.loading && !data.data)}
                 error={statsQ.error || data.error} onRetry={reload}>
        <div className="stats">
          {stats.map(([name, value, sub]) => (
            <div key={name} className="card stat">
              <div className="stat-value">{value}</div><div>{name}</div>
              {sub && <div className="muted small">{sub}</div>}
            </div>
          ))}
        </div>
        {st && (
          <p className="hint">
            Cancelled: {st.cancelled_requests} | Database consistency:{' '}
            {st.integrity_violations === 0
              ? <b className="ok">OK</b>
              : <b className="bad">{st.integrity_violations} violation(s) - run database/scheduler_checks.sql</b>}
          </p>
        )}

        {st && st.ewaste_by_category.length > 0 && (
          <div className="card">
            <h3>E-waste statistics by category</h3>
            <Table head={['Category', 'Item records', 'Units', 'Weight (kg)']} emptyText=""
              rows={st.ewaste_by_category.map((c) => (
                <tr key={c.category}><td>{label(CATEGORIES, c.category)}</td><td>{c.item_records}</td><td>{c.total_units}</td><td>{Number(c.total_weight_kg).toFixed(2)}</td></tr>
              ))} />
          </div>
        )}

        <div className="card">
          <div className="tabs">
            {TABS.map((t) => <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}
          </div>

          {tab === 'Users' && (
            <Table head={['ID', 'Name', 'Email', 'Phone', 'Address', 'Registered']} emptyText="No users registered yet."
              rows={users.map((u) => (
                <tr key={u.user_id}><td>{u.user_id}</td><td>{u.full_name}</td><td>{u.email}</td><td>{u.phone}</td><td>{u.address}</td><td>{formatDate(u.created_at)}</td></tr>
              ))} />
          )}
          {tab === 'E-Waste' && (
            <Table head={['ID', 'Owner', 'Item', 'Category', 'Condition', 'Qty', 'Weight (kg)']} emptyText="No e-waste registered yet."
              rows={items.map((i) => (
                <tr key={i.item_id}><td>{i.item_id}</td><td>{userName(i.user_id)}</td><td>{i.item_name}</td><td>{label(CATEGORIES, i.category)}</td><td>{label(CONDITIONS, i.item_condition)}</td><td>{i.quantity}</td><td>{i.weight_kg}</td></tr>
              ))} />
          )}
          {tab === 'Pickup Requests' && (
            <Table head={['Request ID', 'User', 'E-Waste', 'Priority', 'Request Time', 'Status', 'Assigned Team']} emptyText="No pickup requests yet."
              rows={requests.map((r) => (
                <tr key={r.request_id}>
                  <td>#{r.request_id}</td><td>{userName(r.user_id)}</td><td>{itemName(r.item_id)}</td><td>{r.priority}</td>
                  <td>{formatDate(r.request_time)}</td><td><StatusBadge status={r.status} /></td><td>{teamName(r.team_id)}</td>
                </tr>
              ))} />
          )}
          {tab === 'Collection Teams' && (
            <Table head={['ID', 'Team', 'Phone', 'Vehicle', 'Status', 'Current task']} emptyText="No collection teams yet."
              rows={teams.map((t) => (
                <tr key={t.team_id}><td>{t.team_id}</td><td>{t.team_name}</td><td>{t.contact_phone}</td><td>{t.vehicle_number || '-'}</td><td><StatusBadge status={t.status} /></td><td>{t.current_task ? `#${t.current_task}` : '-'}</td></tr>
              ))} />
          )}
        </div>
      </DataState>
    </>
  );
}
