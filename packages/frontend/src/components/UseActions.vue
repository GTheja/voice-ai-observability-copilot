<script setup>
defineProps({ items: Array });
defineEmits(["resolve", "open"]);

function actionLabel(kind) {
  const labels = {
    human_review: "Needs human review",
    script_training: "Use for script training",
    prompt_fix: "Prompt fix needed",
  };
  return labels[kind] || "Needs review";
}

function friendlyReason(reason) {
  const match = String(reason || "").match(/KPI "([^"]+)" failed/i);
  if (match) {
    return `Missed success check: ${match[1]}. Review this call moment and update the agent if needed.`;
  }
  return reason;
}
</script>

<template>
  <div class="ua-list">
    <div v-for="u in items" :key="u.id" class="ua" :class="{ crit: u.severity === 'critical' }">
      <div class="ua-top">
        <span class="badge" :class="u.severity === 'critical' ? 'crit' : 'warn'">{{ actionLabel(u.kind) }}</span>
        <span class="muted" v-if="u.startSec != null">At {{ Math.round(u.startSec) }}s in call</span>
      </div>
      <div class="reason">
        {{ friendlyReason(u.reason) }}
      </div>
      <div v-if="u.excerpt" class="excerpt">“{{ u.excerpt }}”</div>
      <div class="row">
        <span>
          <button v-if="u.callId" class="btn" @click="$emit('open', u.callId)">Open transcript</button>
          <button class="btn primary" @click="$emit('resolve', u.id)">Mark reviewed</button>
        </span>
      </div>
    </div>
    <div v-if="!items.length" class="empty-state">No human follow-ups. This agent is clear.</div>
  </div>
</template>
