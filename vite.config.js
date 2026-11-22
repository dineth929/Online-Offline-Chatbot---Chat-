import { defineConfig } from "vite";

export default defineConfig({
    build: {
        outDir: "static/build",
        emptyOutDir: true,
        rollupOptions: {
            input: "static/js/firebase-ai.js",
            output: {
                entryFileNames: "firebase-ai.js"
            }
        }
    }
});