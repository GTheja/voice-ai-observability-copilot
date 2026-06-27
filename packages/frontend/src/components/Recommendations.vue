<script setup>
defineProps({ items: Array });
function sevClass(s) {
  return s === "critical" ? "crit" : s === "high" ? "bad" : s === "medium" ? "warn" : "ok";
}
</script>

<template>
  <div class="rec-list">
    <div v-for="(r, i) in items" :key="r.id || i" class="rec">
      <div class="title">
        <span class="badge" :class="sevClass(r.severity)">{{ r.severity }}</span>
        {{ r.title }}
      </div>
      <div class="body">{{ r.body }}</div>
      <div class="rec-target" v-if="r.kpiKey">Targets KPI: {{ r.kpiKey }}</div>
    </div>
    <div v-if="!items.length" class="empty-state">No recommendations. Agent is on target.</div>
  </div>
</template>
