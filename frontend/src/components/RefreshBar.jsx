export default function RefreshBar({ auto, onToggle, seconds, updatedAt, pollError }) {
  return (
    <div className="refresh-bar">
      <label>
        <input type="checkbox" checked={auto} onChange={(e) => onToggle(e.target.checked)} />
        Refresh every {seconds}s
      </label>
      <span>{updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : 'Loading...'}</span>
      {pollError && <span className="poll-error">Last refresh failed: {pollError}</span>}
    </div>
  );
}
