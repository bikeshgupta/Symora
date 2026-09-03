import { fileURLToPath, URL } from 'node:url';

// Tailwind's PostCSS plugin auto-discovers tailwind.config.* by searching upward from
// process.cwd() — fine for `npm run dev` (cwd is apps/web), but `vercel dev` invokes
// this from the repo root, where that search never finds apps/web/tailwind.config.ts
// and silently falls back to an empty config. Pointing at it explicitly makes this
// work no matter where the process is invoked from.
export default {
  plugins: {
    tailwindcss: { config: fileURLToPath(new URL('./tailwind.config.ts', import.meta.url)) },
    autoprefixer: {},
  },
};
