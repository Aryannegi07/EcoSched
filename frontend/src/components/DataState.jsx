export default function DataState({ loading, error, onRetry, children }) {
  if (loading) return <div className="state loading">Loading...</div>;
  if (error) {
    return (
      <div className="state error">
        <p>{error}</p>
        {onRetry && <button className="btn secondary" onClick={onRetry}>Retry</button>}
      </div>
    );
  }
  return children;
}
