# Job Application Email → Gmail Draft

Generates a tailored job application email with Claude, lets you review/edit it,
then creates it as an actual **Gmail draft** (never auto-sends) via the Gmail API.

## 1. Install
```bash
npm install
```

## 2. Google Cloud setup (one-time)
1. Go to https://console.cloud.google.com/ → create/select a project
2. **APIs & Services → Library** → enable **Gmail API**
3. **APIs & Services → OAuth consent screen** → set up (External is fine for personal use, add yourself as a test user)
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URI: `http://localhost:3000/oauth2callback`
5. Copy the generated **Client ID** and **Client Secret**

## 3. Configure environment
```bash
cp .env.example .env
```
Fill in:
- `ANTHROPIC_API_KEY` — from console.anthropic.com
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — from step 2

## 4. Run
```bash
node server.js
```
Open http://localhost:3000

## 5. Use it
1. Click **Connect Gmail** (top banner) → sign in with Google → grant "compose" permission only
2. Fill out the form (company, role, JD, recipient email)
3. Click **Generate Email** → review/edit subject & body inline
4. Click **Create Gmail Draft**
5. Click **Open in Gmail** or just open Gmail yourself → Drafts → it's sitting there, ready to send

## Notes on security / scope
- Uses `gmail.compose` scope only — this app can create/edit drafts but **cannot read your inbox or send mail directly**. You always hit Send yourself in Gmail.
- Tokens are stored in memory for this demo (`storedTokens` in `server.js`). For real/multi-user use, swap this for a database (e.g. per-user row with encrypted refresh token).
- Never commit your real `.env` file.

## Extending
- Add resume file attachment: encode as base64, build a `multipart/mixed` MIME message instead of plain text (Gmail API `raw` field supports full MIME).
- Add "batch mode" to generate + draft multiple applications in one session.
- Swap in-memory token store for SQLite/Postgres for persistence across restarts.
