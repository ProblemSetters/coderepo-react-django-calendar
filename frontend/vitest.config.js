import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

process.env.TZ = "UTC";

const junitFile = process.env.VITEST_JUNIT_FILE;

export default defineConfig({
    plugins: [react()],
    test: {
        environment: "jsdom",
        include: ["src/__tests__/**/*.test.jsx", "src/__tests__/**/*.test.js"],
        testTimeout: 15000,
        reporters: junitFile ? ["default", "junit"] : ["default"],
        outputFile: junitFile ? { junit: junitFile } : undefined,
    },
});
