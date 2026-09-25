const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL?.trim() || '/api').replace(/\/$/, '');

export function apiUrl(path: string) {
  return `${apiBaseUrl}${path}`;
}

export async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { detail?: string } | null;
  return new Error(body?.detail || fallback);
}
