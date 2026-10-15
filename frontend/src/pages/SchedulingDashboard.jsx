import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatDate } from '../constants.js';
import { useConfirm, useToast } from '../context/Feedback.jsx';
import useFetch from '../hooks/useFetch.js';
import DataState from '../components/DataState.jsx';
import Empty from '../components/Empty.jsx';
import FlowDiagram from '../components/FlowDiagram.jsx';
import Icon from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';
import PriorityGauge from '../components/PriorityGauge.jsx';
import RefreshBar from '../components/RefreshBar.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const POLL_SECONDS = 5;

function Cell({ value, label, tone }) {
  return <div><div className={`ledger-value ${tone || ''}`}>{value}</div><div className="ledger-label">{label}</div></div>;
}

export default function SchedulingDashboard() {
  const [auto, setAuto] = useState(true);
  const interval = auto ? POLL_SECONDS * 1000 : 0;
  // Two independent loads so the queue and the team status refresh separately.
  const queueQ = useFetch(() => Promise.all([api.scheduler.queue(), api.requests.list()]), [], { intervalMs: interval });
  const statusQ = useFetch(() => api.scheduler.status(), [], { intervalMs: interval });
  const [queue, requests] = queueQ.data || [[], []];
  const status = statusQ.data;
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const teams = status?.teams || [];
  const freeCount = teams.filter((t) => t.status === 'AVAILABLE').length;
  const busyCount = teams.length - freeCount;
  const active = requests.filter((r) => r.status === 'ASSIGNED' || r.status === 'IN_PROGRESS');
  const teamName = (id) => teams.find((t) => t.team_id === id)?.team_name || `#${id}`;
  const lastRun = status?.last_run;
  const refreshAll = () => { queueQ.reload(); statusQ.reload(); };

  // React -> Spring Boot -> C scheduler -> MySQL -> response -> React reloads both panels.
  async function act(fn, okText) {
    setBusy(true);
    try {
      const res = await fn();
      toast.success(okText(res));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
      refreshAll();
    }
  }

  const runScheduler = () => act(() => api.scheduler.run(), (res) => {
    const detail = res.assignments.map((a) => `#${a.request_id} to ${a.team_name}`).join(', ');
    return `${res.message}${detail ? `: ${detail}` : ''}`;
  });
  const start = (id) => act(() => api.requests.start(id), () => `Request #${id} is in progress`);
  const complete = (id) => act(() => api.requests.complete(id), () => `Request #${id} completed. Its team is available again`);
  const cancel = async (id) => {
    const ok = await confirm({
      title: `Cancel request #${id}?`,
      body: 'The pickup is cancelled and its team, if any, becomes available again.',
      confirmLabel: 'Cancel request', cancelLabel: 'Keep request',
    });
    if (ok) act(() => api.requests.cancel(id), () => `Request #${id} cancelled`);
  };

  const pollError = queueQ.pollError || statusQ.pollError;
  const updatedAt = statusQ.updatedAt && queueQ.updatedAt ? (statusQ.updatedAt < queueQ.updatedAt ? statusQ.updatedAt : queueQ.updatedAt) : null;
  const engineMissing = status && !status.engine_available;

  return (
    <>
      <PageHeader title="Scheduler"
        lead="Non-preemptive priority scheduling: a higher number goes first, ties go to the earlier request, and a busy team is never interrupted.">
        <button className="btn quiet" onClick={refreshAll} disabled={busy}><Icon name="refresh" />Refresh</button>
        <button className="btn lg" onClick={runScheduler} disabled={busy || engineMissing}>
          <Icon name={busy ? 'refresh' : 'play'} className={busy ? 'spin' : ''} />{busy ? 'Working...' : 'Run scheduler'}
        </button>
      </PageHeader>
      <div style={{ marginBottom: 16 }}>
        <RefreshBar auto={auto} onToggle={setAuto} seconds={POLL_SECONDS} updatedAt={updatedAt} pollError={pollError} />
      </div>

      <DataState loading={(queueQ.loading && !queueQ.data) || (statusQ.loading && !statusQ.data)}
        error={queueQ.error || statusQ.error} onRetry={refreshAll} rows={6}>
        {engineMissing && (
          <div className="notice error" role="alert"><Icon name="alert" />
            <div>The C scheduler was not found. Run <code>cd scheduler &amp;&amp; make</code> and restart the backend.</div>
          </div>
        )}
        {status && status.integrity_violations > 0 && (
          <div className="notice error" role="alert"><Icon name="alert" />
            <div>Database consistency problem: {status.integrity_violations} row(s) in <code>v_integrity_violations</code>. Run <code>database/scheduler_checks.sql</code> to see them.</div>
          </div>
        )}

        <div className="ledger">
          <Cell value={status?.pending_requests ?? queue.length} label="Pending" />
          <Cell value={status?.assigned_requests ?? 0} label="Assigned" />
          <Cell value={status?.in_progress_requests ?? 0} label="In progress" />
          <Cell value={status?.available_teams ?? freeCount} label="Teams available" />
          <Cell value={status?.busy_teams ?? busyCount} label="Teams busy" />
          <Cell value={status ? (status.integrity_violations === 0 ? 'OK' : status.integrity_violations) : '-'} label="DB consistency"
            tone={status ? (status.integrity_violations === 0 ? 'good' : 'bad') : ''} />
        </div>

        <div className="split">
          <div>
            <section className="panel flush">
              <div className="panel-head">
                <div><h2>Pending queue</h2><p className="muted small">The top row is assigned first.</p></div>
              </div>
              {queue.length === 0 ? <Empty>No pending requests. New requests appear here.</Empty> : (
                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table>
                    <thead><tr><th>Order</th><th>Request</th><th>Priority</th><th>Requested</th><th>Location</th></tr></thead>
                    <tbody>
                      {queue.map((r, i) => (
                        <tr key={r.request_id} className={i === 0 ? 'first-up' : ''}>
                          <td>{r.rank ?? i + 1}</td>
                          <td><Link to={`/status/${r.request_id}`}>#{r.request_id}</Link></td>
                          <td><PriorityGauge value={r.priority} /></td>
                          <td className="nowrap">{formatDate(r.request_time)}</td>
                          <td className="wrap">{r.location || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="panel flush">
              <div className="panel-head"><h2>Active pickups</h2></div>
              {active.length === 0 ? <Empty>No pickup is being handled right now. Run the scheduler to assign teams.</Empty> : (
                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table>
                    <thead><tr><th>Request</th><th>Priority</th><th>Team</th><th>Status</th><th /></tr></thead>
                    <tbody>
                      {active.map((r) => (
                        <tr key={r.request_id}>
                          <td><Link to={`/status/${r.request_id}`}>#{r.request_id}</Link></td>
                          <td><PriorityGauge value={r.priority} /></td>
                          <td>{teamName(r.team_id)}</td>
                          <td><StatusBadge status={r.status} /></td>
                          <td>
                            <div className="row-actions">
                              {r.status === 'ASSIGNED' && <button className="btn quiet sm" onClick={() => start(r.request_id)} disabled={busy}>Start</button>}
                              <button className="btn sm" onClick={() => complete(r.request_id)} disabled={busy}><Icon name="check" />Complete</button>
                              <button className="btn danger sm" onClick={() => cancel(r.request_id)} disabled={busy}>Cancel</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="panel">
              <div className="panel-head"><h2>Teams</h2><span className="muted small">{freeCount} available &middot; {busyCount} busy</span></div>
              {teams.length === 0 ? <Empty action={<Link className="btn" to="/teams"><Icon name="plus" />Add a team</Link>}>No teams exist yet.</Empty> : (
                <div className="team-grid">
                  {teams.map((t) => (
                    <div key={t.team_id} className={`team ${t.status === 'BUSY' ? 'busy' : ''}`}>
                      <div className="team-head"><b>{t.team_name}</b><StatusBadge status={t.status} /></div>
                      <span className="muted small">{t.vehicle_number || 'No vehicle listed'}</span>
                      {t.status === 'BUSY' && t.current_task
                        ? <span className="small">Request <Link to={`/status/${t.current_task}`}>#{t.current_task}</Link>{t.current_priority != null && <> &middot; priority {t.current_priority}</>}</span>
                        : <span className="small muted">Ready for the next request</span>}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="panel flush">
              <div className="panel-head"><h2>Last scheduler run</h2></div>
              {!lastRun ? <Empty>The scheduler has not run since the backend started. Choose Run scheduler.</Empty> : (
                <>
                  <p className="muted small" style={{ padding: '4px 22px 0' }}>
                    {formatDate(lastRun.ran_at)}: {lastRun.message}. Pending before: {lastRun.pending_before}, still pending: {lastRun.pending_count}.
                  </p>
                  {lastRun.assignments.length === 0 ? <Empty>This run assigned nothing.</Empty> : (
                    <div className="table-wrap" style={{ marginTop: 12 }}>
                      <table>
                        <thead><tr><th>Request</th><th>Priority</th><th>Assigned team</th><th>Team status</th></tr></thead>
                        <tbody>
                          {lastRun.assignments.map((a, i) => (
                            <tr key={a.request_id}>
                              <td>#{a.request_id}{i === 0 && <span className="muted small"> highest priority</span>}</td>
                              <td><PriorityGauge value={a.priority} /></td>
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
            </section>
          </div>

          <FlowDiagram queue={queue} status={status} running={busy} />
        </div>
      </DataState>
    </>
  );
}
