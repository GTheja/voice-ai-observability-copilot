<script setup>
import { computed } from "vue";
import { Bar } from "vue-chartjs";
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
} from "chart.js";

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const props = defineProps({ summary: Array, selected: String });

function toneColor(agent) {
  if (agent.agentId !== props.selected) return "#cbd5e1";
  const rate = agent.passRate ?? 0;
  if (rate >= 0.8) return "#1f9d66";
  if (rate >= 0.7) return "#2f6df6";
  if (rate >= 0.5) return "#c98117";
  return "#d94a3f";
}

const data = computed(() => ({
  labels: props.summary.map((a) => a.name),
  datasets: [
    {
      label: "Selected agent goal pass rate",
      backgroundColor: props.summary.map((a) => toneColor(a)),
      borderRadius: 7,
      maxBarThickness: 54,
      data: props.summary.map((a) => Math.round((a.passRate ?? 0) * 100)),
    },
  ],
}));

const options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: { label: (ctx) => `${ctx.raw}% pass rate` },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: "#657287", font: { size: 11, weight: "600" } },
    },
    y: {
      beginAtZero: true,
      max: 100,
      border: { display: false },
      grid: { color: "#edf1f6" },
      ticks: { color: "#657287", callback: (v) => v + "%" },
    },
  },
};
</script>

<template>
  <div class="chart-box"><Bar :data="data" :options="options" /></div>
</template>
