import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { CATEGORIES, CONDITIONS, STATUS_LABEL, formatDate, label } from '../constants.js';
import useFetch from '../hooks/useFetch.js';
import DataState from '../components/DataState.jsx';
import Empty from '../components/Empty.jsx';
import Icon from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';
import PriorityGauge from '../components/PriorityGauge.jsx';
import RefreshBar from '../components/RefreshBar.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const TABS = ['Pickup requests', 'Users', 'E-waste', 'Teams'];
const POLL_SECONDS = 10;

function Cell({ value, label: text, sub, tone }) {
  return (
    <div>
      <div className={`ledger-value ${tone || ''}`}>{value}</div>
      <div className="ledger-label">{text}</div>
      {sub && <div className="ledger-sub">{sub}</div>}
    </div>
  );
}

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

export default function AdminDashboard() {
  const [auto, setAuto] = useState(true);
  const interval = auto ? POLL_SECONDS * 1000 : 0;
  // The numbers come from GET /api/admin/stats (COUNT/SUM computed by MySQL); the tables come from the list endpoints.
  const statsQ = useFetch(() => api.admin.stats(), [], { intervalMs: interval });
  const data = useFetch(() => Promise.all([api.users.list(), api.ewaste.list(), api.requests.list(), api.teams.list()]), [], { intervalMs: interval });
  const [tab, setTab] = useState(TABS[0]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [users, items, requests, teams] = data.data || [[], [], [], []];
  const st = statsQ.data;

  const userName = (id) => users.find((u) => u.user_id === id)?.full_name || `#${id}`;
  const itemName = (id) => items.find((i) => i.item_id === id)?.item_name || `#${id}`;
  const teamName = (id) => (id ? teams.find((t) => t.team_id === id)?.team_name || `#${id}` : '-');
  const reload = () => { statsQ.reload(); data.reload(); };
  const match = (...parts) => !query.trim() || parts.join(' ').toLowerCase().includes(query.trim().toLowerCase());
  const counts = { 'Pickup requests': requests.length, Users: users.length, 'E-waste': items.length, Teams: teams.length };
  const maxKg = st ? Math.max(1, ...st.ewaste_by_category.map((c) => Number(c.total_weight_kg))) : 1;

  const switchTab = (t) => { setTab(t); setQuery(''); setStatus(''); };

  return (
    <>
      <PageHeader title="Dashboard" lead="Live totals from the database, with every record underneath.">
        <button className="btn quiet" onClick={reload}><Icon name="refresh" />Refresh</button>
      </PageHeader>
      <div style={{ marginBottom: 16 }}>
        <RefreshBar auto={auto} onToggle={setAuto} seconds={POLL_SECONDS} updatedAt={statsQ.updatedAt} pollError={statsQ.pollError || data.pollError} />
      </div>

      <DataState loading={(statsQ.loading && !statsQ.data) || (data.loading && !data.data)}
        error={statsQ.error || data.error} onRetry={reload} rows={6}>
        {st && (
          <>
            {st.integrity_violations > 0 && (
              <div className="notice error" role="alert"><Icon name="alert" />
                <div>{st.integrity_violations} database consistency violation(s). Run <code>database/scheduler_checks.sql</code> to see them.</div>
              </div>
            )}
            <h2 className="ledger-title">Requests</h2>
            <div className="ledger">
              <Cell value={st.pending_requests} label="Pending" />
              <Cell value={st.assigned_requests} label="Assigned" />
              <Cell value={st.in_progress_requests} label="In progress" />
              <Cell value={st.completed_requests} label="Completed" />
              <Cell value={st.cancelled_requests} label="Cancelled" />
            </div>
            <h2 className="ledger-title">People, items and teams</h2>
            <div className="ledger">
              <Cell value={st.total_users} label="Users" />
              <Cell value={st.total_ewaste_items} label="E-waste items" sub={`${st.total_ewaste_units} units`} />
              <Cell value={Number(st.total_ewaste_kg).toFixed(1)} label="Total kg" />
              <Cell value={st.available_teams} label="Teams available" />
              <Cell value={st.busy_teams} label="Teams busy" />
              <Cell value={st.integrity_violations === 0 ? 'OK' : st.integrity_violations} label="DB consistency" tone={st.integrity_violations === 0 ? 'good' : 'bad'} />
            </div>

            {st.ewaste_by_category.length > 0 && (
              <section className="panel">
                <div className="panel-head"><h2>E-waste by category</h2><span className="muted small">Weight in kg</span></div>
                <div className="bars">
                  {st.ewaste_by_category.map((c) => (
                    <div key={c.category} className="bar">
                      <span>{label(CATEGORIES, c.category)}</span>
                      <div className="bar-track" role="img" aria-label={`${Number(c.total_weight_kg).toFixed(2)} kg`}>
                        <div className="bar-fill" style={{ width: `${(Number(c.total_weight_kg) / maxKg) * 100}%` }} />
                      </div>
                      <span className="muted small nowrap">{Number(c.total_weight_kg).toFixed(2)} kg &middot; {c.total_units} units</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <section className="panel flush">
          <div className="tabs" role="tablist" aria-label="Records">
            {TABS.map((t) => (
              <button key={t} role="tab" aria-selected={t === tab} onClick={() => switchTab(t)}>
                {t}<span className="count">{counts[t]}</span>
              </button>
            ))}
          </div>
          <div className="toolbar">
            <div className="search">
              <Icon name="search" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${tab.toLowerCase()}`} aria-label={`Search ${tab}`} />
            </div>
            {tab === 'Pickup requests' && (
              <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status" style={{ width: 'auto' }}>
                <option value="">All statuses</option>
                {['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            )}
          </div>

          {tab === 'Pickup requests' && (
            <Table head={['Request', 'User', 'E-waste', 'Priority', 'Requested', 'Status', 'Team']} emptyText="No pickup requests match."
              rows={[...requests].sort((a, b) => b.request_id - a.request_id)
                .filter((r) => (!status || r.status === status) && match(r.request_id, userName(r.user_id), itemName(r.item_id), r.location, teamName(r.team_id), r.status))
                .map((r) => (
                  <tr key={r.request_id}>
                    <td><Link to={`/status/${r.request_id}`}>#{r.request_id}</Link></td><td>{userName(r.user_id)}</td><td>{itemName(r.item_id)}</td>
                    <td><PriorityGauge value={r.priority} /></td><td className="nowrap">{formatDate(r.request_time)}</td>
                    <td><StatusBadge status={r.status} /></td><td>{teamName(r.team_id)}</td>
                  </tr>
                ))} />
          )}
          {tab === 'Users' && (
            <Table head={['ID', 'Name', 'Email', 'Phone', 'Address', 'Registered']} emptyText="No users match."
              rows={users.filter((u) => match(u.full_name, u.email, u.phone, u.address)).map((u) => (
                <tr key={u.user_id}><td>{u.user_id}</td><td>{u.full_name}</td><td>{u.email}</td><td>{u.phone}</td><td className="wrap">{u.address}</td><td className="nowrap">{formatDate(u.created_at)}</td></tr>
              ))} />
          )}
          {tab === 'E-waste' && (
            <Table head={['ID', 'Owner', 'Item', 'Type', 'Condition', 'Qty', 'Weight (kg)']} emptyText="No e-waste matches."
              rows={items.filter((i) => match(i.item_name, userName(i.user_id), label(CATEGORIES, i.category), label(CONDITIONS, i.item_condition))).map((i) => (
                <tr key={i.item_id}><td>{i.item_id}</td><td>{userName(i.user_id)}</td><td>{i.item_name}</td><td>{label(CATEGORIES, i.category)}</td><td>{label(CONDITIONS, i.item_condition)}</td><td className="num">{i.quantity}</td><td className="num">{i.weight_kg}</td></tr>
              ))} />
          )}
          {tab === 'Teams' && (
            <Table head={['ID', 'Team', 'Phone', 'Vehicle', 'Status', 'Current task']} emptyText="No teams match."
              rows={teams.filter((t) => match(t.team_name, t.contact_phone, t.vehicle_number, t.status)).map((t) => (
                <tr key={t.team_id}><td>{t.team_id}</td><td>{t.team_name}</td><td>{t.contact_phone}</td><td>{t.vehicle_number || '-'}</td><td><StatusBadge status={t.status} /></td>
                  <td>{t.current_task ? <Link to={`/status/${t.current_task}`}>#{t.current_task}</Link> : '-'}</td></tr>
              ))} />
          )}
        </section>
      </DataState>
    </>
  );
}
