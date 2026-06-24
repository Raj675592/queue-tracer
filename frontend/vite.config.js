import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: true, // Allows Back4app to access the dev server
  },
  preview: {
    allowedHosts: true, // Allows Back4app to access the preview server
  },
});