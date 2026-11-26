/**
 * Browser-side helper for calling the app's API. Turns error responses into
 * ApiError with a user-readable message and optional per-field messages.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(path, {
      ...rest,
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError("We couldn't reach Documentary Studio. Check that the app is still running and try again.", "network", 0);
  }

  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string; code?: string; fields?: Record<string, string> } }
    | null;
  if (!response.ok) {
    throw new ApiError(
      body?.error?.message ?? "Something went wrong. Please try again.",
      body?.error?.code ?? "unknown",
      response.status,
      body?.error?.fields ?? {},
    );
  }
  return body as T;
}
