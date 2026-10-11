export default function StatusBadge({ status }) {
  return <span className={`badge ${String(status).toLowerCase()}`}>{String(status).replace('_', ' ')}</span>;
}
