/**
 * Helper to ensure Hono RPC calls throw on non-2xx status codes
 * while preserving the inferred JSON types.
 */
export async function ensureSuccess<T>(response: Promise<T> | T) {
    const res = await response;

    // Check if it's a Honojs ClientResponse (which has .ok and .json)
    if (res instanceof Response || (typeof res === 'object' && res !== null && 'ok' in res)) {
        const r = res as Response;

        if (!r.ok) {
            // Try to get error message from body, fallback to statusText
            const errorBody = await r.json().catch(() => ({}));
            const message = errorBody.message || errorBody.error || `Error ${r.status}: ${r.statusText}`;
            throw new Error(message);
        }

        return await r.json() as Promise<T extends { json: () => Promise<infer U> } ? U : never>;
    }

    return res;
}
