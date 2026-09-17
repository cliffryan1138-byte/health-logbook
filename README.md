# Logbook

The household health log — a Vite + React PWA on Supabase, deployed to
`healthtrack.wastegate.ai`.

Photo, voice or manual capture of meals, vitals, exercise and symptoms; a
14-day dashboard that summarises them. The companion `health-tracker` Claude
skill writes to the same tables.

## Why this repo exists

This app ran for months with **no repository**. It was deployed once with
`vercel --prod` from a folder that no longer exists — not on either Mac, not in
Drive, not in git. The only surviving copy was the source Vercel kept with the
deployment.

That copy was partly recoverable. Files under about 3.3 KB came back byte-exact;
larger ones were truncated in transit and had to be rebuilt.

**Recovered, byte-exact from deployment `dpl_CiP92Li7q9X8SJ6pyTrY7Z2duxyU`:**
`package.json`, `src/App.jsx`, `src/main.jsx`, `src/lib/supabase.js`,
`src/lib/icons.jsx`, `src/hooks/useLogs.js`, `src/components/Card.jsx`,
`src/components/Spark.jsx`, `src/context/AuthContext.jsx`, and the top of
`src/lib/stats.js` and `src/pages/Login.jsx`.

**Rebuilt, because the original was truncated or lost:**
`src/pages/Dashboard.jsx`, `src/components/QuickLog.jsx`,
`src/styles/global.css`, `src/pages/Onboarding.jsx`,
`src/components/FeedbackBox.jsx`, `src/components/InstallPrompt.jsx`, and the
tails of `stats.js` and `Login.jsx`. Each carries a note saying so.

The rebuilt files were written against the **live database schema** and
screenshots of the running app, not from memory. `supabase/migrations/0001_init.sql`
is generated from the live project, so it is accurate even though the original
migration was lost.

Behaviour should match. Implementation details will differ from the original in
places — that is the honest cost of the recovery.

## Colours

The palette is the Wastegate scarlet/gold/silver set shared with wastegate.ai,
HeyJP!, Project Garage and Redline. The original teal/`#10615c` scheme is gone.
Tokens live at the top of `src/styles/global.css`; there is a dark theme.

Note that `profiles.color` still defaults to `#1c6b58` in the database — a
leftover from the old scheme. It is unused by the app.

## Running it

```bash
npm install
cp .env.example .env    # fill in both values
npm run dev
```

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are inlined at build time, so
they must be set in the Vercel project as well as locally. A build without them
refuses to start rather than shipping a blank app — see `src/lib/supabase.js`.

## Security note

The original deployment uploaded a real `.env` alongside the source. **Treat
that anon key as exposed and rotate it.** `.env` is gitignored here.
