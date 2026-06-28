<script setup>
defineProps({ kpis: Array });
function sevClass(s) {
  return s === "critical" ? "crit" : s === "high" ? "bad" : s === "medium" ? "warn" : "ok";
}
function typeLabel(type) {
  const labels = {
    keyword_presence: "Must include in call",
    keyword_absence: "Must avoid in call",
    numeric_threshold: "Must meet target",
    boolean: "Pass/fail rule",
    llm_rubric: "AI quality judgment",
  };
  return labels[type] || "Success rule";
}
function severityLabel(s) {
  const labels = {
    critical: "Critical",
    high: "High impact",
    medium: "Medium impact",
    low: "Low impact",
  };
  return labels[s] || "Tracked";
}
</script>

<template>
  <div>
    <div v-for="k in kpis" :key="k.key || k.id" class="kpi">
      <div>
        <strong>{{ k.label }}</strong>
        <div class="muted">{{ typeLabel(k.type) }}</div>
      </div>
      <span class="badge" :class="sevClass(k.severity)">{{ severityLabel(k.severity) }}</span>
    </div>
    <div v-if="!kpis.length" class="empty-state">No success criteria configured yet.</div>
  </div>
</template>
