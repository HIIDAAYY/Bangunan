import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig Next memakai jsx: "preserve"; untuk test, transform JSX langsung.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
