import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

process.env.TZ = "UTC";

export default defineConfig({
    plugins: [react()],
    test: {
        environment: "jsdom",
        include: ["src/__tests__/**/*.test.jsx", "src/__tests__/**/*.test.js"],
        testTimeout: 15000,
        // bun run test merges this report into output/junit.xml.
        reporters: ["default", "junit"],
        outputFile: { junit: "../.cache/junit/frontend.xml" },
    },
});
