import { priorityLabel, priorityLevel } from '../constants.js';

/** Ten ticks that fill up with the priority; colour follows Low / Medium / Urgent. */
export default function PriorityGauge({ value }) {
  const p = Number(value) || 0;
  return (
    <span className="prio" data-level={priorityLevel(p)} title={`Priority ${p} of 10 (${priorityLabel(p)})`}>
      <span className="prio-bars" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => <i key={i} className={i < p ? 'on' : ''} />)}
      </span>
      <b>{p}</b>
      <span className="sr-only">{priorityLabel(p)}</span>
    </span>
  );
}
