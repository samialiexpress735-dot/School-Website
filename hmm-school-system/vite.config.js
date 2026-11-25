import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { existsSync, renameSync } from "node:fs";

// Two separate websites are built from this one project, and neither links to the other:
//   npm run build          the administration system (staff). Output: dist  (index.html)
//   npm run build:public   the public website.               Output: dist  (index.html, made from public.html)
// Each build contains only its own code. On Vercel make two projects from the same repository,
// one with each build command, and give them different addresses.
// base "./" lets the built site work from any folder on any host.
export default defineConfig(({ mode }) => {
  const isPublic = mode === "public";
  return {
    base: "./",
    plugins: [
      react(),
      {
        name: "public-entry-as-index",
        apply: "build",
        closeBundle() {
          if (!isPublic) return;
          const from = resolve(__dirname, "dist/public.html");
          if (existsSync(from)) renameSync(from, resolve(__dirname, "dist/index.html"));
        },
      },
    ],
    build: {
      rollupOptions: { input: resolve(__dirname, isPublic ? "public.html" : "index.html") },
    },
  };
});
