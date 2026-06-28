// Thin API client. Reads context injected by main.js (works embedded in GHL or standalone).
const ctx = () => window.__COPILOT__ || { locationId: "loc_demo_001", token: "dev-local-token", apiBase: "" };

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

function demoTranscript() {
  const now = Date.now();
  return {
    provider: "ghl",
    locationId: ctx().locationId,
    agentId: "agent_booking_01",
    callId: `demo_manual_${now}`,
    startedAt: new Date(now).toISOString(),
    durationSec: 132,
    direction: "inbound",
    outcome: "no_booking",
    transcript: {
      turns: [
        { speaker: "agent", text: "Bright Smile Dental, this is Ava. How can I help?", startSec: 0 },
        { speaker: "customer", text: "Hi, I need to schedule a cleaning sometime this week.", startSec: 5 },
        { speaker: "agent", text: "Sure, we have Tuesday at 2pm available.", startSec: 10 },
        { speaker: "customer", text: "Tuesday does not work for me. Do you have anything else?", startSec: 17 },
        { speaker: "agent", text: "That is the only time I can see right now. Please call back later.", startSec: 23 },
      ],
    },
    metadata: { source: "demo-ingest-button" },
  };
}

export const api = {
  locationId: () => ctx().locationId,
  isDemo: () => ctx().locationId === "loc_demo_001" || ctx().token === "dev-local-token",
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
  ingestDemoTranscript: async () => {
    const result = await req(`/api/ingest`, { method: "POST", body: JSON.stringify(demoTranscript()) });
    await wait(350);
    return result;
  },
};
