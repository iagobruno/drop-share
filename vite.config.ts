import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: "client",
  plugins: [vue(), tailwindcss()],
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
});
