
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { api, ApiError } from '../api.js';

const Ctx = createContext(null);

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const refreshUsers = useCallback(async () => {
    try {
      const currentUser = await api.auth.me();
      setUser(currentUser);
    } catch (error) {
      // A 401 is expected when the visitor is logged out.
      if (!(error instanceof ApiError && error.status === 401)) {
        console.error('Unable to load current user:', error);
      }

      setUser(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refreshUsers();
  }, [refreshUsers]);

  const login = useCallback(async (body) => {
    const loggedInUser = await api.auth.login(body);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      userId: user?.user_id || '',
      users: user ? [user] : [],
      loaded,
      error: '',
      setUserId: () => {},
      refreshUsers,
      login,
      logout,
    }),
    [user, loaded, refreshUsers, login, logout]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useUsers = () => useContext(Ctx);
