import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { OPEN_STATUSES, priorityLabel } from '../constants.js';
import DataState from '../components/DataState.jsx';
import Empty from '../components/Empty.jsx';
import Field from '../components/Field.jsx';
import UserSelect from '../components/UserSelect.jsx';
import useFetch from '../hooks/useFetch.js';
import useCurrentUser from '../hooks/useCurrentUser.js';

export default function CreateRequest() {
  const data = useFetch(() => Promise.all([api.users.list(), api.ewaste.list(), api.requests.list()]));
  const [userId, setUserId] = useCurrentUser();
  const [itemId, setItemId] = useState('');
  const [location, setLocation] = useState('');
  const [priority, setPriority] = useState('5');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');
  const [created, setCreated] = useState(null);

  const [users, items, requests] = data.data || [[], [], []];
  const selectedUser = users.find((u) => String(u.user_id) === userId);
  const busyItems = new Set(requests.filter((r) => OPEN_STATUSES.includes(r.status)).map((r) => r.item_id));
  const myItems = items.filter((i) => String(i.user_id) === userId && !busyItems.has(i.item_id));

  useEffect(() => {
    setItemId('');
    setLocation(selectedUser?.address || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, data.data]);

  async function submit(e) {
    e.preventDefault();
    setApiError('');
    setCreated(null);
    const v = {};
    if (!userId) v.user = 'Select a user';
    if (!itemId) v.item_id = 'Select an e-waste item';
    if (!location.trim()) v.location = 'Pickup location is required';
    else if (location.length > 255) v.location = 'Max 255 characters';
    const p = Number(priority);
    if (!Number.isInteger(p) || p < 1 || p > 10) v.priority = 'Priority must be 1 to 10';
    setErrors(v);
    if (Object.keys(v).length) return;
    setSubmitting(true);
    try {
      const req = await api.requests.create({ user_id: Number(userId), item_id: Number(itemId), location: location.trim(), priority: p });
      setCreated(req);
      data.reload();
    } catch (err) {
      setApiError(err.message);
      if (err instanceof ApiError) setErrors(err.fieldErrors);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card narrow">
      <h2>Create Pickup Request</h2>
      <DataState loading={data.loading && !data.data} error={data.error} onRetry={data.reload}>
        {users.length === 0 ? (
          <Empty>No users yet. <Link to="/register">Register a user first</Link>.</Empty>
        ) : (
          <>
            {created && (
              <div className="alert success">
                Request <b>#{created.request_id}</b> created with priority {created.priority}, status {created.status}.{' '}
                <Link to={`/status/${created.request_id}`}>View status</Link>
              </div>
            )}
            {apiError && <div className="alert error">{apiError}</div>}
            <form onSubmit={submit} noValidate>
              <UserSelect users={users} value={userId} onChange={setUserId} error={errors.user || errors.user_id} />
              <Field label="E-waste item" name="item_id" error={errors.item_id}>
                <select id="item_id" value={itemId} onChange={(e) => setItemId(e.target.value)} disabled={!userId}>
                  <option value="">{userId ? 'Select an item...' : 'Select a user first'}</option>
                  {myItems.map((i) => (
                    <option key={i.item_id} value={i.item_id}>#{i.item_id} - {i.item_name} ({i.quantity} x, {i.weight_kg} kg)</option>
                  ))}
                </select>
              </Field>
              {userId && myItems.length === 0 && (
                <div className="hint">This user has no item without an open request. <Link to="/ewaste">Register e-waste</Link>.</div>
              )}
              <Field label="Pickup location" name="location" error={errors.location}>
                <textarea id="location" rows="2" value={location} onChange={(e) => setLocation(e.target.value)} />
              </Field>
              <Field label={`Priority (1 = low, 10 = urgent): ${priority} - ${priorityLabel(Number(priority))}`} name="priority" error={errors.priority}>
                <input id="priority" type="range" min="1" max="10" value={priority} onChange={(e) => setPriority(e.target.value)} />
              </Field>
              <button className="btn" disabled={submitting}>{submitting ? 'Creating...' : 'Create request'}</button>
            </form>
          </>
        )}
      </DataState>
    </div>
  );
}
