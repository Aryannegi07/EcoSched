import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatDate, isOpen } from '../constants.js';
import { useConfirm, useToast } from '../context/Feedback.jsx';
import useFetch from '../hooks/useFetch.js';
import DataState from '../components/DataState.jsx';
import Empty from '../components/Empty.jsx';
import Icon from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';
import PriorityGauge from '../components/PriorityGauge.jsx';
import RequireUser from '../components/RequireUser.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const FILTERS = [
  ['all', 'All', () => true],
  ['open', 'Open', (r) => isOpen(r.status)],
  ['done', 'Completed', (r) => r.status === 'COMPLETED'],
  ['cancelled', 'Cancelled', (r) => r.status === 'CANCELLED'],
];

function List({ user }) {
  const data = useFetch(() => Promise.all([api.requests.forUser(user.user_id), api.ewaste.list(), api.teams.list()]), [user.user_id]);
  const [filter, setFilter] = useState('all');
  const confirm = useConfirm();
  const toast = useToast();
  const [requests, items, teams] = data.data || [[], [], []];

  const itemName = (id) => items.find((i) => i.item_id === id)?.item_name || `Item #${id}`;
  const teamName = (id) => teams.find((t) => t.team_id === id)?.team_name;
  const test = FILTERS.find(([k]) => k === filter)[2];
  const shown = [...requests].sort((a, b) => b.request_id - a.request_id).filter(test);

  async function cancel(r) {
    const ok = await confirm({
      title: `Cancel request #${r.request_id}?`,
      body: `The pickup for ${itemName(r.item_id)} will be cancelled. You can request it again later.`,
      confirmLabel: 'Cancel request', cancelLabel: 'Keep request',
    });
    if (!ok) return;
    try {
      await api.requests.cancel(r.request_id);
      toast.success(`Request #${r.request_id} cancelled`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      data.reload();
    }
  }

  return (
    <div className="panel">
      <DataState loading={data.loading && !data.data} error={data.error} onRetry={data.reload} rows={4}>
        {requests.length === 0 ? (
          <Empty action={<Link className="btn" to="/request"><Icon name="plus" />Request a pickup</Link>}>
            You have not requested a pickup yet.
          </Empty>
        ) : (
          <>
            <div className="chips" role="radiogroup" aria-label="Filter requests" style={{ marginBottom: 12 }}>
              {FILTERS.map(([k, text, fn]) => (
                <label key={k} className="chip">
                  <input type="radio" name="filter" checked={filter === k} onChange={() => setFilter(k)} />
                  <span>{text} ({requests.filter(fn).length})</span>
                </label>
              ))}
            </div>
            {shown.length === 0 ? <Empty>No requests match this filter.</Empty> : (
              <ul className="rows">
                {shown.map((r) => (
                  <li key={r.request_id} className="item-row">
                    <div className="item-main">
                      <span className="item-title">{itemName(r.item_id)} <StatusBadge status={r.status} /></span>
                      <span className="item-meta">
                        <span>Request #{r.request_id}</span>
                        <PriorityGauge value={r.priority} />
                        <span><Icon name="clock" />{formatDate(r.request_time)}</span>
                        <span><Icon name="truck" />{teamName(r.team_id) || 'No team yet'}</span>
                      </span>
                    </div>
                    <div className="row-actions">
                      <Link className="btn quiet sm" to={`/status/${r.request_id}`}>Track</Link>
                      {(r.status === 'PENDING' || r.status === 'ASSIGNED') && (
                        <button className="btn danger sm" onClick={() => cancel(r)}>Cancel</button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </DataState>
    </div>
  );
}

export default function RequestHistory() {
  return (
    <>
      <PageHeader title="My requests" lead="Every pickup you have asked for, with its current status.">
        <Link className="btn" to="/request"><Icon name="plus" />New request</Link>
      </PageHeader>
      <RequireUser reason="see their requests">{(user) => <List key={user.user_id} user={user} />}</RequireUser>
    </>
  );
}
