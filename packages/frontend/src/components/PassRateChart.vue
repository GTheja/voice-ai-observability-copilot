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

const props = defineProps({ summary: Array });

const data = computed(() => ({
  labels: props.summary.map((a) => a.name),
  datasets: [
    {
      label: "Pass rate %",
      backgroundColor: props.summary.map((a) =>
        (a.passRate ?? 0) >= 0.8 ? "#1f9d66" : (a.passRate ?? 0) >= 0.7 ? "#2f6df6" : (a.passRate ?? 0) >= 0.5 ? "#c98117" : "#d94a3f",
      ),
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
