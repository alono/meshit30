import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import admin from './scripts/admin-server.mjs';

// `subjects/` sits outside src/ on purpose: it is content, not code. It is still
// inside the project root, which Vite serves by default, so the subject loader
// can glob it directly and adding a subject stays a pure content drop.
//
// `host: true` exposes the dev server to the LAN for phone testing, so never
// widen `server.fs.allow`: that would serve other folders on this machine too.
export default defineConfig({
  plugins: [react(), admin()],
  server: { host: true },
});
