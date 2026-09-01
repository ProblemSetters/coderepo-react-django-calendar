import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [react()],
    server: {
        host: "0.0.0.0",
        port: 3000,
        allowedHosts: [".internal", "localhost"],
        proxy: {
            "/api": { target: "http://localhost:8000", changeOrigin: true },
        },
    },
    build: { outDir: "dist", sourcemap: true },
    test: {
        globals: true,
        environment: "happy-dom",
        include: ["__tests__/**/*.behavior.test.{js,jsx}"],
        exclude: ["node_modules", "dist"],
        fileParallelism: false,
        pool: "forks",
        poolOptions: { forks: { singleFork: true } },
        testTimeout: 10000,
        hookTimeout: 10000,
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            exclude: ["node_modules/", "__tests__/", "**/*.config.*"],
        },
        reporters: ["verbose"],
    },
});
