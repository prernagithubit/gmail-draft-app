require('dotenv').config();
const express = require('express');
const path = require('path');
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('redis');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ---- Redis client (lazy connect, reused across requests) ----
let redisClient;
async function getRedis() {
  if (!redisClient) {
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', (err) => console.error('Redis error:', err));
    await redisClient.connect();
  }
  return redisClient;
}

// ---- Google OAuth setup ----
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI // e.g. http://localhost:3000/oauth2callback
);

// Narrowest scope needed: compose-only, cannot read mail
const SCOPES = ['https://www.googleapis.com/auth/gmail.compose'];

// Tokens are persisted in Redis under this key.
// For true multi-user support, key this by a session/user ID instead of a fixed string.
const TOKEN_KEY = 'gmail_tokens';

app.get('/auth/status', async (req, res) => {
  const redis = await getRedis();
  const tokens = await redis.get(TOKEN_KEY);
  res.json({ authenticated: !!tokens });
});

app.get('/auth/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
  res.redirect(url);
});

app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    const redis = await getRedis();
    await redis.set(TOKEN_KEY, JSON.stringify(tokens)); // persisted across serverless invocations
    oauth2Client.setCredentials(tokens);
    res.redirect('/?connected=1');
  } catch (err) {
    console.error('OAuth error:', err);
    res.status(500).send('Authentication failed');
  }
});

// ---- AI email generation ----
app.post('/api/generate-email', async (req, res) => {
  const { recipientName, company, role, jobDescription, skills, tone } = req.body;

  if (!company || !role) {
    return res.status(400).json({ error: 'Company and role are required' });
  }

  const prompt = `Write a short, specific job application email using this exact structure:
1. One line: "I'm applying for the ${role} role at ${company}." (or close variant)
2. 2-3 lines naming 1-2 concrete projects/skills from the info below, with real details (metrics, tech stack) — not generic skill lists.
3. One line connecting those projects to the role, in plain language — do NOT use phrases like "aligns with your mission," "leverage," "cutting-edge," or "seamless."
4. One line offering to share resume/GitHub/portfolio.

Recipient name: ${recipientName || 'Hiring Manager'}
Company: ${company}
Role: ${role}
Tone: ${tone || 'Formal'}
Key skills/highlights to emphasize: ${skills || 'general fit based on the job description'}
Job description:
${jobDescription || '(not provided)'}

Requirements:
- Under 130 words total, no filler, no generic phrases like "I am writing to express" or "I came across"
- Banned words/phrases — do not use any of these: "aligns with," "mission," "cutting-edge," "eager to become," "leverage," "robust," "seamless," "passionate about," "dynamic," "synergy"
- Never invent experience, projects, companies, or achievements. Only use information explicitly provided above. If specific details aren't provided, keep the language general rather than fabricating specifics.
- Output ONLY valid JSON, no markdown fences, in this exact shape:
{"subject": "...", "body": "..."}`;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const raw = result.response
      .text()
      .trim()
      .replace(/^```json\s*|\s*```$/g, '');

    const parsed = JSON.parse(raw);
    res.json(parsed);
  } catch (err) {
    console.error('Generation error:', err);
    res.status(500).json({ error: 'Failed to generate email' });
  }
});

// ---- Gmail draft creation ----
function buildRawEmail({ to, subject, body }) {
  const messageParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body,
  ];
  const message = messageParts.join('\n');
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

app.post('/api/create-draft', async (req, res) => {
  const redis = await getRedis();
  const rawTokens = await redis.get(TOKEN_KEY);
  if (!rawTokens) {
    return res.status(401).json({ error: 'Not authenticated with Google' });
  }
  const storedTokens = JSON.parse(rawTokens);

  const { to, subject, body } = req.body;
  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'to, subject, and body are required' });
  }

  try {
    oauth2Client.setCredentials(storedTokens);

    // Persist any refreshed access token so future requests don't need re-auth
    oauth2Client.on('tokens', async (newTokens) => {
      const merged = { ...storedTokens, ...newTokens };
      await redis.set(TOKEN_KEY, JSON.stringify(merged));
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const raw = buildRawEmail({ to, subject, body });

    const draft = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: { raw },
      },
    });

    const draftId = draft.data.id;
    const gmailLink = `https://mail.google.com/mail/u/0/#drafts?compose=${draftId}`;

    res.json({ success: true, draftId, gmailLink });
  } catch (err) {
    console.error('Draft creation error:', err.message);
    if (err.code === 401 || (err.response && err.response.status === 401)) {
      await redis.del(TOKEN_KEY);
      return res.status(401).json({ error: 'Google session expired, please reconnect' });
    }
    res.status(500).json({ error: 'Failed to create Gmail draft' });
  }
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
}

module.exports = app;