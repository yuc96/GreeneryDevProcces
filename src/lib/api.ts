/** Same-origin API (Next Route Handlers under `/api`). */
function apiBase(): string {
  return "/api";
}

async function errorMessageFromResponse(res: Response): Promise<string> {
  const text = await res.text();
  if (!text.trim()) return res.statusText;
  try {
    const j = JSON.parse(text) as { message?: unknown };
    if (typeof j.message === "string" && j.message.trim()) {
      return j.message.trim();
    }
  } catch {
    /* not JSON */
  }
  return text;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(await errorMessageFromResponse(res));
  }
  return res.json() as Promise<T>;
}

export async function apiJson<T>(
  path: string,
  init: RequestInit & { method: string },
): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(await errorMessageFromResponse(res));
  }
  return res.json() as Promise<T>;
}
