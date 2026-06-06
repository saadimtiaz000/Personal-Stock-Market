import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      ignored: ["**/.chrome-layout-check/**"],
    },
  },
  resolve: {
    alias: {
      "react-native": "react-native-web",
    },
  },
});
