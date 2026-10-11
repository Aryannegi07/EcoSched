export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status, fieldErrors = {}) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(`Cannot reach the backend at ${API_BASE}. Is Spring Boot running?`, 0);
  }
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }
  if (!res.ok) {
    throw new ApiError(data?.message || `Request failed (HTTP ${res.status})`, res.status, data?.field_errors || {});
  }
  return data;
}

export const api = {
  users: {
    list: () => request('GET', '/users'),
    get: (id) => request('GET', `/users/${id}`),
    create: (body) => request('POST', '/users', body),
  },
  ewaste: {
    list: () => request('GET', '/ewaste'),
    get: (id) => request('GET', `/ewaste/${id}`),
    create: (body) => request('POST', '/ewaste', body),
  },
  requests: {
    list: () => request('GET', '/requests'),
    get: (id) => request('GET', `/requests/${id}`),
    priorityQueue: () => request('GET', '/requests/priority'),
    create: (body) => request('POST', '/requests', body),
    forUser: (userId) => request('GET', `/requests/user/${userId}`),
    start: (id) => request('PUT', `/requests/${id}/start`),
    complete: (id) => request('PUT', `/requests/${id}/complete`),
    cancel: (id) => request('PUT', `/requests/${id}/cancel`),
  },
  admin: {
    stats: () => request('GET', '/admin/stats'),
  },
  scheduler: {
    run: () => request('POST', '/scheduler/run'),
    queue: () => request('GET', '/scheduler/queue'),
    status: () => request('GET', '/scheduler/status'),
  },
  teams: {
    list: () => request('GET', '/teams'),
    available: () => request('GET', '/teams/available'),
    create: (body) => request('POST', '/teams', body),
    update: (id, body) => request('PUT', `/teams/${id}`, body),
    remove: (id) => request('DELETE', `/teams/${id}`),
  },
};
