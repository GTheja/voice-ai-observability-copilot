<script setup>
defineProps({ data: Object });
defineEmits(["close"]);
function sevClass(passed) {
  return passed === false ? "bad" : passed === true ? "ok" : "warn";
}
</script>

<template>
  <div class="drawer" @click.self="$emit('close')">
    <div class="sheet">
      <div style="display:flex; justify-content:space-between; align-items:center">
        <h3 style="margin:0">Call {{ data.call.externalCallId }}</h3>
        <button class="btn" @click="$emit('close')">✕</button>
      </div>

      <div v-if="data.analysis" class="panel" style="margin:14px 0">
        <div class="bd">
          <div>
            <span class="badge" :class="data.analysis.passed ? 'ok' : 'bad'">
              {{ data.analysis.passed ? "PASS" : "FAIL" }}
            </span>
            <strong style="margin-left:8px">Score {{ data.analysis.overallScore }}</strong>
            <span class="muted" v-if="data.analysis.llmUsed"> · AI-assisted</span>
          </div>
          <p class="body" v-if="data.analysis.summary">{{ data.analysis.summary }}</p>

          <div style="margin-top:10px">
            <div
              v-for="r in (data.analysis.kpiResults || data.analysis.kpi_results || [])"
              :key="r.key"
              class="kpi"
            >
              <span>{{ r.label }}</span>
              <span class="badge" :class="sevClass(r.passed)">
                {{ r.passed === null ? "n/a" : r.passed ? "pass" : "fail" }}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="muted">Analysis pending…</div>

      <h4>Transcript</h4>
      <div v-for="(t, i) in data.call.transcript.turns" :key="i" class="turn" :class="t.speaker">
        <div class="who">{{ t.speaker }}<span v-if="t.startSec != null"> · {{ Math.round(t.startSec) }}s</span></div>
        <div>{{ t.text }}</div>
      </div>
    </div>
  </div>
</template>
