import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const KEY = 'ecosched_user_id';
const Ctx = createContext(null);

const read = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
const write = (v) => { try { localStorage.setItem(KEY, v); } catch { /* storage unavailable */ } };

/**
 * One shared list of users and the "acting as" user for the whole app.
 * The choice is remembered in localStorage, so the sidebar, the forms and the
 * request pages always agree on who is using the app.
 */
export function UserProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [userId, setUserIdState] = useState(read);

  const refreshUsers = useCallback(async () => {
    try {
      setUsers(await api.users.list());
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { refreshUsers(); }, [refreshUsers]);

  const setUserId = useCallback((id) => {
    const v = id ? String(id) : '';
    setUserIdState(v);
    write(v);
  }, []);

  // forget a remembered user that no longer exists (for example after the database was reset)
  useEffect(() => {
    if (loaded && !error && userId && !users.some((u) => String(u.user_id) === userId)) setUserId('');
  }, [loaded, error, users, userId, setUserId]);

  const user = users.find((u) => String(u.user_id) === userId) || null;
  const value = useMemo(
    () => ({ users, user, userId, setUserId, refreshUsers, loaded, error }),
    [users, user, userId, setUserId, refreshUsers, loaded, error],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useUsers = () => useContext(Ctx);
