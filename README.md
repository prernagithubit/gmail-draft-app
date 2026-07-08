# Job Application Email → Gmail Draft

Generates a tailored job application email with Gemini, lets you review/edit it,
then creates it as an actual **Gmail draft** (never auto-sends) via the Gmail API.

Live at: https://gmail-draft-app.vercel.app

## Stack
- Node/Express backend, deployed on Vercel (serverless)
- Google Gemini API for email generation
- Gmail API (`gmail.compose` scope only) for draft creation
- Redis (via Vercel's Redis integration) for persisting the Google OAuth token across serverless invocations

## 1. Install
```bash
npm install
```

## 2. Google Cloud setup (one-time)
1. Go to https://console.cloud.google.com/ → create/select a project
2. **APIs & Services → Library** → enable **Gmail API**
3. **APIs & Services → OAuth consent screen** → set up (External is fine for personal use, add yourself as a test user under Audience → Test users)
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: add both
     - `http://localhost:3000/oauth2callback` (for local testing)
     - `https://your-deployed-url.vercel.app/oauth2callback` (for production)
5. Copy the generated **Client ID** and **Client Secret**

## 3. Get a Gemini API key
Go to https://aistudio.google.com/app/apikey → Create API key (free tier is generous for this use case).

## 4. Configure environment
```bash
cp .env.example .env
```
Fill in:
- `GEMINI_API_KEY` — from aistudio.google.com
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — from step 2
- `GOOGLE_REDIRECT_URI` — `http://localhost:3000/oauth2callback` for local dev
- `REDIS_URL` — pull this from Vercel (Project → Storage → your Redis store → `.env.local` tab) if testing locally against the same store, or set up your own local Redis for fully offline dev

## 5. Run locally
```bash
node server.js
```
Open http://localhost:3000

## 6. Deploy to Vercel
1. Push this repo to GitHub
2. Import into Vercel (Add New → Project)
3. Add environment variables in Vercel: `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (using your live Vercel URL + `/oauth2callback`)
4. Vercel → Storage → Create Database → Redis (free 30MB tier) → connect to project (auto-adds `REDIS_URL`)
5. Redeploy after adding env vars
6. Add the live redirect URI to your Google OAuth client's Authorized redirect URIs

## 7. Use it
1. Click **Connect Gmail** (top banner) → sign in with Google → grant "compose" permission only
2. Fill out the form (company, role, JD, recipient email)
3. Click **Generate Email** → review/edit subject & body inline
4. Click **Create Gmail Draft**
5. Click **Open in Gmail** or just open Gmail yourself → Drafts → it's sitting there, ready to send

## Notes on security / scope
- Uses `gmail.compose` scope only — this app can create/edit drafts but **cannot read your inbox or send mail directly**. You always hit Send yourself in Gmail.
- The Google OAuth token is stored in Redis under a single fixed key (`gmail_tokens`) — fine for solo/personal use, but means everyone using the live URL currently shares one Gmail connection. For true multi-user support, this needs session/cookie-based user identity so each visitor gets their own token.
- While in **Testing** mode on Google's OAuth consent screen, only manually-added test users (up to 100) can log in. Full public access requires Google's OAuth verification process (a domain, privacy policy, demo video, and review — see Google's docs).
- Never commit your real `.env` file.

## Extending
- Add resume file attachment: encode as base64, build a `multipart/mixed` MIME message instead of plain text (Gmail API `raw` field supports full MIME).
- Add "batch mode" to generate + draft multiple applications in one session.
- Add session-based auth so multiple people can each connect their own Gmail account.