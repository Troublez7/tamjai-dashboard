# Rollin Dashboard Starter

Starter architecture for multiple Capy's AA Macro workers, Discord report ingestion, customer-owned match history, and a Next.js dashboard.

## Important scope
- This starter reads Discord messages/embeds posted by your existing Macro webhook. It does not inspect Roblox remotes or modify the Macro executable.
- The sample parser is intentionally conservative. It stores raw embed text and extracts only fields it can recognize. Adjust it after inspecting real Victory, Defeat, and other report examples.
- Customer isolation is enforced in Supabase Row Level Security. A worker must be assigned to a customer's Supabase Auth user ID by an administrator.
- Use a separate Discord channel per Macro worker for the initial setup. This makes ownership attribution reliable even if the report doesn't contain a Roblox username.
- Never commit `.env` or share Discord bot tokens / Supabase service-role keys.

## Stack
- Discord.js bot + Express ingestion service
- Supabase Postgres + Auth + RLS
- Next.js dashboard

## 1) Database
Create a Supabase project. Run `database/schema.sql` in the SQL editor. Enable Email auth. Create a profile row for each customer (or add a profile trigger later).

## 2) Discord reader
From `server/`:

```bash
npm install
cp .env.example .env
```

Fill in `DISCORD_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
Invite the bot to the report server with View Channels and Read Message History. Enable Message Content Intent in the Discord Developer Portal. For each worker, insert a row into `workers` with its Discord channel ID and the customer's Supabase Auth user UUID.

```bash
npm start
```

The bot reads new messages and embeds from configured channels and stores parsed reports. It does not need the Macro's webhook URL or bot token.

## 3) Web dashboard
From `web/`:

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Add your local URL to Supabase Auth redirect URLs. The starter page signs customers in and shows only their own reports via RLS.

## 4) Multi-worker setup
Use one Discord report channel per Macro installation at first. Add one `workers` row per channel, assigning it to the correct customer. This avoids guessing the owner from a Roblox display name. Later, if the report format includes a stable worker identifier, the parser can use that instead.

## 5) Next implementation steps
1. Collect sanitized embeds for Victory, Defeat, Dungeon, Portal, and other report types.
2. Improve `server/parser.js` against those real samples.
3. Add worker pairing / admin UI instead of manually inserting workers.
4. Add realtime subscriptions, pagination, screenshots, and order/payment workflows.

The sample does not claim to detect an active run before a report is posted. Live-in-progress status requires a separate heartbeat/status signal from the Macro or an authorized worker process.
