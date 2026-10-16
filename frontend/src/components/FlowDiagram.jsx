/**
 * The OS <-> DBMS pipeline drawn as a circuit trace: one pad per step, joined by a line.
 * Every text comes from the backend:
 *   queue    = GET /api/scheduler/queue   (rows read from MySQL, ordered by the C scheduler)
 *   status   = GET /api/scheduler/status  (counts + teams from MySQL, integrity check, last run)
 *   lastRun  = status.last_run            (the C scheduler's decision as applied by Spring Boot)
 * Nothing here is calculated or invented by React; where the backend has not produced a value yet
 * the step says so.
 */
import Icon from './Icon.jsx';

function Step({ title, layer, lines, state }) {
  return (
    <li className={`trace-step ${state}`}>
      <span className="trace-pad">{state === 'done' && <Icon name="check" style={{ width: 12, height: 12, color: '#fff' }} />}</span>
      <div className="trace-body">
        <div className="trace-title">{title}<span className={`layer ${layer.startsWith('OS') ? 'os' : ''}`}>{layer}</span></div>
        {lines.map((l, i) => <div key={i} className="trace-line">{l}</div>)}
      </div>
    </li>
  );
}

export default function FlowDiagram({ queue, status, running }) {
  const last = status?.last_run || null;
  const first = last?.assignments?.[0] || null;
  const next = queue[0] || null;
  const free = status?.available_teams ?? 0;
  const ran = !!last;
  const dbOk = status && status.integrity_violations === 0;
  const engineState = status?.engine_available ? (running ? 'active' : 'done') : 'error';

  return (
    <section className="panel sticky" aria-labelledby="trace-title">
      <h2 id="trace-title">How the scheduler decides</h2>
      <p className="muted small" style={{ margin: '4px 0 16px' }}>
        {running ? 'Scheduler running...' : ran
          ? `Last run: ${new Date(last.ran_at).toLocaleString()}.`
          : 'No run since the backend started. Steps show the current database state.'}
      </p>
      <ol className="trace">
        <Step layer="DBMS" title="MySQL" state="done"
          lines={[`${status?.pending_requests ?? '-'} pending requests`, `${free} available / ${status?.busy_teams ?? '-'} busy teams`]} />
        <Step layer="DBMS" title="Pending requests" state={running ? 'active' : 'done'}
          lines={[queue.length ? `${queue.length} row(s) read where status = PENDING` : 'Queue is empty']} />
        <Step layer="OS" title="Priority scheduler (C)" state={engineState}
          lines={[status?.engine_available ? 'Non-preemptive priority, ties by request time' : 'C program not found. Run: cd scheduler && make']} />
        <Step layer="OS" title="Highest priority request" state={ran ? 'done' : 'idle'}
          lines={ran
            ? (first ? [`Request #${first.request_id}, priority ${first.priority}`] : [last.message])
            : [next ? `Next in queue: #${next.request_id} (priority ${next.priority})` : 'Nothing waiting']} />
        <Step layer="OS" title="Available team" state={ran ? 'done' : 'idle'}
          lines={ran
            ? (first ? [`${first.team_name} (ID ${first.team_id})`] : [`${last.available_teams} team(s) were free`])
            : [`${free} team(s) available. The scheduler picks one when it runs.`]} />
        <Step layer="OS to DBMS" title="Assignment" state={ran ? 'done' : 'idle'}
          lines={ran
            ? [`${last.assigned_count} assigned of ${last.pending_before} pending`, ...(last.assignments || []).map((a) => `#${a.request_id} to ${a.team_name}`)]
            : ['Waiting for "Run scheduler"']} />
        <Step layer="DBMS" title="MySQL update" state={ran ? (dbOk ? 'done' : 'error') : 'idle'}
          lines={ran
            ? [...(last.assignments || []).slice(0, 3).map((a) => `request #${a.request_id} = ${a.request_status}; team ${a.team_id} = ${a.team_status}, current_task = ${a.team_current_task}`),
              'One transaction: committed',
              dbOk ? 'Integrity check: OK (0 violations)' : `Integrity check: ${status?.integrity_violations} violation(s)`]
            : ['request.team_id, request.status, team.status, team.current_task']} />
      </ol>
    </section>
  );
}
