import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `subjects/` sits outside src/ on purpose: it is content, not code. Allowing
// fs access to the project root lets the subject loader glob it directly, so
// adding a subject stays a pure content drop.
export default defineConfig({
  plugins: [react()],
  server: { host: true, fs: { allow: ['..'] } },
});
