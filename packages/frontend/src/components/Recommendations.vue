<script setup>
defineProps({ items: Array });
function sevClass(s) {
  return s === "critical" ? "crit" : s === "high" ? "bad" : s === "medium" ? "warn" : "ok";
}
function severityLabel(s) {
  const labels = {
    critical: "Critical",
    high: "High priority",
    medium: "Medium priority",
    low: "Low priority",
  };
  return labels[s] || "Recommendation";
}
function readableKey(key) {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
</script>

<template>
  <div class="rec-list">
    <div v-for="(r, i) in items" :key="r.id || i" class="rec">
      <div class="title">
        <span class="badge" :class="sevClass(r.severity)">{{ severityLabel(r.severity) }}</span>
        {{ r.title }}
      </div>
      <div class="body">{{ r.body }}</div>
      <div class="rec-target" v-if="r.kpiKey">Improves success check: {{ readableKey(r.kpiKey) }}</div>
    </div>
    <div v-if="!items.length" class="empty-state">No fixes needed. Agent is meeting its goals.</div>
  </div>
</template>
