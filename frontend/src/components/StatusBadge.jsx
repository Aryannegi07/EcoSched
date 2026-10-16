import { STATUS_LABEL } from '../constants.js';

export default function StatusBadge({ status }) {
  return <span className={`badge ${String(status).toLowerCase()}`}>{STATUS_LABEL[status] || status}</span>;
}
