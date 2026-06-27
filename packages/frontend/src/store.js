import { defineStore } from "pinia";
import { api } from "./lib/api.js";

export const useStore = defineStore("copilot", {
  state: () => ({
    summary: [],
    selectedAgentId: null,
    detail: { kpis: [], calls: [], recommendations: [], useActions: [] },
    selectedCall: null,
    loading: false,
    error: null,
  }),
  getters: {
    selectedAgent: (s) => s.summary.find((a) => a.agentId === s.selectedAgentId) || null,
    totals: (s) => ({
      calls: s.summary.reduce((n, a) => n + (a.totalCalls || 0), 0),
      openUseActions: s.summary.reduce((n, a) => n + (a.openUseActions || 0), 0),
      avgPassRate:
        s.summary.length
          ? s.summary.reduce((n, a) => n + (a.passRate || 0), 0) / s.summary.length
          : 0,
    }),
  },
  actions: {
    async loadSummary() {
      this.loading = true;
      this.error = null;
      try {
        this.summary = await api.summary();
        if (!this.selectedAgentId && this.summary.length) {
          await this.selectAgent(this.summary[0].agentId);
        }
      } catch (e) {
        this.error = e.message;
      } finally {
        this.loading = false;
      }
    },
    async selectAgent(agentId) {
      this.selectedAgentId = agentId;
      this.selectedCall = null;
      const [kpis, calls, recommendations, useActions] = await Promise.all([
        api.kpis(agentId),
        api.calls(agentId),
        api.recommendations(agentId),
        api.useActions(agentId, false),
      ]);
      this.detail = { kpis, calls, recommendations, useActions };
    },
    async openCall(callId) {
      this.selectedCall = await api.call(callId);
    },
    async resolveUseAction(id) {
      await api.resolveUseAction(id);
      this.detail.useActions = this.detail.useActions.filter((u) => u.id !== id);
      await this.loadSummary();
    },
    async runPoll() {
      await api.poll();
      await this.loadSummary();
      if (this.selectedAgentId) await this.selectAgent(this.selectedAgentId);
    },
  },
});
