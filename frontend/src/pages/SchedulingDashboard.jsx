import { useState } from 'react';
import { api } from '../api.js';
import { formatDate } from '../constants.js';
import DataState from '../components/DataState.jsx';
import Empty from '../components/Empty.jsx';
import FlowDiagram from '../components/FlowDiagram.jsx';
import RefreshBar from '../components/RefreshBar.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import useFetch from '../hooks/useFetch.js';

const POLL_SECONDS = 5;

export default function SchedulingDashboard() {
  const [auto, setAuto] = useState(true);
  const interval = auto ? POLL_SECONDS * 1000 : 0;
  // Two independent loads so "Refresh Queue" and "Refresh Teams" really refresh different data.
  const queueQ = useFetch(() => Promise.all([api.scheduler.queue(), api.requests.list()]), [], { intervalMs: interval });
  const statusQ = useFetch(() => api.scheduler.status(), [], { intervalMs: interval });
  const [queue, requests] = queueQ.data || [[], []];
  const status = statusQ.data;

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { type, text }

  const teams = status?.teams || [];
  const freeTeams = teams.filter((t) => t.status === 'AVAILABLE');
  const busyTeams = teams.filter((t) => t.status === 'BUSY');
  const active = requests.filter((r) => r.status === 'ASSIGNED' || r.status === 'IN_PROGRESS');
  const teamName = (id) => teams.find((t) => t.team_id === id)?.team_name || `#${id}`;
  const lastRun = status?.last_run;
  const refreshAll = () => { queueQ.reload(); statusQ.reload(); };

  // React -> Spring Boot -> C scheduler -> MySQL -> response -> React reloads both panels.
  async function act(fn, okText) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fn();
      setNotice({ type: 'success', text: okText(res) });
    } catch (e) {
      setNotice({ type: 'error', text: e.message });
    } finally {
      setBusy(false);
      refreshAll();
    }
  }

  const runScheduler = () => act(() => api.scheduler.run(), (res) => {
    const detail = res.assignments.map((a) => `#${a.request_id} → ${a.team_name}`).join(', ');
    return `${res.message}${detail ? `: ${detail}` : ''}`;
  });
  const start = (id) => act(() => api.requests.start(id), () => `Request #${id} is now IN_PROGRESS.`);
  const complete = (id) => act(() => api.requests.complete(id), () => `Request #${id} completed. Its team is AVAILABLE again.`);
  const cancel = (id) => act(() => api.requests.cancel(id), () => `Request #${id} cancelled. Its team (if any) is AVAILABLE again.`);

  const pollError = queueQ.pollError || statusQ.pollError;
  const updatedAt = statusQ.updatedAt && queueQ.updatedAt ? (statusQ.updatedAt < queueQ.updatedAt ? statusQ.updatedAt : queueQ.updatedAt) : null;

  return (
    <>
      <div className="page-head">
        <h2>Scheduling Dashboard</h2>
      </div>
      <div className="alert info">
        Non-preemptive priority scheduling (higher number = higher priority; ties go to the earlier request time).
        A team that is busy is never interrupted, even if a more urgent request arrives.
        Every value on this page is read from the backend (MySQL + the C scheduler); the browser calculates nothing.
      </div>

      <div className="toolbar">
        <button className="btn" onClick={runScheduler} disabled={busy || (status && !status.engine_available)}>
          {busy ? 'Working...' : 'Run Scheduler'}
        </button>
        <button className="btn secondary" onClick={queueQ.reload} disabled={busy}>Refresh Queue</button>
        <button className="btn secondary" onClick={statusQ.reload} disabled={busy}>Refresh Teams</button>
        <RefreshBar auto={auto} onToggle={setAuto} seconds={POLL_SECONDS} updatedAt={updatedAt} pollError={pollError} />
      </div>

      {notice && <div className={`alert ${notice.type}`}>{notice.text}</div>}

      <DataState loading={(queueQ.loading && !queueQ.data) || (statusQ.loading && !statusQ.data)}
                 error={queueQ.error || statusQ.error} onRetry={refreshAll}>
        {status && !status.engine_available && (
          <div className="alert error">C scheduler not found. Run <code>cd scheduler &amp;&amp; make</code> and restart the backend.</div>
        )}
        {status && status.integrity_violations > 0 && (
          <div className="alert error">
            Database consistency problem: {status.integrity_violations} row(s) in <code>v_integrity_violations</code>.
            Run <code>database/scheduler_checks.sql</code> to see them.
          </div>
        )}

        <div className="stats">
          <div className="card stat"><div className="stat-value">{status?.pending_requests ?? queue.length}</div><div>Pending</div></div>
          <div className="card stat"><div className="stat-value">{status?.assigned_requests ?? 0}</div><div>Assigned</div></div>
          <div className="card stat"><div className="stat-value">{status?.in_progress_requests ?? 0}</div><div>In progress</div></div>
          <div className="card stat"><div className="stat-value">{status?.available_teams ?? 0}</div><div>Available teams</div></div>
          <div className="card stat"><div className="stat-value">{status?.busy_teams ?? 0}</div><div>Busy teams</div></div>
          <div className="card stat">
            <div className={`stat-value ${status?.integrity_violations ? 'bad' : ''}`}>{status ? (status.integrity_violations === 0 ? 'OK' : status.integrity_violations) : '-'}</div>
            <div>DB consistency</div>
          </div>
        </div>

        <FlowDiagram queue={queue} status={status} running={busy} />

        <div className="card">
          <h3>Pending queue <span className="muted">(top row is dispatched first)</span></h3>
          {queue.length === 0 ? (
            <Empty>No pending requests.</Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Request ID</th><th>Priority</th><th>Request Time</th><th>Status</th></tr></thead>
                <tbody>
                  {queue.map((r) => (
                    <tr key={r.request_id}>
                      <td>#{r.request_id}</td><td>{r.priority}</td><td>{formatDate(r.request_time)}</td><td><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h3>Scheduler output</h3>
          {!lastRun ? (
            <Empty>The scheduler has not run since the backend started. Click "Run Scheduler".</Empty>
          ) : (
            <>
              <p className="hint">
                Run at {formatDate(lastRun.ran_at)}: {lastRun.message}. Pending before: {lastRun.pending_before},
                still pending: {lastRun.pending_count}.
              </p>
              {lastRun.assignments.length === 0 ? (
                <Empty>This run assigned nothing.</Empty>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Selected Request</th><th>Priority</th><th>Assigned Team</th><th>Team Status</th></tr></thead>
                    <tbody>
                      {lastRun.assignments.map((a, i) => (
                        <tr key={a.request_id}>
                          <td>#{a.request_id}{i === 0 ? ' (highest priority)' : ''}</td>
                          <td>{a.priority}</td>
                          <td>{a.team_name}</td>
                          <td><StatusBadge status={a.team_status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        <div className="grid2">
          <div className="card">
            <h3>Available teams ({freeTeams.length})</h3>
            {freeTeams.length === 0 ? <Empty>Every team is busy.</Empty> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>ID</th><th>Team</th><th>Vehicle</th><th>Status</th></tr></thead>
                  <tbody>
                    {freeTeams.map((t) => (
                      <tr key={t.team_id}><td>{t.team_id}</td><td>{t.team_name}</td><td>{t.vehicle_number || '-'}</td><td><StatusBadge status={t.status} /></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="card">
            <h3>Busy teams ({busyTeams.length})</h3>
            {busyTeams.length === 0 ? <Empty>No team is working right now.</Empty> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>ID</th><th>Team</th><th>Current task</th><th>Priority</th></tr></thead>
                  <tbody>
                    {busyTeams.map((t) => (
                      <tr key={t.team_id}>
                        <td>{t.team_id}</td><td>{t.team_name}</td>
                        <td>{t.current_task ? `#${t.current_task}` : '-'}</td>
                        <td>{t.current_priority ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <h3>Active pickups</h3>
          {active.length === 0 ? (
            <Empty>No request is being handled right now.</Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Request ID</th><th>Priority</th><th>Team</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {active.map((r) => (
                    <tr key={r.request_id}>
                      <td>#{r.request_id}</td><td>{r.priority}</td><td>{teamName(r.team_id)}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="actions">
                        {r.status === 'ASSIGNED' && <button className="btn secondary" onClick={() => start(r.request_id)} disabled={busy}>Start</button>}
                        <button className="btn" onClick={() => complete(r.request_id)} disabled={busy}>Complete Request</button>
                        <button className="btn danger" onClick={() => cancel(r.request_id)} disabled={busy}>Cancel</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DataState>
    </>
  );
}
