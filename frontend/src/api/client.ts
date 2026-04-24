const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").trim();

/**
 * Build a full API URL from a path like "/api/moi/compute".
 * In local dev (no VITE_API_BASE_URL), returns the path as-is so the
 * Vite dev-server proxy handles it.  In production, prepends the
 * configured Cloud Run base URL.
 */
export function apiUrl(path: string): string {
  if (!API_BASE_URL) return path;
  const base = API_BASE_URL.replace(/\/+$/, "");
  const segment = path.startsWith("/") ? path : `/${path}`;
  return `${base}${segment}`;
}

export class ApiError extends Error {
  override readonly name = "ApiError";

  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string,
    public readonly url: string,
  ) {
    super(
      `API request failed: ${status} ${statusText}\n` +
        `URL: ${url}\n` +
        `Response: ${body}`,
    );
  }
}

/**
 * Thin wrapper around fetch that:
 *  - prepends the API base URL
 *  - throws an ApiError with diagnostics on non-2xx responses
 */
export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = apiUrl(path);
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new Error(
      `Network error reaching ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "(could not read response body)");
    throw new ApiError(res.status, res.statusText, body, url);
  }
  return res;
}
