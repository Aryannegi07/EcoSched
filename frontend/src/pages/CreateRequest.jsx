import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { CATEGORIES, PRIORITY_PRESETS, isOpen, label, priorityLabel } from '../constants.js';
import { useToast } from '../context/Feedback.jsx';
import useFetch from '../hooks/useFetch.js';
import DataState from '../components/DataState.jsx';
import Empty from '../components/Empty.jsx';
import Field, { Fieldset } from '../components/Field.jsx';
import Icon from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';
import PriorityGauge from '../components/PriorityGauge.jsx';
import RequestTracker from '../components/RequestTracker.jsx';
import RequireUser from '../components/RequireUser.jsx';

function Form({ user }) {
  const [params] = useSearchParams();
  const data = useFetch(() => Promise.all([api.ewaste.list(), api.requests.list()]), [user.user_id]);
  const [itemId, setItemId] = useState(params.get('item') || '');
  const [location, setLocation] = useState(user.address || '');
  const [priority, setPriority] = useState(5);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');
  const [created, setCreated] = useState(null);
  const toast = useToast();

  const [items, requests] = data.data || [[], []];
  const busyItems = new Set(requests.filter((r) => isOpen(r.status)).map((r) => r.item_id));
  const freeItems = items.filter((i) => i.user_id === user.user_id && !busyItems.has(i.item_id));
  const selected = freeItems.find((i) => String(i.item_id) === itemId);

  async function submit(e) {
    e.preventDefault();
    setApiError('');
    const v = {};
    if (!selected) v.item_id = 'Choose the item to be collected';
    if (!location.trim()) v.location = 'Enter the pickup location';
    else if (location.length > 255) v.location = 'Use 255 characters or fewer';
    setErrors(v);
    if (Object.keys(v).length) return;
    setSubmitting(true);
    try {
      const req = await api.requests.create({ user_id: user.user_id, item_id: selected.item_id, location: location.trim(), priority });
      setCreated({ ...req, item_name: selected.item_name });
      setItemId('');
      data.reload();
      toast.success(`Pickup request #${req.request_id} created`);
    } catch (err) {
      setApiError(err.message);
      if (err instanceof ApiError) setErrors(err.fieldErrors);
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <div className="panel narrow">
        <div className="notice success">
          <Icon name="check" />
          <div><b>Request #{created.request_id}</b> for {created.item_name} is in the queue.</div>
        </div>
        <RequestTracker status={created.status} />
        <p className="muted" style={{ margin: '20px 0' }}>
          It stays Pending until the scheduler assigns a team. Higher priority requests are assigned first.
        </p>
        <div className="btn-row">
          <Link className="btn" to={`/status/${created.request_id}`}>Track this request<Icon name="arrow" /></Link>
          <button className="btn quiet" onClick={() => setCreated(null)}>Request another pickup</button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel narrow">
      <DataState loading={data.loading && !data.data} error={data.error} onRetry={data.reload} rows={4}>
        {freeItems.length === 0 ? (
          <Empty action={<Link className="btn" to="/ewaste"><Icon name="plus" />Add e-waste</Link>}>
            {items.some((i) => i.user_id === user.user_id)
              ? 'Every item already has an open pickup request.'
              : 'You have no e-waste yet. Add an item first, then request its pickup.'}
          </Empty>
        ) : (
          <form onSubmit={submit} noValidate>
            {apiError && <div className="notice error" role="alert"><Icon name="alert" /><div>{apiError}</div></div>}
            <Fieldset legend="Which item should we collect?" error={errors.item_id}>
              <div className="pick-list" role="radiogroup">
                {freeItems.map((i) => (
                  <label key={i.item_id} className="pick">
                    <input type="radio" name="item" value={i.item_id} checked={String(i.item_id) === itemId} onChange={(e) => setItemId(e.target.value)} />
                    <div>
                      <span><b>{i.item_name}</b><span className="muted small">{label(CATEGORIES, i.category)}</span></span>
                      <span className="muted small nowrap">{i.quantity} &times; &middot; {i.weight_kg} kg</span>
                    </div>
                  </label>
                ))}
              </div>
            </Fieldset>

            <Field label="Pickup location" name="location" error={errors.location} hint="Filled in from your account address. Change it if the item is somewhere else.">
              <textarea rows="2" value={location} onChange={(e) => setLocation(e.target.value)} />
            </Field>

            <Fieldset legend="How urgent is it?" hint="Urgent requests are assigned to a team first. Use Urgent only when it cannot wait." error={errors.priority}>
              <div className="chips" role="radiogroup">
                {PRIORITY_PRESETS.map(([name, value]) => (
                  <label key={name} className="chip">
                    <input type="radio" name="priority" checked={priority === value} onChange={() => setPriority(value)} />
                    <span>{name}</span>
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 10 }}>
                <input type="range" min="1" max="10" value={priority} onChange={(e) => setPriority(Number(e.target.value))}
                  aria-label={`Priority ${priority} of 10`} style={{ maxWidth: 260 }} />
                <PriorityGauge value={priority} />
                <span className="muted small">{priorityLabel(priority)}</span>
              </div>
            </Fieldset>

            <button className="btn lg" disabled={submitting}>{submitting ? 'Creating request...' : 'Request pickup'}</button>
          </form>
        )}
      </DataState>
    </div>
  );
}

export default function CreateRequest() {
  return (
    <>
      <PageHeader title="Request a pickup" lead="Choose an item and where to collect it. A team is assigned by priority." />
      <RequireUser reason="request a pickup">{(user) => <Form key={user.user_id} user={user} />}</RequireUser>
    </>
  );
}
