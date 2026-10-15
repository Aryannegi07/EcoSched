import Icon from './Icon.jsx';

export function Skeleton({ rows = 3, height = 18 }) {
  return (
    <div role="status" aria-label="Loading" style={{ display: 'grid', gap: 12, padding: 4 }}>
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ height, width: i === rows - 1 ? '62%' : '100%' }} />)}
    </div>
  );
}

/** Shows a skeleton while loading, a retry box on error, otherwise the children. */
export default function DataState({ loading, error, onRetry, rows, children }) {
  if (loading) return <Skeleton rows={rows} />;
  if (error) {
    return (
      <div className="notice error" role="alert">
        <Icon name="alert" />
        <div>
          <p style={{ margin: '0 0 8px' }}>{error}</p>
          {onRetry && <button className="btn quiet sm" onClick={onRetry}><Icon name="refresh" />Try again</button>}
        </div>
      </div>
    );
  }
  return children;
}
