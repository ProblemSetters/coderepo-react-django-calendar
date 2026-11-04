import { createRequire } from "node:module";
import { dirname } from "node:path";
import { realpathSync } from "node:fs";
const require = createRequire(import.meta.url);
const load = (name) => require(require.resolve(name, { paths: [process.cwd(), process.cwd()+"/frontend", process.cwd()+"/backend", dirname(realpathSync(process.argv[1]))] }));
const js = load("@eslint/js");
const globals = load("globals");
const react = load("eslint-plugin-react");

export default [
    {
        files: ["**/*.{js,jsx,mjs,cjs}"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            parserOptions: { ecmaFeatures: { jsx: true } },
            globals: { ...globals.node, Bun: "readonly" },
        },
        linterOptions: { noInlineConfig: true },
        plugins: { react },
        rules: {
            ...js.configs.recommended.rules,
            "no-unused-vars": ["error", { args: "none", caughtErrors: "none", ignoreRestSiblings: true }],
            "react/jsx-uses-vars": "error",
            "react/jsx-key": "error",
            "react/jsx-no-duplicate-props": "error",
        },
    },
    {
        files: ["frontend/**/*.{js,jsx,mjs}"],
        languageOptions: { globals: globals.browser },
    },
    {
        files: ["**/*.cjs"],
        languageOptions: { sourceType: "commonjs" },
    },
];
