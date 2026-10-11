import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import Field from '../components/Field.jsx';
import useCurrentUser from '../hooks/useCurrentUser.js';

const empty = { full_name: '', email: '', phone: '', address: '' };

function validate(f) {
  const e = {};
  if (!f.full_name.trim()) e.full_name = 'Full name is required';
  else if (f.full_name.length > 100) e.full_name = 'Max 100 characters';
  if (!f.email.trim()) e.email = 'Email is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = 'Enter a valid email address';
  if (!f.phone.trim()) e.phone = 'Phone is required';
  else if (!/^\+?[0-9]{10,13}$/.test(f.phone)) e.phone = 'Phone must be 10 to 13 digits (optional leading +)';
  if (!f.address.trim()) e.address = 'Address is required';
  else if (f.address.length > 255) e.address = 'Max 255 characters';
  return e;
}

export default function RegisterUser() {
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');
  const [created, setCreated] = useState(null);
  const [, setCurrentUser] = useCurrentUser();

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setApiError('');
    setCreated(null);
    const v = validate(form);
    setErrors(v);
    if (Object.keys(v).length) return;
    setSubmitting(true);
    try {
      const user = await api.users.create({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
      });
      setCreated(user);
      setCurrentUser(user.user_id);
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
      <h2>User Registration</h2>
      {created && (
        <div className="alert success">
          Registered <b>{created.full_name}</b> (User ID {created.user_id}).{' '}
          <Link to="/ewaste">Next: register e-waste</Link>
        </div>
      )}
      {apiError && <div className="alert error">{apiError}</div>}
      <form onSubmit={submit} noValidate>
        <Field label="Full name" name="full_name" error={errors.full_name}>
          <input id="full_name" value={form.full_name} onChange={set('full_name')} />
        </Field>
        <Field label="Email" name="email" error={errors.email}>
          <input id="email" type="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Phone" name="phone" error={errors.phone}>
          <input id="phone" value={form.phone} onChange={set('phone')} placeholder="9876500001" />
        </Field>
        <Field label="Address" name="address" error={errors.address}>
          <textarea id="address" rows="2" value={form.address} onChange={set('address')} />
        </Field>
        <button className="btn" disabled={submitting}>{submitting ? 'Registering...' : 'Register'}</button>
      </form>
    </div>
  );
}
