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

export const label = (pairs, value) => pairs.find(([v]) => v === value)?.[1] || value;

export const formatDate = (iso) => (iso ? new Date(iso).toLocaleString() : '-');

export const priorityLabel = (p) => (p >= 8 ? 'Urgent' : p >= 5 ? 'Medium' : 'Low');
