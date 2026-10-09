import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  server: {
    // Google sign-in only works from origins registered on the OAuth client,
    // so don't silently fall back to another port if 5173 is busy.
    port: 5173,
    strictPort: true,
  },
});
