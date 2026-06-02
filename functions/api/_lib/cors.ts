// Shared CORS + JSON response helpers for all /api functions.
// The admin SPA is served from the same origin as these functions, so CORS is
// not strictly required, but we keep permissive headers for tooling/curl.

export function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
      ...extraHeaders,
    },
  })
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() })
}
