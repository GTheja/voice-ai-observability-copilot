// Thin API client. Reads context injected by main.js (works embedded in GHL or standalone).
const ctx = () => window.__COPILOT__ || { locationId: "loc_demo_001", token: "dev-local-token", apiBase: "" };

async function req(path, opts = {}) {
  const { token, apiBase } = ctx();
  const res = await fetch(`${apiBase}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  locationId: () => ctx().locationId,
  summary: () => req(`/api/metrics/summary?locationId=${ctx().locationId}`),
  agents: () => req(`/api/agents?locationId=${ctx().locationId}`),
  kpis: (agentId) => req(`/api/agents/${agentId}/kpis`),
  calls: (agentId) => req(`/api/agents/${agentId}/calls?locationId=${ctx().locationId}`),
  call: (callId) => req(`/api/calls/${callId}`),
  recommendations: (agentId) => req(`/api/agents/${agentId}/recommendations`),
  useActions: (agentId, resolved) =>
    req(`/api/agents/${agentId}/use-actions${resolved === undefined ? "" : `?resolved=${resolved}`}`),
  resolveUseAction: (id) => req(`/api/use-actions/${id}/resolve`, { method: "POST" }),
  poll: () =>
    req(`/api/poll`, { method: "POST", body: JSON.stringify({ locationId: ctx().locationId }) }),
};
