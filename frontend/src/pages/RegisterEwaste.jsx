import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { CATEGORIES, CONDITIONS, isOpen, label } from '../constants.js';
import { useToast } from '../context/Feedback.jsx';
import useFetch from '../hooks/useFetch.js';
import DataState from '../components/DataState.jsx';
import Empty from '../components/Empty.jsx';
import Field, { Fieldset } from '../components/Field.jsx';
import Icon from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';
import RequireUser from '../components/RequireUser.jsx';

const empty = { item_name: '', category: 'LAPTOP', item_condition: 'NON_WORKING', quantity: '1', weight_kg: '', description: '' };

function validate(f) {
  const e = {};
  if (!f.item_name.trim()) e.item_name = 'Give the item a name, like "Old Dell laptop"';
  else if (f.item_name.length > 100) e.item_name = 'Use 100 characters or fewer';
  const q = Number(f.quantity);
  if (!Number.isInteger(q) || q < 1 || q > 1000) e.quantity = 'Enter a whole number from 1 to 1000';
  const w = Number(f.weight_kg);
  if (f.weight_kg === '' || Number.isNaN(w) || w < 0.01 || w > 99999.99) e.weight_kg = 'Enter a weight between 0.01 and 99999.99 kg';
  if (f.description.length > 255) e.description = 'Use 255 characters or fewer';
  return e;
}

function Form({ user }) {
  const mine = useFetch(() => Promise.all([api.ewaste.list(), api.requests.list()]), [user.user_id]);
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');
  const [created, setCreated] = useState(null);
  const toast = useToast();

  const [items, requests] = mine.data || [[], []];
  const myItems = items.filter((i) => i.user_id === user.user_id).sort((a, b) => b.item_id - a.item_id);
  const openItemIds = new Set(requests.filter((r) => isOpen(r.status)).map((r) => r.item_id));

  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value });
    if (errors[k]) setErrors({ ...errors, [k]: undefined });
  };

  async function submit(e) {
    e.preventDefault();
    setApiError('');
    const v = validate(form);
    setErrors(v);
    if (Object.keys(v).length) return;
    setSubmitting(true);
    try {
      const item = await api.ewaste.create({
        user_id: user.user_id,
        item_name: form.item_name.trim(),
        category: form.category,
        item_condition: form.item_condition,
        quantity: Number(form.quantity),
        weight_kg: Number(form.weight_kg),
        description: form.description.trim() || null,
      });
      setCreated(item);
      setForm(empty);
      mine.reload();
      toast.success(`${item.item_name} added`);
    } catch (err) {
      setApiError(err.message);
      if (err instanceof ApiError) setErrors(err.fieldErrors);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="split form-left">
      <div className="panel">
        <h2 style={{ marginBottom: 16 }}>Item details</h2>
        {created && (
          <div className="notice success">
            <Icon name="check" />
            <div>
              <b>{created.item_name}</b> was added.{' '}
              <Link to={`/request?item=${created.item_id}`}>Request a pickup for it</Link>
            </div>
          </div>
        )}
        {apiError && <div className="notice error" role="alert"><Icon name="alert" /><div>{apiError}</div></div>}
        <form onSubmit={submit} noValidate>
          <Field label="Item name" name="item_name" error={errors.item_name}>
            <input value={form.item_name} onChange={set('item_name')} />
          </Field>
          <Fieldset legend="Type" error={errors.category}>
            <div className="chips" role="radiogroup">
              {CATEGORIES.map(([v, l]) => (
                <label key={v} className="chip">
                  <input type="radio" name="category" value={v} checked={form.category === v} onChange={set('category')} />
                  <span>{l}</span>
                </label>
              ))}
            </div>
          </Fieldset>
          <Fieldset legend="Condition" error={errors.item_condition}>
            <div className="chips" role="radiogroup">
              {CONDITIONS.map(([v, l]) => (
                <label key={v} className="chip">
                  <input type="radio" name="item_condition" value={v} checked={form.item_condition === v} onChange={set('item_condition')} />
                  <span>{l}</span>
                </label>
              ))}
            </div>
          </Fieldset>
          <div className="row">
            <Field label="Quantity" name="quantity" error={errors.quantity}>
              <input type="number" min="1" inputMode="numeric" value={form.quantity} onChange={set('quantity')} />
            </Field>
            <Field label="Total weight (kg)" name="weight_kg" error={errors.weight_kg}>
              <input type="number" step="0.01" min="0.01" inputMode="decimal" value={form.weight_kg} onChange={set('weight_kg')} />
            </Field>
          </div>
          <Field label="Notes (optional)" name="description" error={errors.description}>
            <textarea rows="2" value={form.description} onChange={set('description')} />
          </Field>
          <button className="btn" disabled={submitting}>{submitting ? 'Saving...' : 'Add e-waste'}</button>
        </form>
      </div>

      <div className="panel">
        <h2 style={{ marginBottom: 12 }}>Your items</h2>
        <DataState loading={mine.loading && !mine.data} error={mine.error} onRetry={mine.reload}>
          {myItems.length === 0 ? (
            <Empty>Nothing added yet. Your items will be listed here.</Empty>
          ) : (
            <ul className="rows">
              {myItems.map((i) => (
                <li key={i.item_id} className="item-row">
                  <div className="item-main">
                    <span className="item-title">{i.item_name}</span>
                    <span className="item-meta">
                      <span>{label(CATEGORIES, i.category)}</span>
                      <span>{i.quantity} &times; &middot; {i.weight_kg} kg</span>
                      <span>{label(CONDITIONS, i.item_condition)}</span>
                    </span>
                  </div>
                  {openItemIds.has(i.item_id)
                    ? <span className="muted small">Pickup requested</span>
                    : <Link className="btn quiet sm" to={`/request?item=${i.item_id}`}>Request pickup</Link>}
                </li>
              ))}
            </ul>
          )}
        </DataState>
      </div>
    </div>
  );
}

export default function RegisterEwaste() {
  return (
    <>
      <PageHeader title="Add e-waste" lead="Describe what you want to give away. You can request a pickup right after." />
      <RequireUser reason="add e-waste">{(user) => <Form user={user} />}</RequireUser>
    </>
  );
}
