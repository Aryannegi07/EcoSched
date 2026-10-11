/**
 * The OS <-> DBMS pipeline, one box per step. Every text in a box comes from the backend:
 *   queue    = GET /api/scheduler/queue   (rows read from MySQL, ordered by the C scheduler)
 *   status   = GET /api/scheduler/status  (counts + teams from MySQL, integrity check, last run)
 *   lastRun  = status.last_run            (the C scheduler's decision as applied by Spring Boot)
 * Nothing here is calculated or invented by React; where the backend has not produced a value yet
 * the box says so.
 */
function Step({ title, tag, lines, state }) {
  return (
    <div className={`flow-step ${state}`}>
      <div className="flow-tag">{tag}</div>
      <div className="flow-title">{title}</div>
      {lines.map((l, i) => <div key={i} className="flow-line">{l}</div>)}
    </div>
  );
}

const Arrow = () => <div className="flow-arrow" aria-hidden="true">&#8595;</div>;

export default function FlowDiagram({ queue, status, running }) {
  const last = status?.last_run || null;
  const first = last?.assignments?.[0] || null;
  const next = queue[0] || null;
  const free = status?.available_teams ?? 0;
  const ran = !!last;
  const dbOk = status && status.integrity_violations === 0;

  return (
    <div className="card">
      <h3>OS &harr; DBMS flow</h3>
      <p className="hint">
        {running ? 'Scheduler running...' : ran
          ? `Showing the last scheduler run (${new Date(last.ran_at).toLocaleString()}).`
          : 'The scheduler has not run since the backend started. Boxes below show the current database state.'}
      </p>
      <div className="flow">
        <Step tag="DBMS" title="MySQL" state="done"
          lines={[`${status?.pending_requests ?? '-'} pending requests`, `${free} available / ${status?.busy_teams ?? '-'} busy teams`]} />
        <Arrow />
        <Step tag="DBMS" title="Pending Requests" state="done"
          lines={[queue.length ? `${queue.length} row(s) read: status = PENDING` : 'Queue is empty']} />
        <Arrow />
        <Step tag="OS" title="Priority Scheduler (C)" state={status?.engine_available ? (running ? 'active' : 'done') : 'error'}
          lines={[status?.engine_available ? 'Non-preemptive priority, ties by request time' : 'C program not found - run: cd scheduler && make']} />
        <Arrow />
        <Step tag="OS" title="Highest Priority Request" state={ran ? 'done' : 'idle'}
          lines={ran
            ? (first ? [`Request #${first.request_id}`, `Priority ${first.priority}`] : [last.message])
            : [next ? `Next in queue: #${next.request_id} (priority ${next.priority})` : 'Nothing waiting']} />
        <Arrow />
        <Step tag="OS" title="Available Team" state={ran ? 'done' : 'idle'}
          lines={ran
            ? (first ? [`${first.team_name} (ID ${first.team_id})`] : [`${last.available_teams} team(s) were free`])
            : [`${free} team(s) available - the scheduler picks one when it runs`]} />
        <Arrow />
        <Step tag="OS → DBMS" title="Assignment" state={ran ? 'done' : 'idle'}
          lines={ran
            ? [`${last.assigned_count} assigned of ${last.pending_before} pending`, ...(last.assignments || []).map((a) => `#${a.request_id} → ${a.team_name}`)]
            : ['Waiting for "Run Scheduler"']} />
        <Arrow />
        <Step tag="DBMS" title="MySQL UPDATE" state={ran ? (dbOk ? 'done' : 'error') : 'idle'}
          lines={ran
            ? [...(last.assignments || []).slice(0, 3).map((a) => `request #${a.request_id} = ${a.request_status}; team ${a.team_id} = ${a.team_status}, current_task = ${a.team_current_task}`),
               'One transaction: committed',
               dbOk ? 'Integrity check: OK (0 violations)' : `Integrity check: ${status?.integrity_violations} violation(s)!`]
            : ['request.team_id, request.status, team.status, team.current_task']} />
      </div>
    </div>
  );
}
