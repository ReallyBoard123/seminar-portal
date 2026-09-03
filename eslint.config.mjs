// Next 16 removed `next lint`; same ruleset via the ESLint CLI's flat config.
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: [".next/", "out/", "node_modules/", "next-env.d.ts"] },
  {
    rules: {
      // Our three views fetch-on-mount via an async refresh(); state lands in a
      // microtask, not synchronously. Keep the signal without failing the build.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default config;
