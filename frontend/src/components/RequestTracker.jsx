import Icon from './Icon.jsx';

const STEPS = [
  ['PENDING', 'Requested'],
  ['ASSIGNED', 'Team assigned'],
  ['IN_PROGRESS', 'Pickup under way'],
  ['COMPLETED', 'Collected'],
];

/** Where is my pickup? Four stages, the current one highlighted. */
export default function RequestTracker({ status }) {
  const cancelled = status === 'CANCELLED';
  const index = STEPS.findIndex(([s]) => s === status);
  return (
    <ol className={`tracker ${cancelled ? 'cancelled' : ''}`} aria-label="Request progress">
      {STEPS.map(([s, text], i) => {
        const state = cancelled ? '' : status === 'COMPLETED' || i < index ? 'done' : i === index ? 'current' : '';
        return (
          <li key={s} className={state} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="node">{state === 'done' && <Icon name="check" style={{ width: 16, height: 16 }} />}</span>
            {text}
          </li>
        );
      })}
    </ol>
  );
}
