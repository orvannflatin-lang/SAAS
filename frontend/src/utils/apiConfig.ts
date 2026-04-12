// Centralized API Configuration
const rawUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
// Ensure protocol and remove trailing slash
export const API_BASE_URL = (rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`).replace(/\/$/, '');
export const API_URL = `${API_BASE_URL}/api`;
export const SOCKET_URL = API_BASE_URL;
