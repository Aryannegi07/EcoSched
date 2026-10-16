export const CATEGORIES = [
  ['LAPTOP', 'Laptop'],
  ['MOBILE', 'Mobile'],
  ['TABLET', 'Tablet'],
  ['BATTERY', 'Battery'],
  ['TV_MONITOR', 'TV / Monitor'],
  ['APPLIANCE', 'Appliance'],
  ['ACCESSORY', 'Accessory'],
  ['OTHER', 'Other'],
];

export const CONDITIONS = [
  ['WORKING', 'Working'],
  ['DAMAGED', 'Damaged'],
  ['NON_WORKING', 'Non-working'],
];

export const OPEN_STATUSES = ['PENDING', 'ASSIGNED', 'IN_PROGRESS'];
export const isOpen = (status) => OPEN_STATUSES.includes(status);

export const STATUS_LABEL = {
  PENDING: 'Pending',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  AVAILABLE: 'Available',
  BUSY: 'Busy',
};

export const PRIORITY_PRESETS = [
  ['Low', 3],
  ['Medium', 5],
  ['Urgent', 8],
];

export const label = (pairs, value) => pairs.find(([v]) => v === value)?.[1] || value;

export const formatDate = (iso) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export const priorityLabel = (p) => (p >= 8 ? 'Urgent' : p >= 5 ? 'Medium' : 'Low');
export const priorityLevel = (p) => priorityLabel(p).toLowerCase();

export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
