import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatDate, isOpen } from '../constants.js';
import { useUsers } from '../context/UserContext.jsx';
import useFetch from '../hooks/useFetch.js';
import DataState from '../components/DataState.jsx';
import Icon from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const WAITING_TEXT = {
  PENDING: 'Waiting for a team. The scheduler assigns the most urgent requests first.',
  ASSIGNED: 'A team has been assigned and will start the pickup soon.',
  IN_PROGRESS: 'The team is on the way to collect your item.',
};

export default function Home() {
  const { users, user, setUserId, loaded } = useUsers();
  const data = useFetch(() => Promise.all([api.ewaste.list(), api.requests.list(), api.admin.stats()]));
  const [items, requests, stats] = data.data || [[], [], null];

  const myItems = user ? items.filter((i) => i.user_id === user.user_id) : [];
  const myRequests = user ? requests.filter((r) => r.user_id === user.user_id).sort((a, b) => b.request_id - a.request_id) : [];
  const openRequests = myRequests.filter((r) => isOpen(r.status));
  const busyItemIds = new Set(openRequests.map((r) => r.item_id));
  const freeItems = myItems.filter((i) => !busyItemIds.has(i.item_id));
  const itemName = (id) => items.find((i) => i.item_id === id)?.item_name || `Item #${id}`;

  // The single most useful thing to do next, worked out from what the user has already done.
  let next;
  if (!user) {
    next = users.length === 0
      ? { title: 'Create your account', text: 'Register once, then add your old electronics and request a pickup.', to: '/register', cta: 'Create account' }
      : { title: 'Who is using EcoSched?', text: 'Choose your name to continue, or create a new account.', picker: true };
  } else if (myItems.length === 0) {
    next = { title: 'Add your first e-waste item', text: 'Tell us what you want collected: a laptop, a phone, a battery.', to: '/ewaste', cta: 'Add e-waste' };
  } else if (freeItems.length > 0) {
    next = {
      title: 'Request a pickup',
      text: `${freeItems.length} of your items ${freeItems.length === 1 ? 'has' : 'have'} no pickup request yet.`,
      to: `/request?item=${freeItems[0].item_id}`, cta: 'Request pickup',
    };
  } else if (openRequests.length > 0) {
    const r = openRequests[0];
    next = { title: `Pickup for ${itemName(r.item_id)}`, text: WAITING_TEXT[r.status], to: `/status/${r.request_id}`, cta: 'Track this request', badge: r.status };
  } else {
    next = { title: 'Everything is collected', text: 'Thank you for recycling. Add more e-waste whenever you have it.', to: '/ewaste', cta: 'Add more e-waste' };
  }

  const steps = [
    ['Create an account', 'Pick who you are in the menu', !!user],
    ['Add e-waste', 'Name, type, weight and condition', myItems.length > 0],
    ['Request a pickup', 'Choose the item, place and priority', myRequests.length > 0],
    ['Item collected', 'A team is assigned by priority', myRequests.some((r) => r.status === 'COMPLETED')],
  ];
  const currentStep = steps.findIndex(([, , done]) => !done);

  return (
    <>
      <PageHeader
        title={user ? `Hello, ${user.full_name.split(' ')[0]}` : 'Schedule an e-waste pickup'}
        lead="Register old electronics, request a pickup, and a collection team is assigned by priority." />

      {data.error && (
        <DataState error={data.error} onRetry={data.reload} />
      )}

      <div className="split">
        <div>
          <section className="panel next" aria-labelledby="next-title">
            <h2 id="next-title">{next.title}</h2>
            {next.badge && <div><StatusBadge status={next.badge} /></div>}
            <p>{next.text}</p>
            {next.picker ? (
              <div className="btn-row">
                <select aria-label="Choose a user" value="" onChange={(e) => setUserId(e.target.value)}>
                  <option value="">Select a user...</option>
                  {users.map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name}</option>)}
                </select>
                <Link className="btn quiet" to="/register"><Icon name="plus" />New user</Link>
              </div>
            ) : (
              <div><Link className="btn lg" to={next.to}>{next.cta}<Icon name="arrow" /></Link></div>
            )}
          </section>

          {user && myRequests.length > 0 && (
            <section className="panel">
              <div className="panel-head">
                <h2>Your latest requests</h2>
                <Link to="/history">See all</Link>
              </div>
              <ul className="rows">
                {myRequests.slice(0, 3).map((r) => (
                  <li key={r.request_id} className="item-row">
                    <div className="item-main">
                      <span className="item-title">{itemName(r.item_id)} <StatusBadge status={r.status} /></span>
                      <span className="item-meta"><span><Icon name="clock" />{formatDate(r.request_time)}</span></span>
                    </div>
                    <Link className="btn quiet sm" to={`/status/${r.request_id}`}>Track</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div>
          <section className="panel">
            <h2 style={{ marginBottom: 16 }}>Your progress</h2>
            <ol className="journey">
              {steps.map(([title, text, done], i) => (
                <li key={title} className={done ? 'done' : i === currentStep ? 'current' : ''}>
                  <span className="node">{done && <Icon name="check" style={{ width: 14, height: 14 }} />}</span>
                  <div><b>{title}</b><span>{text}</span></div>
                </li>
              ))}
            </ol>
          </section>

          <section className="panel sunken">
            <div className="panel-head"><h2>Operations</h2></div>
            {stats ? (
              <p className="muted" style={{ marginBottom: 14 }}>
                {stats.pending_requests} pending {stats.pending_requests === 1 ? 'request' : 'requests'} &middot; {stats.available_teams} available / {stats.busy_teams} busy teams
              </p>
            ) : (
              <p className="muted" style={{ marginBottom: 14 }}>{loaded && data.loading ? 'Loading...' : 'Live counts appear when the backend is running.'}</p>
            )}
            <div className="btn-row">
              <Link className="btn quiet sm" to="/scheduler"><Icon name="cpu" />Open scheduler</Link>
              <Link className="btn quiet sm" to="/admin"><Icon name="grid" />Dashboard</Link>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
