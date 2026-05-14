const TOKEN_KEY = 'tourai_token';
const USER_KEY = 'tourai_user';

function isBrowser() {
  return typeof window !== 'undefined';
}

export function getToken() {
  if (!isBrowser()) return '';
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function getUser() {
  if (!isBrowser()) return null;
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveSession(payload) {
  if (!isBrowser()) return;
  localStorage.setItem(TOKEN_KEY, payload.accessToken);
  localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
  window.dispatchEvent(new Event('tourai-session-changed'));
}

export function updateStoredUser(partial) {
  if (!isBrowser()) return;
  const current = getUser() || {};
  localStorage.setItem(USER_KEY, JSON.stringify({ ...current, ...partial }));
  window.dispatchEvent(new Event('tourai-session-changed'));
}

export function clearSession() {
  if (!isBrowser()) return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event('tourai-session-changed'));
}
