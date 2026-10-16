
export const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8081/api'
).replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, status, fieldErrors = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

async function request(method, path, body) {
  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body
        ? body instanceof FormData
          ? undefined
          : { 'Content-Type': 'application/json' }
        : undefined,
      body: body
        ? body instanceof FormData
          ? body
          : JSON.stringify(body)
        : undefined,
      credentials: 'include',
    });
  } catch {
    throw new ApiError(
      `Cannot reach the backend at ${API_BASE}. Is Spring Boot running?`,
      0
    );
  }

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      data?.message || `Request failed (HTTP ${response.status})`,
      response.status,
      data?.field_errors || {}
    );
  }

  return data;
}

export const api = {
  auth: {
    register: (body) => request('POST', '/auth/register', body),
    login: (body) => request('POST', '/auth/login', body),
    me: () => request('GET', '/auth/me'),
    logout: () => request('POST', '/auth/logout'),
  },

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
