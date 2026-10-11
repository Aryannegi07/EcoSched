import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { CATEGORIES, CONDITIONS } from '../constants.js';
import DataState from '../components/DataState.jsx';
import Empty from '../components/Empty.jsx';
import Field from '../components/Field.jsx';
import UserSelect from '../components/UserSelect.jsx';
import useFetch from '../hooks/useFetch.js';
import useCurrentUser from '../hooks/useCurrentUser.js';

const empty = { item_name: '', category: 'LAPTOP', item_condition: 'NON_WORKING', quantity: '1', weight_kg: '', description: '' };

function validate(f, userId) {
  const e = {};
  if (!userId) e.user = 'Select a user';
  if (!f.item_name.trim()) e.item_name = 'Item name is required';
  else if (f.item_name.length > 100) e.item_name = 'Max 100 characters';
  const q = Number(f.quantity);
  if (!Number.isInteger(q) || q < 1 || q > 1000) e.quantity = 'Quantity must be a whole number from 1 to 1000';
  const w = Number(f.weight_kg);
  if (f.weight_kg === '' || Number.isNaN(w) || w < 0.01 || w > 99999.99) e.weight_kg = 'Weight must be between 0.01 and 99999.99 kg';
  if (f.description.length > 255) e.description = 'Max 255 characters';
  return e;
}

export default function RegisterEwaste() {
  const users = useFetch(() => api.users.list());
  const [userId, setUserId] = useCurrentUser();
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');
  const [created, setCreated] = useState(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setApiError('');
    setCreated(null);
    const v = validate(form, userId);
    setErrors(v);
    if (Object.keys(v).length) return;
    setSubmitting(true);
    try {
      const item = await api.ewaste.create({
        user_id: Number(userId),
        item_name: form.item_name.trim(),
        category: form.category,
        item_condition: form.item_condition,
        quantity: Number(form.quantity),
        weight_kg: Number(form.weight_kg),
        description: form.description.trim() || null,
      });
      setCreated(item);
      setForm(empty);
    } catch (err) {
      setApiError(err.message);
      if (err instanceof ApiError) setErrors(err.fieldErrors);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card narrow">
      <h2>E-Waste Registration</h2>
      <DataState loading={users.loading} error={users.error} onRetry={users.reload}>
        {users.data?.length === 0 ? (
          <Empty>No users yet. <Link to="/register">Register a user first</Link>.</Empty>
        ) : (
          <>
            {created && (
              <div className="alert success">
                Registered <b>{created.item_name}</b> (Item ID {created.item_id}).{' '}
                <Link to="/request">Next: create pickup request</Link>
              </div>
            )}
            {apiError && <div className="alert error">{apiError}</div>}
            <form onSubmit={submit} noValidate>
              <UserSelect users={users.data || []} value={userId} onChange={setUserId} error={errors.user || errors.user_id} />
              <Field label="Item name" name="item_name" error={errors.item_name}>
                <input id="item_name" value={form.item_name} onChange={set('item_name')} />
              </Field>
              <div className="row">
                <Field label="Category" name="category" error={errors.category}>
                  <select id="category" value={form.category} onChange={set('category')}>
                    {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
                <Field label="Condition" name="item_condition" error={errors.item_condition}>
                  <select id="item_condition" value={form.item_condition} onChange={set('item_condition')}>
                    {CONDITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
              </div>
              <div className="row">
                <Field label="Quantity" name="quantity" error={errors.quantity}>
                  <input id="quantity" type="number" min="1" value={form.quantity} onChange={set('quantity')} />
                </Field>
                <Field label="Weight (kg)" name="weight_kg" error={errors.weight_kg}>
                  <input id="weight_kg" type="number" step="0.01" min="0.01" value={form.weight_kg} onChange={set('weight_kg')} />
                </Field>
              </div>
              <Field label="Description (optional)" name="description" error={errors.description}>
                <textarea id="description" rows="2" value={form.description} onChange={set('description')} />
              </Field>
              <button className="btn" disabled={submitting}>{submitting ? 'Saving...' : 'Register e-waste'}</button>
            </form>
          </>
        )}
      </DataState>
    </div>
  );
}
