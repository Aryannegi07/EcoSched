import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { useConfirm, useToast } from '../context/Feedback.jsx';
import useFetch from '../hooks/useFetch.js';
import DataState from '../components/DataState.jsx';
import Empty from '../components/Empty.jsx';
import Field from '../components/Field.jsx';
import Icon from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const empty = { team_name: '', contact_phone: '', vehicle_number: '' };

function validate(f) {
  const e = {};
  if (!f.team_name.trim()) e.team_name = 'Enter a team name';
  else if (f.team_name.length > 100) e.team_name = 'Use 100 characters or fewer';
  if (!f.contact_phone.trim()) e.contact_phone = 'Enter a contact phone';
  else if (!/^\+?[0-9]{10,13}$/.test(f.contact_phone)) e.contact_phone = 'Use 10 to 13 digits, with an optional leading +';
  if (f.vehicle_number.length > 20) e.vehicle_number = 'Use 20 characters or fewer';
  return e;
}

export default function TeamManagement() {
  const teams = useFetch(() => api.teams.list());
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');
  const [editing, setEditing] = useState(null);
  const confirm = useConfirm();
  const toast = useToast();

  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value });
    if (errors[k]) setErrors({ ...errors, [k]: undefined });
  };
  const list = teams.data || [];

  async function submit(e) {
    e.preventDefault();
    setApiError('');
    const v = validate(form);
    setErrors(v);
    if (Object.keys(v).length) return;
    setSubmitting(true);
    try {
      const body = { team_name: form.team_name.trim(), contact_phone: form.contact_phone.trim(), vehicle_number: form.vehicle_number.trim() || null };
      const team = editing ? await api.teams.update(editing.team_id, body) : await api.teams.create(body);
      toast.success(editing ? `${team.team_name} updated` : `${team.team_name} added and available`);
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

  function startEdit(t) {
    setEditing(t); setApiError(''); setErrors({});
    setForm({ team_name: t.team_name, contact_phone: t.contact_phone, vehicle_number: t.vehicle_number || '' });
    document.getElementById('team_name')?.focus();
  }
  function cancelEdit() { setEditing(null); setForm(empty); setErrors({}); setApiError(''); }

  async function remove(t) {
    const ok = await confirm({
      title: `Delete ${t.team_name}?`,
      body: 'This removes the team permanently. Teams with pickup history cannot be deleted.',
      confirmLabel: 'Delete team', cancelLabel: 'Keep team',
    });
    if (!ok) return;
    try { await api.teams.remove(t.team_id); toast.success(`${t.team_name} deleted`); } catch (err) { toast.error(err.message); } finally { teams.reload(); }
  }

  return (
    <>
      <PageHeader title="Collection teams" lead="Teams are assigned pickups by the scheduler. A new team starts Available and becomes Busy only while it works on a request." />
      <div className="split form-left">
        <section className="panel">
          <h2 style={{ marginBottom: 16 }}>{editing ? `Edit ${editing.team_name}` : 'Add a team'}</h2>
          {apiError && <div className="notice error" role="alert"><Icon name="alert" /><div>{apiError}</div></div>}
          <form onSubmit={submit} noValidate>
            <Field label="Team name" name="team_name" error={errors.team_name}>
              <input value={form.team_name} onChange={set('team_name')} />
            </Field>
            <Field label="Contact phone" name="contact_phone" error={errors.contact_phone}>
              <input type="tel" inputMode="tel" value={form.contact_phone} onChange={set('contact_phone')} />
            </Field>
            <Field label="Vehicle number (optional)" name="vehicle_number" error={errors.vehicle_number}>
              <input value={form.vehicle_number} onChange={set('vehicle_number')} />
            </Field>
            <div className="btn-row">
              <button className="btn" disabled={submitting}>{submitting ? 'Saving...' : editing ? 'Save changes' : 'Add team'}</button>
              {editing && <button type="button" className="btn quiet" onClick={cancelEdit}>Cancel</button>}
            </div>
          </form>
        </section>

        <section className="panel flush">
          <div className="panel-head">
            <h2>All teams <span className="muted" style={{ fontWeight: 400 }}>({list.length})</span></h2>
            <button className="btn quiet sm" onClick={teams.reload}><Icon name="refresh" />Refresh</button>
          </div>
          <DataState loading={teams.loading && !teams.data} error={teams.error} onRetry={teams.reload}>
            {list.length === 0 ? (
              <Empty>No teams yet. Add the first one with the form.</Empty>
            ) : (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table>
                  <thead><tr><th>Team</th><th>Vehicle</th><th>Status</th><th>Working on</th><th /></tr></thead>
                  <tbody>
                    {list.map((t) => (
                      <tr key={t.team_id}>
                        <td><b>{t.team_name}</b><div className="muted small">{t.contact_phone}</div></td>
                        <td>{t.vehicle_number || '-'}</td>
                        <td><StatusBadge status={t.status} /></td>
                        <td>{t.current_task ? <Link to={`/status/${t.current_task}`}>Request #{t.current_task}</Link> : '-'}</td>
                        <td>
                          <div className="row-actions">
                            <button className="btn quiet sm" onClick={() => startEdit(t)}><Icon name="edit" />Edit</button>
                            <button className="btn danger sm" onClick={() => remove(t)} disabled={t.status === 'BUSY'}
                              title={t.status === 'BUSY' ? 'A busy team cannot be deleted' : undefined}><Icon name="trash" />Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DataState>
        </section>
      </div>
    </>
  );
}
