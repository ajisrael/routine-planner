/**
 * Thin fetch wrapper around the REST API (ARCHITECTURE.md §5.4).
 * TODO: typed request/response helpers (json expects 2xx, auth-aware cookies,
 * optimistic-action call sites in the store).
 */
export async function apiGet<T>(path: string): Promise<T> {
  void path;
  throw new Error("api client not implemented yet");
}

export async function apiSend(method: "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<void> {
  void method;
  void path;
  void body;
  throw new Error("api client not implemented yet");
}