<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 });
const paths: Record<string, string> = {
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  upload: 'M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4',
  download: 'M12 4v12m-5-5 5 5 5-5M4 17v3h16v-3',
  shield: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Zm-4 9 3 3 5-6',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5V10Zm7 5v2',
  clock: 'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  file: 'M14 2H4v20h16V8l-6-6Zm0 0v6h6M8 13h8m-8 4h5',
  close: 'm6 6 12 12M6 18 18 6',
  check: 'm5 12 4 4L19 6',
  copy: 'M9 9h12v12H9V9ZM5 15H3V3h12v2',
  plus: 'M12 5v14M5 12h14',
  link: 'm10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',
};
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.file" /></svg>
</template>
