/** "Auto-refresh every N s" toggle + last-updated time. Used by the admin and scheduling dashboards. */
export default function RefreshBar({ auto, onToggle, seconds, updatedAt, pollError }) {
  return (
    <div className="refresh-bar">
      <label>
        <input type="checkbox" checked={auto} onChange={(e) => onToggle(e.target.checked)} />
        Auto-refresh every {seconds}s
      </label>
      <span className="muted">{updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : 'Not loaded yet'}</span>
      {pollError && <span className="poll-error">Last refresh failed: {pollError}</span>}
    </div>
  );
}
