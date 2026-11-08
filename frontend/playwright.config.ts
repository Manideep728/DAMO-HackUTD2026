import { defineConfig } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

// The rehearsal runs its own backend and frontend on spare ports, with a throwaway database and the scripted
// agent (GAUNTLET_MODE=mock) and the hand-written load profile (PREFLIGHT_METERS=off), so it never touches a
// running dev server, the meter database or the API.
const python = process.env.PREFLIGHT_PYTHON ?? '.venv/bin/python';
const db = path.join(os.tmpdir(), `preflight-rehearsal-${process.pid}.sqlite`);

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5182', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: [
    {
      command: `${python} -m uvicorn app.main:app --port 8012`,
      cwd: '../backend',
      url: 'http://localhost:8012/api/preflight/facility',
      env: { PREFLIGHT_DB: db, GAUNTLET_MODE: 'mock', PREFLIGHT_METERS: 'off' },
      timeout: 60_000,
    },
    {
      command: 'npx vite --port 5182 --strictPort',
      url: 'http://localhost:5182',
      env: { GAUNTLET_API: 'http://localhost:8012' },
      timeout: 60_000,
    },
  ],
});
