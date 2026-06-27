<script setup>
defineProps({ kpis: Array });
function sevClass(s) {
  return s === "critical" ? "crit" : s === "high" ? "bad" : s === "medium" ? "warn" : "ok";
}
</script>

<template>
  <div>
    <div v-for="k in kpis" :key="k.key || k.id" class="kpi">
      <div>
        <strong>{{ k.label }}</strong>
        <div class="muted">{{ k.type }}</div>
      </div>
      <span class="badge" :class="sevClass(k.severity)">{{ k.severity }}</span>
    </div>
    <div v-if="!kpis.length" class="muted">No KPIs configured.</div>
  </div>
</template>
