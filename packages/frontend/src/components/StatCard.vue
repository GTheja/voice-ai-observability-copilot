<script setup>
defineProps({ label: String, value: [String, Number], tone: { type: String, default: "" } });
</script>

<template>
  <div class="stat" :class="tone ? `tone-${tone}` : ''">
    <div class="k">{{ label }}</div>
    <div class="v">{{ value }}</div>
  </div>
</template>
