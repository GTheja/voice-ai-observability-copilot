<script setup>
defineProps({ items: Array });
defineEmits(["resolve", "open"]);
</script>

<template>
  <div class="ua-list">
    <div v-for="u in items" :key="u.id" class="ua" :class="{ crit: u.severity === 'critical' }">
      <div class="ua-top">
        <span class="badge" :class="u.severity === 'critical' ? 'crit' : 'warn'">{{ u.kind }}</span>
        <span class="muted" v-if="u.startSec != null">@ {{ Math.round(u.startSec) }}s</span>
      </div>
      <div class="reason">
        {{ u.reason }}
      </div>
      <div v-if="u.excerpt" class="excerpt">“{{ u.excerpt }}”</div>
      <div class="row">
        <span>
          <button v-if="u.callId" class="btn" @click="$emit('open', u.callId)">View call</button>
          <button class="btn primary" @click="$emit('resolve', u.id)">Resolve</button>
        </span>
      </div>
    </div>
    <div v-if="!items.length" class="empty-state">No open use-actions.</div>
  </div>
</template>
