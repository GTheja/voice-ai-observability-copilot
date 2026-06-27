<script setup>
import { onMounted } from "vue";
import { useStore } from "./store.js";
import AgentList from "./components/AgentList.vue";
import StatCard from "./components/StatCard.vue";
import KpiList from "./components/KpiList.vue";
import UseActions from "./components/UseActions.vue";
import Recommendations from "./components/Recommendations.vue";
import PassRateChart from "./components/PassRateChart.vue";
import CallDrawer from "./components/CallDrawer.vue";

const store = useStore();
onMounted(() => store.loadSummary());

function pct(n) {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand-block">
        <div class="brand-mark">AI</div>
        <div>
        <h1>Voice AI Observability Copilot</h1>
          <div class="sub">Monitor and analyze Voice AI performance</div>
        </div>
      </div>
      <button class="btn primary" @click="store.runPoll()">
        <span class="btn-icon">↻</span>
        Sync transcripts
      </button>
    </header>

    <div class="layout">
      <aside class="panel side-panel">
        <div class="hd">
          <span>Agent Fleet</span>
          <span class="count-pill">{{ store.summary.length }}</span>
        </div>
        <div class="bd">
          <AgentList
            :agents="store.summary"
            :selected="store.selectedAgentId"
            @select="store.selectAgent($event)"
          />
        </div>
      </aside>

      <main class="workspace">
        <section class="overview-strip">
          <div>
            <div class="eyebrow">Validation Flywheel</div>
            <h2>Transcript quality control, ready for review.</h2>
          </div>
          <div class="summary-pills">
            <span class="badge ok">Webhook ready</span>
            <span class="badge warn">Mock LLM demo</span>
          </div>
        </section>

        <div class="stat-row">
          <StatCard label="Total calls analyzed" :value="store.totals.calls" />
          <StatCard label="Avg pass rate" :value="pct(store.totals.avgPassRate)" />
          <StatCard
            label="Open use-actions"
            :value="store.totals.openUseActions"
            :tone="store.totals.openUseActions ? 'bad' : 'ok'"
          />
        </div>

        <div v-if="store.error" class="panel"><div class="bd badge bad">{{ store.error }}</div></div>

        <template v-if="store.selectedAgent">
          <div class="panel focus-panel">
            <div class="hd">
              <div>
                <span>{{ store.selectedAgent.name }}</span>
                <div class="muted">Pass rate {{ pct(store.selectedAgent.passRate) }} · avg score {{ store.selectedAgent.avgScore ?? "—" }}</div>
              </div>
              <span class="badge" :class="store.selectedAgent.passRate >= 0.7 ? 'ok' : 'warn'">
                {{ store.selectedAgent.totalCalls }} calls
              </span>
            </div>
            <div class="bd"><PassRateChart :summary="store.summary" /></div>
          </div>

          <div class="grid2">
            <div class="panel">
              <div class="hd">
                <span>Use Actions</span>
                <span class="muted">Human review queue</span>
              </div>
              <div class="bd">
                <UseActions
                  :items="store.detail.useActions"
                  @resolve="store.resolveUseAction($event)"
                  @open="store.openCall($event)"
                />
              </div>
            </div>

            <div class="panel">
              <div class="hd">
                <span>Recommendations</span>
                <span class="muted">Prompt and script fixes</span>
              </div>
              <div class="bd"><Recommendations :items="store.detail.recommendations" /></div>
            </div>
          </div>

          <div class="grid2 lower-grid">
            <div class="panel">
              <div class="hd">Observability parameters (KPIs)</div>
              <div class="bd"><KpiList :kpis="store.detail.kpis" /></div>
            </div>

            <div class="panel">
              <div class="hd">Recent calls</div>
              <div class="bd">
                <div
                  v-for="c in store.detail.calls"
                  :key="c.id"
                  class="call-item"
                  @click="store.openCall(c.id)"
                >
                  <div class="name">{{ c.externalCallId }}</div>
                  <div class="meta">
                    <span class="badge ok">{{ c.status }}</span>
                    <span>{{ c.outcome || "No outcome" }}</span>
                    <span>{{ c.durationSec ? c.durationSec + "s" : "" }}</span>
                  </div>
                </div>
                <div v-if="!store.detail.calls.length" class="empty-state">No calls yet. Sync transcripts to start analysis.</div>
              </div>
            </div>
          </div>
        </template>

        <div v-else-if="!store.loading" class="panel"><div class="bd empty-state">No agents found for this location.</div></div>
      </main>
    </div>

    <CallDrawer v-if="store.selectedCall" :data="store.selectedCall" @close="store.selectedCall = null" />
  </div>
</template>
