export function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('token') || '';
}

export function setToken(token) {
  localStorage.setItem('token', token);
}

export function clearToken() {
  localStorage.removeItem('token');
}
