// Centralized API Configuration
function normalizeBaseUrl(rawUrl: string): string {
  const withProtocol = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
  return withProtocol.replace(/\/$/, '').replace(/\/api$/, '');
}

const rawUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
export const API_BASE_URL = normalizeBaseUrl(rawUrl);
export const API_URL = `${API_BASE_URL}/api`;
export const SOCKET_URL = API_BASE_URL;
