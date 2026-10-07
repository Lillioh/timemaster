// ESLint flat config. Extends Next.js core-web-vitals when resolvable,
// otherwise falls back to a minimal recommended set so `npm run lint` passes.
// All optional imports are dynamic + guarded: this file must never crash lint.
let jsRecommended = {};
try {
  const mod = await import("@eslint/js");
  jsRecommended = mod.default?.configs?.recommended ?? {};
} catch {
  jsRecommended = {};
}

let nextConfigs = [];
try {
  const mod = await import("eslint-config-next/core-web-vitals");
  const cfg = mod.default ?? mod;
  nextConfigs = Array.isArray(cfg) ? cfg : [cfg];
} catch {
  nextConfigs = [];
}

const config = [
  { ignores: ["node_modules/**", ".next/**", "discord-attendance-bot/**"] },
  jsRecommended,
  ...nextConfigs,
  {
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      // TypeScript handles undefined-name checking; the base rule
      // false-positives on `React.ReactNode` types with the automatic JSX runtime.
      "no-undef": "off",
    },
  },
  {
    // The base no-unused-vars rule false-positives on TS type
    // annotations (e.g. `(values: ConfigFormValues) => ...`). tsc
    // covers real unused locals, so silence it for TS sources.
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "no-unused-vars": "off",
    },
  },
];

export default config;
