<script setup>
defineProps({ agents: Array, selected: String });
defineEmits(["select"]);
function tone(rate) {
  if (rate == null) return "warn";
  if (rate >= 0.8) return "ok";
  if (rate >= 0.5) return "warn";
  return "bad";
}
function pct(n) {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}
function width(n) {
  return `${Math.max(0, Math.min(100, Math.round((n || 0) * 100)))}%`;
}
</script>

<template>
  <div class="agent-list">
    <div
      v-for="a in agents"
      :key="a.agentId"
      class="agent-item"
      :class="{ active: a.agentId === selected }"
      @click="$emit('select', a.agentId)"
    >
      <div class="agent-head">
        <div>
          <div class="name">{{ a.name }}</div>
          <div class="muted">{{ a.totalCalls }} analyzed calls</div>
        </div>
        <span class="health-dot" :class="tone(a.passRate)"></span>
      </div>
      <div class="meta">
        <span class="badge" :class="tone(a.passRate)">{{ pct(a.passRate) }} pass</span>
        <span v-if="a.openUseActions" class="badge bad">{{ a.openUseActions }} flags</span>
        <span v-else class="badge ok">clear</span>
      </div>
      <div class="mini-bar">
        <span :class="tone(a.passRate)" :style="{ width: width(a.passRate) }"></span>
      </div>
    </div>
    <div v-if="!agents.length" class="empty-state">No agents.</div>
  </div>
</template>
