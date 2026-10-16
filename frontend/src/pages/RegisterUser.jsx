import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { useUsers } from '../context/UserContext.jsx';
import { useToast } from '../context/Feedback.jsx';
import Field from '../components/Field.jsx';
import Icon from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';

const empty = { full_name: '', email: '', phone: '', address: '' };

function validate(f) {
  const e = {};
  if (!f.full_name.trim()) e.full_name = 'Enter your full name';
  else if (f.full_name.length > 100) e.full_name = 'Use 100 characters or fewer';
  if (!f.email.trim()) e.email = 'Enter your email address';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = 'Enter a valid email address, like name@example.com';
  if (!f.phone.trim()) e.phone = 'Enter your phone number';
  else if (!/^\+?[0-9]{10,13}$/.test(f.phone)) e.phone = 'Use 10 to 13 digits, with an optional leading +';
  if (!f.address.trim()) e.address = 'Enter your address';
  else if (f.address.length > 255) e.address = 'Use 255 characters or fewer';
  return e;
}

export default function RegisterUser({ login=false }) {
  const [form, setForm] = useState({...empty,password:''});
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');
  const [created, setCreated] = useState(null);
  const { login: signIn } = useUsers();
  const toast = useToast();
  const navigate = useNavigate();

  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value });
    if (errors[k]) setErrors({ ...errors, [k]: undefined });
  };

  async function submit(e) {
    e.preventDefault();
    setApiError('');
    const v = login ? { ...(form.email.trim() ? {} : {email:'Enter your email address'}), ...(form.password.length >= 8 ? {} : {password:'Password must be at least 8 characters'}) } : validate(form);
    setErrors(v);
    if (Object.keys(v).length) return;
    setSubmitting(true);
    try {
      const user = login ? await signIn({email:form.email.trim(),password:form.password}) : await api.auth.register({full_name: form.full_name.trim(), email: form.email.trim(), phone: form.phone.trim(), address: form.address.trim(), password:form.password});
      if (login) { navigate('/'); return; }
      setCreated(user);
      setForm({...empty,password:''});
      toast.success(`Account created for ${user.full_name}`);
    } catch (err) {
      setApiError(err.message);
      if (err instanceof ApiError) setErrors(err.fieldErrors);
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <>
        <PageHeader title="You're registered" />
        <div className="panel narrow">
          <div className="notice success"><Icon name="check" /><div><b>{created.full_name}</b> is now the active user (ID {created.user_id}).</div></div>
          <p className="muted">Next, add the item you want collected.</p>
          <div className="btn-row">
            <Link className="btn" to="/ewaste">Add e-waste<Icon name="arrow" /></Link>
            <button className="btn quiet" onClick={() => setCreated(null)}>Register another user</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
        <PageHeader title={login ? 'Log in to EcoSched' : 'Create an account'} lead={login ? 'Use your EcoSched account to continue.' : 'Your address is used as the default pickup location.'} />
      <div className="panel narrow">
        {apiError && <div className="notice error" role="alert"><Icon name="alert" /><div>{apiError}</div></div>}
        <form onSubmit={submit} noValidate>
          {!login && <Field label="Full name" name="full_name" error={errors.full_name}>
            <input value={form.full_name} onChange={set('full_name')} autoComplete="name" />
          </Field>}
          <div className="row">
            <Field label="Email" name="email" error={errors.email}>
              <input type="email" value={form.email} onChange={set('email')} autoComplete="email" />
            </Field>
            <Field label="Phone" name="phone" error={errors.phone}>
              <input type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} placeholder="9876500001" autoComplete="tel" />
            </Field>
          </div>
          <Field label="Password" name="password" error={errors.password}><input type="password" value={form.password} onChange={set('password')} autoComplete={login?'current-password':'new-password'} /></Field>
          {!login && <Field label="Address" name="address" error={errors.address} hint="Street, area and city, so the team can find you."><textarea rows="3" value={form.address} onChange={set('address')} /></Field>}
          <button className="btn" disabled={submitting}>{submitting ? 'Please wait...' : login ? 'Log in' : 'Create account'}</button>
          <p className="muted">{login ? <Link to="/register">Create an account</Link> : <Link to="/login">Already registered? Log in</Link>}</p>
        </form>
      </div>
    </>
  );
}
