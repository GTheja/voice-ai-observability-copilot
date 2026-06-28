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

function outcomeLabel(outcome) {
  const labels = {
    booked: "Booked",
    no_booking: "No booking",
    escalated: "Escalated",
    failed: "Failed",
  };
  return labels[outcome] || "Outcome pending";
}
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand-block">
        <div class="brand-mark">AI</div>
        <div>
          <h1>Voice AI Performance Monitor</h1>
          <div class="sub">Transcripts checked, issues found, fixes suggested</div>
        </div>
      </div>
      <button class="btn primary" @click="store.runPoll()">
        <span class="btn-icon">↻</span>
        Ingest transcripts
      </button>
    </header>

    <div class="layout">
      <aside class="panel side-panel">
        <div class="hd">
          <span>Voice AI agents</span>
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
            <div class="eyebrow">Validation flywheel</div>
            <h2>Monitor calls, find missed goals, recommend agent improvements.</h2>
          </div>
          <div class="summary-pills">
            <span class="badge ok">Webhook ingestion ready</span>
            <span class="badge warn">Demo data mode</span>
          </div>
        </section>

        <section class="flow-strip" aria-label="Observability workflow">
          <div class="flow-step">
            <span class="step-num">1</span>
            <div>
              <strong>Monitor transcripts</strong>
              <span>Ingest Voice AI calls and check each agent against its script goals.</span>
            </div>
          </div>
          <div class="flow-step">
            <span class="step-num">2</span>
            <div>
              <strong>Find performance issues</strong>
              <span>Highlight failed KPIs, missed opportunities, and risky call moments.</span>
            </div>
          </div>
          <div class="flow-step">
            <span class="step-num">3</span>
            <div>
              <strong>Improve the agent</strong>
              <span>Create human review tasks and prompt/script recommendations.</span>
            </div>
          </div>
        </section>

        <div class="stat-row">
          <StatCard
            label="Selected agent transcripts"
            :value="store.selectedAgent?.totalCalls ?? store.totals.calls"
          />
          <StatCard
            label="Selected agent goals passed"
            :value="pct(store.selectedAgent?.passRate ?? store.totals.avgPassRate)"
          />
          <StatCard
            label="Selected agent follow-ups"
            :value="store.selectedAgent?.openUseActions ?? store.totals.openUseActions"
            :tone="(store.selectedAgent?.openUseActions ?? store.totals.openUseActions) ? 'bad' : 'ok'"
          />
        </div>

        <div v-if="store.error" class="panel"><div class="bd badge bad">{{ store.error }}</div></div>

        <template v-if="store.selectedAgent">
          <div class="panel focus-panel">
            <div class="hd">
              <div>
                <span>Now analyzing: {{ store.selectedAgent.name }}</span>
                <div class="muted">
                  {{ pct(store.selectedAgent.passRate) }} of script goals passed · quality score {{ store.selectedAgent.avgScore ?? "—" }}
                </div>
              </div>
              <span class="badge" :class="store.selectedAgent.passRate >= 0.7 ? 'ok' : 'warn'">
                {{ store.selectedAgent.totalCalls }} transcripts
              </span>
            </div>
            <div class="bd"><PassRateChart :summary="store.summary" :selected="store.selectedAgentId" /></div>
          </div>

          <div class="grid2">
            <div class="panel">
              <div class="hd">
                <span>Human follow-up needed</span>
                <span class="muted">Use Actions from failed transcript checks</span>
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
                <span>Suggested agent improvements</span>
                <span class="muted">Prompt and script recommendations</span>
              </div>
              <div class="bd"><Recommendations :items="store.detail.recommendations" /></div>
            </div>
          </div>

          <div class="grid2 lower-grid">
            <div class="panel">
              <div class="hd">
                <span>Agent success criteria</span>
                <span class="muted">Observability parameters / KPIs</span>
              </div>
              <div class="bd"><KpiList :kpis="store.detail.kpis" /></div>
            </div>

            <div class="panel">
              <div class="hd">
                <span>Analyzed call transcripts</span>
                <span class="muted">Click any call to inspect the conversation</span>
              </div>
              <div class="bd">
                <div
                  v-for="(c, index) in store.detail.calls"
                  :key="c.id"
                  class="call-item"
                  @click="store.openCall(c.id)"
                >
                  <div class="name">Transcript {{ index + 1 }}</div>
                  <div class="meta">
                    <span class="badge ok">Analyzed</span>
                    <span>{{ outcomeLabel(c.outcome) }}</span>
                    <span>{{ c.durationSec ? c.durationSec + "s" : "" }}</span>
                  </div>
                </div>
                <div v-if="!store.detail.calls.length" class="empty-state">No transcripts yet. Ingest transcripts to start monitoring.</div>
              </div>
            </div>
          </div>
        </template>

        <div v-else-if="!store.loading" class="panel"><div class="bd empty-state">No Voice AI agents found for this location.</div></div>
      </main>
    </div>

    <CallDrawer v-if="store.selectedCall" :data="store.selectedCall" @close="store.selectedCall = null" />
  </div>
</template>
