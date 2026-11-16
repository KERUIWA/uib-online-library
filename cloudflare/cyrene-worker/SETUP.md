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
npx wrangler@latest secret put GEMINI_API_KEY
npx wrangler@latest deploy
```

When prompted for `ADMIN_TOKEN`, paste a newly generated long random secret. Keep it private. For example, generate one locally with `openssl rand -hex 32`. Do not send it in chat or commit it to GitHub.\n\nWhen prompted for `GEMINI_API_KEY`, paste an API key created in Google AI Studio. Keep it private and never place it in the website or GitHub source. Use Google's Free tier only: do not link a paid billing account or upgrade the project. The Worker defaults to the stable `gemini-3.5-flash` model. Google applies free-tier rate limits, which may change; if a limit is reached, that day's letter will retry on the next scheduled check rather than switching to a paid service. You can change the model later by setting a Worker variable named `GEMINI_MODEL`.

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
- Google Gemini generates a fresh, original letter each day using its free tier. The Worker supplies the latest 12 letters and saved story state as continuity context, so her experiences can evolve rather than being selected from a fixed template.
- The Worker stores her previous note and one future plan. When the plan's date arrives, the AI is instructed to recall the exact date and promise, then describe what happened. The application also reinforces the date and promise in the final email.
- Turning letters off pauses delivery without deleting her story or pending promise. Turning them back on resumes the same continuity.
- The letters are fictional fan correspondence, not official in-game messages. AI generation can occasionally fail; in that case the system does not send a template pretending to be an AI-written letter, and the next scheduled check can retry.
