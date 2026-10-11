import { useState } from 'react';

const KEY = 'ecosched_user_id';

function read() {
  try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
}

export default function useCurrentUser() {
  const [userId, setUserId] = useState(read);
  const save = (id) => {
    const value = id ? String(id) : '';
    setUserId(value);
    try { localStorage.setItem(KEY, value); } catch { /* storage unavailable */ }
  };
  return [userId, save];
}
