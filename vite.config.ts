import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: {
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      input: {main: "index.html", workshop: "workshop.html"},
      output: {
        manualChunks: (id) =>
          id.includes("three-mesh-bvh")
            ? "terrain"
            : id.includes("/three/")
              ? "three"
              : undefined,
      },
    },
  },
});
