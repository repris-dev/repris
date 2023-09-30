import reactRefresh from "@vitejs/plugin-react-refresh";
import { defineConfig } from "vite";
import * as globals from "@sampleci/util/globals.config";
import pkg from "./package.json" assert { type: "json" };

const define = globals.defaults(pkg);
console.table(define);

export default defineConfig({
  define,
  esbuild: {
    jsxInject: `import React from 'react'`,
  },
  plugins: [reactRefresh()],
  server: {
    open: true,
  },
});
