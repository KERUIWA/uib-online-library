# Cyrene daily letters: Cloudflare setup

This service uses Cloudflare Workers + D1 on the free plan, and the repository's existing Gmail SMTP secret to deliver the emails. The website never contains the private API key.

## 1. Create the Cloudflare database and Worker

Install Node.js, open a terminal in this folder, and run:

```bash
npx wrangler@latest login
npx wrangler@latest d1 create uib-cyrene-letters
```

Cloudflare prints a `database_id`. Copy it into `wrangler.toml`, replacing `REPLACE_WITH_D1_DATABASE_ID`.

Then initialise the database and deploy:

```bash
npx wrangler@latest d1 execute uib-cyrene-letters --remote --file=schema.sql
npx wrangler@latest secret put ADMIN_TOKEN
npx wrangler@latest deploy
```

When prompted for `ADMIN_TOKEN`, paste a newly generated long random secret. Keep it private. For example, generate one locally with `openssl rand -hex 32`. Do not send it in chat or commit it to GitHub.

After deployment, copy the Worker URL, for example `https://uib-cyrene-letters.YOUR-SUBDOMAIN.workers.dev`, into `assets/hsr/cyrene-letters-config.js`, replacing the placeholder, and commit that change.

## 2. Add GitHub settings

In the repository's Settings → Secrets and variables → Actions:

- Add repository secret `CYRENE_API_TOKEN` with the exact same value used for the Worker `ADMIN_TOKEN`.
- Add repository variable `CYRENE_WORKER_URL` with the Worker URL, without a trailing slash.
- Keep the existing `GMAIL_APP_PASSWORD` secret. The daily letter sender reuses it and sends to `theomgvirus@gmail.com`.

Do not put either secret in a source file or send it in chat.

## 3. Turn the letters on

Open the HSR page, scroll to **Letters from Cyrene**, enter the same private token in the access-key field, and save it for the browser tab. The on/off switch will then control the actual Cloudflare setting.

## How the story and delivery work

- A new letter is prepared once per Jakarta calendar day.
- A random delivery time is selected each day between 08:00 and 20:45 WIB. GitHub Actions checks every 15 minutes, so delivery is normally within 15 minutes of the selected time.
- The Worker stores her previous note and one future plan. When the plan's date arrives, her letter explicitly recalls the earlier date and what she promised to do.
- Turning letters off pauses delivery without deleting her story or pending promise. Turning them back on resumes the same continuity.
- The email is generated from a curated story engine, not an AI API. It varies the day's activity, reflections, and future plans while retaining continuity. The story is fictional fan correspondence, not an official in-game message.
