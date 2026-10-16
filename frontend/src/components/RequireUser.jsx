import { Link } from 'react-router-dom';
import { useUsers } from '../context/UserContext.jsx';
import { Skeleton } from './DataState.jsx';
import Icon from './Icon.jsx';

/** Pages for citizens need a user. If none is chosen yet, ask once, right here. */
export default function RequireUser({ children, reason = 'continue' }) {
  const { users, user, setUserId, loaded, error } = useUsers();
  if (!loaded) return <Skeleton rows={4} />;
  if (error) return <div className="notice error" role="alert"><Icon name="alert" /><div>{error}</div></div>;
  if (user) return children(user);
  return (
    <div className="panel gate narrow">
      <h2>Who is this for?</h2>
      <p className="muted">Choose a user to {reason}. You can switch any time from the left menu.</p>
      {users.length > 0 && (
        <div className="field">
          <label htmlFor="gate-user">User</label>
          <select id="gate-user" value="" onChange={(e) => setUserId(e.target.value)}>
            <option value="">Select a user...</option>
            {users.map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name} ({u.email})</option>)}
          </select>
        </div>
      )}
      <Link className={`btn ${users.length ? 'quiet' : ''}`} to="/register"><Icon name="plus" />Create a new user</Link>
    </div>
  );
}
