import { useState } from 'react';
import { api, ApiError } from '../api.js';
import DataState from '../components/DataState.jsx';
import Empty from '../components/Empty.jsx';
import Field from '../components/Field.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import useFetch from '../hooks/useFetch.js';

const empty = { team_name: '', contact_phone: '', vehicle_number: '' };

function validate(f) {
  const e = {};
  if (!f.team_name.trim()) e.team_name = 'Team name is required';
  else if (f.team_name.length > 100) e.team_name = 'Max 100 characters';
  if (!f.contact_phone.trim()) e.contact_phone = 'Contact phone is required';
  else if (!/^\+?[0-9]{10,13}$/.test(f.contact_phone)) e.contact_phone = 'Phone must be 10 to 13 digits (optional leading +)';
  if (f.vehicle_number.length > 20) e.vehicle_number = 'Max 20 characters';
  return e;
}

export default function TeamManagement() {
  const teams = useFetch(() => api.teams.list());
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');
  const [created, setCreated] = useState(null);
  const [editing, setEditing] = useState(null); // team being edited, or null

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
      const body = {
        team_name: form.team_name.trim(),
        contact_phone: form.contact_phone.trim(),
        vehicle_number: form.vehicle_number.trim() || null,
      };
      const team = editing ? await api.teams.update(editing.team_id, body) : await api.teams.create(body);
      setCreated(team);
      setEditing(null);
      setForm(empty);
      teams.reload();
    } catch (err) {
      setApiError(err.message);
      if (err instanceof ApiError) setErrors(err.fieldErrors);
    } finally {
      setSubmitting(false);
    }
  }

  const list = teams.data || [];

  function startEdit(t) {
    setEditing(t); setCreated(null); setApiError(''); setErrors({});
    setForm({ team_name: t.team_name, contact_phone: t.contact_phone, vehicle_number: t.vehicle_number || '' });
  }
  function cancelEdit() { setEditing(null); setForm(empty); setErrors({}); }

  async function remove(t) {
    if (!window.confirm(`Delete team "${t.team_name}"?`)) return;
    setApiError(''); setCreated(null);
    try { await api.teams.remove(t.team_id); teams.reload(); } catch (err) { setApiError(err.message); }
  }

  return (
    <div className="two-col">
      <div className="card">
        <h2>{editing ? `Edit Team #${editing.team_id}` : 'Add Team'}</h2>
        {created && <div className="alert success">Team <b>{created.team_name}</b> saved (ID {created.team_id}).</div>}
        {apiError && <div className="alert error">{apiError}</div>}
        <form onSubmit={submit} noValidate>
          <Field label="Team name" name="team_name" error={errors.team_name}>
            <input id="team_name" value={form.team_name} onChange={set('team_name')} />
          </Field>
          <Field label="Contact phone" name="contact_phone" error={errors.contact_phone}>
            <input id="contact_phone" value={form.contact_phone} onChange={set('contact_phone')} />
          </Field>
          <Field label="Vehicle number (optional)" name="vehicle_number" error={errors.vehicle_number}>
            <input id="vehicle_number" value={form.vehicle_number} onChange={set('vehicle_number')} />
          </Field>
          <p className="hint">New teams start AVAILABLE. Only the scheduler marks a team BUSY (when it assigns a request).</p>
          <button className="btn" disabled={submitting}>{submitting ? 'Saving...' : editing ? 'Save changes' : 'Add team'}</button>
          {editing && <button type="button" className="btn secondary" onClick={cancelEdit} style={{ marginLeft: 8 }}>Cancel</button>}
        </form>
      </div>

      <div className="card">
        <div className="page-head">
          <h2>Collection Teams</h2>
          <button className="btn secondary" onClick={teams.reload}>Refresh</button>
        </div>
        <DataState loading={teams.loading && !teams.data} error={teams.error} onRetry={teams.reload}>
          {list.length === 0 ? (
            <Empty>No teams yet. Add the first one.</Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>ID</th><th>Team</th><th>Phone</th><th>Vehicle</th><th>Status</th><th>Current task</th><th></th></tr></thead>
                <tbody>
                  {list.map((t) => (
                    <tr key={t.team_id}>
                      <td>{t.team_id}</td><td>{t.team_name}</td><td>{t.contact_phone}</td><td>{t.vehicle_number || '-'}</td>
                      <td><StatusBadge status={t.status} /></td><td>{t.current_task ? `#${t.current_task}` : '-'}</td>
                      <td className="actions"><button className="btn secondary" onClick={() => startEdit(t)}>Edit</button><button className="btn danger" onClick={() => remove(t)} disabled={t.status === 'BUSY'}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DataState>
      </div>
    </div>
  );
}
