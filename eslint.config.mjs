import coreWebVitals from "eslint-config-next/core-web-vitals";

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  {
    ignores: ["**/node_modules/**", "**/.next/**", "frontend/**", "scripts/**"],
  },
  ...coreWebVitals,
  {
    files: ["components/ScenarioConsole.jsx"],
    rules: {
      // Data hydration on mount and selection sync; async work is intentional.
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default eslintConfig;
