// Mama Care Rwanda: Express API (v2)
// Needs Node 18+.  npm i express cors helmet express-rate-limit pg bcryptjs jsonwebtoken google-auth-library dotenv
//
// .env
//   PORT=5000
//   DB_HOST=localhost  DB_PORT=5432  DB_NAME=...  DB_USER=postgres  DB_PASSWORD=...   (see db.js)
//   PGSSL=false                         (true for most hosted Postgres)
//   JWT_SECRET=long-random-string
//   CLIENT_URL=http://localhost:5173    (comma-separate several origins)
//   GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
//   ADMIN_EMAILS=you@gmail.com,nurse@gmail.com
//   ADMIN_NAME=Dr. Uwimana A.
//   ADMIN_PHONE=0788123456
//   ADMIN_PIN=your-admin-pin
//   AI_API_KEY=                         (Anthropic key; leave empty for built-in fallback replies)
//   AI_MODEL=claude-sonnet-5-5
//   AT_USERNAME=sandbox                 (Africa's Talking)
//   AT_API_KEY=
//   AT_URL=https://api.sandbox.africastalking.com/version1/messaging
//   SMS_WEBHOOK_KEY=another-random-string
//
// Callback URLs to set at your provider (Africa's Talking):
//   SMS:   https://YOUR-API/api/sms/inbound?key=SMS_WEBHOOK_KEY
//   USSD:  https://YOUR-API/api/ussd?key=SMS_WEBHOOK_KEY
//
// New tables (cases, referrals, followups, facilities, ussd_logs) are created automatically at start.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { q } = require('./db');

for (const k of ['DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET']) {
  if (!process.env[k]) { console.error(`Missing ${k} in .env`); process.exit(1); }
}

const app = express();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
const h = (fn) => (req, res, next) => fn(req, res, next).catch(next);

app.use(helmet());
const ORIGINS = (process.env.CLIENT_URL || '').split(',').map((o) => o.trim()).filter(Boolean);
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
app.use(cors({
  origin: (origin, cb) =>
    cb(null, !origin || ORIGINS.includes(origin) || (process.env.NODE_ENV !== 'production' && DEV_ORIGIN.test(origin))),
}));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 60 }));

/* ---------------- schema (safe to run at every start) ---------------- */
async function ensureSchema() {
  const sql = [
    `CREATE SEQUENCE IF NOT EXISTS case_code_seq START 1001`,
    `CREATE TABLE IF NOT EXISTS facilities(
       id SERIAL PRIMARY KEY, name TEXT NOT NULL, district TEXT, type TEXT DEFAULT 'Health facility',
       phone TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS cases(
       id SERIAL PRIMARY KEY,
       code TEXT UNIQUE DEFAULT ('MC-' || nextval('case_code_seq')),
       user_id TEXT, patient_name TEXT NOT NULL, phone TEXT,
       channel TEXT NOT NULL DEFAULT 'website', need TEXT NOT NULL DEFAULT 'Health information',
       status TEXT NOT NULL DEFAULT 'new', priority TEXT NOT NULL DEFAULT 'normal',
       assigned_to TEXT, notes TEXT, ai_summary TEXT,
       created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS referrals(
       id SERIAL PRIMARY KEY, case_id INT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
       facility_id INT REFERENCES facilities(id) ON DELETE SET NULL, reason TEXT,
       status TEXT NOT NULL DEFAULT 'pending', created_by TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS followups(
       id SERIAL PRIMARY KEY, case_id INT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
       due_date DATE NOT NULL, note TEXT, status TEXT NOT NULL DEFAULT 'pending',
       created_at TIMESTAMPTZ DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS ussd_logs(
       id SERIAL PRIMARY KEY, session_id TEXT, phone TEXT, input TEXT, response TEXT,
       created_at TIMESTAMPTZ DEFAULT now())`,
    `ALTER TABLE call_requests ADD COLUMN IF NOT EXISTS transcript TEXT`,
  ];
  for (const s of sql) await q(s);
  if (!(await q('SELECT 1 FROM facilities LIMIT 1')).rowCount) {
    for (const [name, district, type] of [
      ['Butaro District Hospital', 'Burera', 'District hospital'],
      ['Ruhengeri Referral Hospital', 'Musanze', 'Referral hospital'],
      ['CHUK University Teaching Hospital', 'Nyarugenge, Kigali', 'Teaching hospital'],
      ['King Faisal Hospital', 'Gasabo, Kigali', 'Referral hospital'],
    ]) await q('INSERT INTO facilities(name,district,type) VALUES($1,$2,$3)', [name, district, type]);
  }
}

/* ---------------- helpers ---------------- */
const COLS = 'id,name,phone,email,role,source,language,created_at';
const sign = (u) => jwt.sign({ id: u.id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
const CASE_STATUS = ['new', 'in_progress', 'referred', 'awaiting_followup', 'closed'];
const CHANNELS = ['website', 'ussd', 'phone', 'virtual', 'community', 'sms'];

const normPhone = (p) => {
  const d = String(p || '').replace(/[^\d+]/g, '');
  if (!d) return null;
  if (d.startsWith('+')) return d;
  if (d.startsWith('250')) return '+' + d;
  if (d.startsWith('0')) return '+250' + d.slice(1);
  return '+250' + d;
};

const log = (actor, action, target, detail) =>
  q('INSERT INTO activity_log(actor_id,action,target,detail) VALUES($1,$2,$3,$4)', [actor, action, target, detail]);

const notify = (userId, type, title, body) =>
  q('INSERT INTO notifications(user_id,type,title,body) VALUES($1,$2,$3,$4)', [userId, type, title, body]);

const notifyAdmins = (type, title, body) =>
  q(`INSERT INTO notifications(user_id,type,title,body)
     SELECT id,$1,$2,$3 FROM users WHERE role='admin'`, [type, title, body]);

async function openCase({ userId, name, phone, channel, need, priority = 'normal', summary, notes }) {
  const { rows } = await q(
    `INSERT INTO cases(user_id,patient_name,phone,channel,need,priority,ai_summary,notes)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [userId ? String(userId) : null, name || 'Unregistered', phone || null, channel, need, priority, summary || null, notes || null]);
  await log(userId || null, 'case_created', 'case:' + rows[0].code, channel);
  return rows[0];
}

const findCase = async (b) =>
  (await q(
    `SELECT * FROM cases WHERE ($1::int IS NOT NULL AND id=$1::int) OR ($2 <> '' AND upper(code)=$2) LIMIT 1`,
    [Number(b.case_id) || null, String(b.code || '').trim().toUpperCase()])).rows[0];

async function sendSms(phone, message, userId = null) {
  await q('INSERT INTO sms_messages(phone,direction,body,user_id) VALUES($1,$2,$3,$4)', [phone, 'out', message, userId]);
  if (!process.env.AT_API_KEY) return console.log(`[SMS not sent, no AT_API_KEY] ${phone}: ${message}`);
  try {
    await fetch(process.env.AT_URL || 'https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: { apiKey: process.env.AT_API_KEY, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ username: process.env.AT_USERNAME || 'sandbox', to: phone, message }),
    });
  } catch (e) { console.error('SMS error:', e.message); }
}

/* ---------------- AI assistant + flagging ---------------- */
const SERIOUS = /(lump|bleed|blood|discharge|swelling|dimpl|severe|emergency|urgent|faint|breath|suicid|kill myself|unbearable)/i;

const FALLBACK =
  "Thank you for sharing. It's good that you asked early. Please visit your nearest health center for a check-up, " +
  'or book a virtual doctor or call Mama Care for support. I cannot diagnose, but a health professional can help you.';
const FALLBACK_STAFF = 'The AI service is not configured (AI_API_KEY is empty). Please follow your clinical protocol and escalate to a doctor if unsure.';

const SYS_PATIENT =
  'You are the Mama Care Rwanda assistant for breast health support. Be warm, calm and brief (under 120 words), ' +
  'use simple language, never diagnose, give 2-3 safe next steps, and suggest a clinic visit, a virtual doctor ' +
  'meeting or calling Mama Care. For emergencies tell the person to go to the nearest health facility now.';
const SYS_STAFF =
  'You support Mama Care Rwanda case workers and community health workers. Be concise and practical (under 150 words). ' +
  'Help with triage questions, referral steps, what to ask a patient, and how to explain next steps simply. ' +
  'Never give a diagnosis. Recommend escalation to a doctor for any red-flag symptom.';

async function askAI(text, system = SYS_PATIENT, fallback = FALLBACK, max = 400) {
  if (!process.env.AI_API_KEY) return fallback;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.AI_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'claude-sonnet-5-5',
        max_tokens: max,
        system,
        messages: [{ role: 'user', content: text }],
      }),
    });
    const data = await r.json();
    return data.content?.[0]?.text || fallback;
  } catch (e) { console.error('AI error:', e.message); return fallback; }
}

async function saveQuestion({ user, phone, source, body }) {
  const flagged = SERIOUS.test(body);
  const ai = await askAI(body);
  const { rows } = await q(
    'INSERT INTO questions(user_id,phone,source,body,ai_answer,flagged) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
    [user?.id || null, phone || user?.phone || null, source, body, ai, flagged]);
  if (flagged) {
    await notifyAdmins('urgent', 'Serious question flagged', `${user?.name || phone || 'A user'}: ${body.slice(0, 120)}`);
    await log(user?.id || null, 'question_flagged', 'question:' + rows[0].id, source);
    await openCase({
      userId: user?.id, name: user?.name || phone, phone: phone || user?.phone,
      channel: source === 'sms' ? 'sms' : 'website', need: 'Medical referral', priority: 'high', summary: body.slice(0, 300),
    });
  }
  return rows[0];
}

/* ---------------- auth middleware ---------------- */
const auth = (req, res, next) => {
  try {
    const t = (req.headers.authorization || '').replace('Bearer ', '');
    req.user = jwt.verify(t, process.env.JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Please log in again.' }); }
};
const adminOnly = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admins only.' });

/* ---------------- auth routes ---------------- */
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/auth/register', h(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const phone = normPhone(req.body.phone);
  const pin = String(req.body.pin || '');
  if (name.length < 2 || !phone || !/^.{4,8}$/.test(pin))
    return res.status(400).json({ error: 'Enter your name, phone number and a PIN of 4 to 8 characters.' });
  if ((await q('SELECT 1 FROM users WHERE phone=$1', [phone])).rowCount)
    return res.status(409).json({ error: 'This phone number is already registered. Please log in.' });
  const { rows } = await q(
    `INSERT INTO users(name,phone,pin_hash,source) VALUES($1,$2,$3,'web') RETURNING ${COLS}`,
    [name, phone, await bcrypt.hash(pin, 10)]);
  await notify(rows[0].id, 'welcome', 'Welcome to Mama Care', 'Your support space is ready. Ask the assistant or request help any time.');
  await log(rows[0].id, 'registered', 'user:' + rows[0].id, 'web');
  res.json({ token: sign(rows[0]), user: rows[0] });
}));

app.post('/api/auth/login', h(async (req, res) => {
  const phone = normPhone(req.body.phone);
  const { rows } = await q('SELECT * FROM users WHERE phone=$1', [phone]);
  const u = rows[0];
  if (!u || !u.pin_hash || !(await bcrypt.compare(String(req.body.pin || ''), u.pin_hash)))
    return res.status(401).json({ error: 'Phone number or PIN is not correct.' });
  await q('UPDATE users SET last_login=now() WHERE id=$1', [u.id]);
  await log(u.id, 'login', 'user:' + u.id, 'pin');
  delete u.pin_hash;
  res.json({ token: sign(u), user: u });
}));

app.post('/api/auth/google', h(async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(500).json({ error: 'Google sign-in is not configured.' });
  let p;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: req.body.credential, audience: process.env.GOOGLE_CLIENT_ID });
    p = ticket.getPayload();
  } catch { return res.status(401).json({ error: 'Google sign-in failed. Please try again.' }); }
  if (!p.email_verified) return res.status(401).json({ error: 'Your Google email is not verified.' });

  const isAdmin = ADMIN_EMAILS.includes(p.email.toLowerCase());
  let { rows } = await q('SELECT * FROM users WHERE google_id=$1 OR email=$2 LIMIT 1', [p.sub, p.email]);
  let u = rows[0];
  if (!u) {
    ({ rows } = await q(
      `INSERT INTO users(name,email,google_id,role,source) VALUES($1,$2,$3,$4,'google') RETURNING *`,
      [p.name || p.email.split('@')[0], p.email, p.sub, isAdmin ? 'admin' : 'user']));
    u = rows[0];
    await notify(u.id, 'welcome', 'Welcome to Mama Care', 'Your support space is ready. Ask the assistant or request help any time.');
    await log(u.id, 'registered', 'user:' + u.id, 'google');
  } else if (!u.google_id) {
    await q('UPDATE users SET google_id=$1 WHERE id=$2', [p.sub, u.id]);
  }
  if (isAdmin && u.role !== 'admin') {
    await q(`UPDATE users SET role='admin' WHERE id=$1`, [u.id]);
    u.role = 'admin';
  }
  await q('UPDATE users SET last_login=now() WHERE id=$1', [u.id]);
  await log(u.id, 'login', 'user:' + u.id, 'google');
  delete u.pin_hash;
  res.json({ token: sign(u), user: u });
}));

/* ---------------- profile ---------------- */
app.get('/api/me', auth, h(async (req, res) => {
  const { rows } = await q(`SELECT ${COLS} FROM users WHERE id=$1`, [req.user.id]);
  if (!rows[0]) return res.status(401).json({ error: 'Please log in again.' });
  res.json({ user: rows[0] });
}));

app.put('/api/me', auth, h(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const phone = req.body.phone ? normPhone(req.body.phone) : null;
  if (name.length < 2) return res.status(400).json({ error: 'Please enter your name.' });
  try {
    const { rows } = await q(`UPDATE users SET name=$1, phone=$2 WHERE id=$3 RETURNING ${COLS}`, [name, phone, req.user.id]);
    await log(req.user.id, 'profile_updated', 'user:' + req.user.id, null);
    res.json({ user: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That phone number is used by another account.' });
    throw e;
  }
}));

app.post('/api/me/pin', auth, h(async (req, res) => {
  const next = String(req.body.pin || '');
  if (!/^.{4,8}$/.test(next)) return res.status(400).json({ error: 'The new PIN must have 4 to 8 characters.' });
  const { rows } = await q('SELECT pin_hash FROM users WHERE id=$1', [req.user.id]);
  if (rows[0]?.pin_hash && !(await bcrypt.compare(String(req.body.current || ''), rows[0].pin_hash)))
    return res.status(401).json({ error: 'Your current PIN is not correct.' });
  await q('UPDATE users SET pin_hash=$1 WHERE id=$2', [await bcrypt.hash(next, 10), req.user.id]);
  await log(req.user.id, 'pin_changed', 'user:' + req.user.id, null);
  res.json({ ok: true });
}));

/* ---------------- AI questions ---------------- */
app.post('/api/questions', auth, h(async (req, res) => {
  const body = String(req.body.text || '').trim().slice(0, 1000);
  if (!body) return res.status(400).json({ error: 'Write a message first.' });
  const { rows } = await q(`SELECT ${COLS} FROM users WHERE id=$1`, [req.user.id]);
  res.json(await saveQuestion({ user: rows[0], source: 'web', body }));
}));

/* ---------------- facilities (read for everyone signed in) ---------------- */
app.get('/api/facilities', auth, h(async (_req, res) => {
  res.json((await q('SELECT * FROM facilities ORDER BY name')).rows);
}));

/* ---------------- doctor requests ---------------- */
app.post('/api/doctor-requests', auth, h(async (req, res) => {
  const { reason, date, time, method, notes } = req.body;
  if (!reason || !date || !time) return res.status(400).json({ error: 'Choose a reason, date and time.' });
  const { rows } = await q(
    `INSERT INTO doctor_requests(user_id,reason,preferred_date,preferred_time,method,notes)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user.id, reason, date, time, method === 'Phone call' ? 'Phone call' : 'Video call', String(notes || '').slice(0, 500)]);
  const me = (await q('SELECT name,phone FROM users WHERE id=$1', [req.user.id])).rows[0];
  await openCase({ userId: req.user.id, name: me?.name, phone: me?.phone, channel: 'virtual', need: 'Virtual consultation', summary: `${reason}: ${date}, ${time}` });
  await notify(req.user.id, 'doctor', 'Meeting request sent', `We received your request for ${date}, ${time}. The care team will confirm.`);
  await notifyAdmins('doctor', 'New virtual doctor request', `${reason}: ${date}, ${time}`);
  await log(req.user.id, 'doctor_requested', 'doctor_request:' + rows[0].id, reason);
  res.json(rows[0]);
}));

app.get('/api/doctor-requests', auth, h(async (req, res) => {
  const admin = req.user.role === 'admin';
  const { rows } = await q(
    `SELECT d.*, to_char(d.preferred_date,'YYYY-MM-DD') AS date, u.name, u.phone
     FROM doctor_requests d JOIN users u ON u.id=d.user_id
     WHERE ($1 OR d.user_id=$2) ORDER BY d.id DESC LIMIT 200`, [admin, req.user.id]);
  res.json(rows);
}));

app.patch('/api/doctor-requests/:id', auth, adminOnly, h(async (req, res) => {
  const { status, admin_note } = req.body;
  if (!['approved', 'rejected', 'completed'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const { rows } = await q(
    `UPDATE doctor_requests SET status=$1, admin_note=$2, reviewed_by=$3, reviewed_at=now()
     WHERE id=$4 RETURNING *`, [status, admin_note || null, req.user.id, req.params.id]);
  const d = rows[0];
  if (!d) return res.status(404).json({ error: 'Request not found.' });
  const text = status === 'approved'
    ? `Your virtual doctor meeting is approved for ${d.preferred_time}. We will share joining details.`
    : status === 'rejected' ? 'We could not confirm your meeting request. Please request another time or call Mama Care.'
    : 'Your meeting is marked as completed. Take care!';
  await notify(d.user_id, 'doctor', 'Virtual doctor update', text);
  const { rows: u } = await q('SELECT phone FROM users WHERE id=$1', [d.user_id]);
  if (u[0]?.phone && status !== 'completed') await sendSms(u[0].phone, 'Mama Care: ' + text, d.user_id);
  await log(req.user.id, 'doctor_' + status, 'doctor_request:' + d.id, null);
  res.json(d);
}));

/* ---------------- call requests ---------------- */
app.post('/api/calls', auth, h(async (req, res) => {
  const { rows } = await q('INSERT INTO call_requests(user_id) VALUES($1) RETURNING *', [req.user.id]);
  const me = (await q('SELECT name,phone FROM users WHERE id=$1', [req.user.id])).rows[0];
  await openCase({ userId: req.user.id, name: me?.name, phone: me?.phone, channel: 'phone', need: 'Call support' });
  await notify(req.user.id, 'call', 'Support call requested', 'A Mama Care responder will call you soon.');
  await notifyAdmins('call', 'New support call request', 'A user is waiting for a call.');
  await log(req.user.id, 'call_requested', 'call:' + rows[0].id, null);
  res.json(rows[0]);
}));

/* ---------------- notifications ---------------- */
app.get('/api/notifications', auth, h(async (req, res) => {
  const { rows } = await q('SELECT * FROM notifications WHERE user_id=$1 ORDER BY id DESC LIMIT 50', [req.user.id]);
  res.json(rows);
}));
app.post('/api/notifications/read-all', auth, h(async (req, res) => {
  await q('UPDATE notifications SET read=TRUE WHERE user_id=$1', [req.user.id]);
  res.json({ ok: true });
}));
app.patch('/api/notifications/:id/read', auth, h(async (req, res) => {
  await q('UPDATE notifications SET read=TRUE WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.json({ ok: true });
}));

/* ---------------- SMS webhook ---------------- */
app.post('/api/sms/inbound', h(async (req, res) => {
  if (process.env.SMS_WEBHOOK_KEY && req.query.key !== process.env.SMS_WEBHOOK_KEY) return res.sendStatus(403);
  const phone = normPhone(req.body.from);
  const text = String(req.body.text || '').trim().slice(0, 500);
  if (!phone || !text) return res.sendStatus(400);

  let { rows } = await q(`SELECT ${COLS} FROM users WHERE phone=$1`, [phone]);
  let user = rows[0];
  await q('INSERT INTO sms_messages(phone,direction,body,user_id) VALUES($1,$2,$3,$4)', [phone, 'in', text, user?.id || null]);

  if (/^reg(ister)?\b/i.test(text)) {
    if (user) {
      await sendSms(phone, `Hello ${user.name}, you are already registered with Mama Care.`, user.id);
    } else {
      const name = text.replace(/^reg(ister)?\s*/i, '').trim() || 'Mama Care Friend';
      const pin = String(Math.floor(1000 + Math.random() * 9000));
      ({ rows } = await q(
        `INSERT INTO users(name,phone,pin_hash,source) VALUES($1,$2,$3,'sms') RETURNING ${COLS}`,
        [name, phone, await bcrypt.hash(pin, 10)]));
      await notify(rows[0].id, 'welcome', 'Welcome to Mama Care', 'You joined by SMS.');
      await log(rows[0].id, 'registered', 'user:' + rows[0].id, 'sms');
      await sendSms(phone, `Welcome ${name}! Your Mama Care PIN is ${pin}. Log in on the website with this phone number. Text any health question to ask.`, rows[0].id);
    }
  } else {
    const row = await saveQuestion({ user, phone, source: 'sms', body: text });
    const reply = (row.ai_answer || '').slice(0, 280) + (row.flagged ? ' A Mama Care health worker will contact you.' : '');
    await sendSms(phone, reply, user?.id || null);
  }
  res.send('OK');
}));

/* ---------------- USSD (Africa's Talking format: CON = continue, END = finish) ---------------- */
app.post('/api/ussd', h(async (req, res) => {
  if (process.env.SMS_WEBHOOK_KEY && req.query.key !== process.env.SMS_WEBHOOK_KEY) return res.sendStatus(403);
  const phone = normPhone(req.body.phoneNumber);
  const text = String(req.body.text || '');
  const sid = String(req.body.sessionId || '').slice(0, 100);
  const parts = text ? text.split('*') : [];
  const user = phone ? (await q('SELECT id,name FROM users WHERE phone=$1', [phone])).rows[0] : null;
  const who = { userId: user?.id, name: user?.name || phone || 'USSD user', phone, channel: 'ussd' };
  let out;

  if (!parts.length) {
    out = 'CON Welcome to Mama Care Rwanda\n1. I noticed a breast change\n2. Request a support call\n3. Find a health facility\n4. How to register';
  } else if (parts[0] === '1' && parts.length === 1) {
    out = 'CON What have you noticed?\n1. A lump\n2. Pain\n3. Skin or nipple change\n4. Something else';
  } else if (parts[0] === '1') {
    const sym = { 1: 'a lump', 2: 'pain', 3: 'a skin or nipple change', 4: 'another concern' }[parts[1]];
    if (!sym) out = 'END Invalid choice. Please dial again.';
    else {
      const high = parts[1] === '1' || parts[1] === '3';
      await openCase({ ...who, need: 'Medical referral', priority: high ? 'high' : 'normal', summary: `USSD report: ${sym}` });
      if (high) await notifyAdmins('urgent', 'High-risk USSD request', `${who.name} reported ${sym}.`);
      out = 'END Thank you. A Mama Care responder will contact you. If it is urgent, go to your nearest health facility now.';
    }
  } else if (parts[0] === '2') {
    await openCase({ ...who, need: 'Call support' });
    if (user) await q('INSERT INTO call_requests(user_id) VALUES($1)', [user.id]);
    await notifyAdmins('call', 'New support call request', `${who.name} asked for a call by USSD.`);
    out = 'END Request received. A Mama Care responder will call you soon.';
  } else if (parts[0] === '3') {
    const f = (await q('SELECT name,district FROM facilities ORDER BY name LIMIT 4')).rows;
    out = 'END Referral centres:\n' + (f.map((x, i) => `${i + 1}. ${x.name}${x.district ? ' (' + x.district + ')' : ''}`).join('\n') || 'No facilities listed yet.');
  } else if (parts[0] === '4') {
    out = 'END Send an SMS with REGISTER and your name to join Mama Care.';
  } else out = 'END Invalid choice. Please dial again.';

  await q('INSERT INTO ussd_logs(session_id,phone,input,response) VALUES($1,$2,$3,$4)', [sid, phone, text, out]);
  res.type('text/plain').send(out);
}));

/* ---------------- admin ---------------- */
const admin = express.Router();
admin.use(auth, adminOnly);
const count = async (sql, params) => (await q(sql, params)).rows[0].n;
const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : a ? 100 : 0);
const trend = async (table, col, where = 'TRUE') => {
  const base = `SELECT count(*)::int n FROM ${table} WHERE ${where} AND ${col}`;
  const [a, b] = await Promise.all([
    count(`${base} >= now() - interval '7 days'`),
    count(`${base} >= now() - interval '14 days' AND ${col} < now() - interval '7 days'`),
  ]);
  return pct(a, b);
};

admin.get('/counts', h(async (_req, res) => {
  const [n, active, refs, fups] = await Promise.all([
    count(`SELECT count(*)::int n FROM cases WHERE status='new'`),
    count(`SELECT count(*)::int n FROM cases WHERE status<>'closed'`),
    count(`SELECT count(*)::int n FROM referrals WHERE status='pending'`),
    count(`SELECT count(*)::int n FROM followups WHERE status='pending'`),
  ]);
  res.json({ new: n, cases: active, referrals: refs, followup: fups });
}));

admin.get('/overview', h(async (_req, res) => {
  const [total, active, refs, appts, fups, tTotal, tActive, tRefs, tAppts, tFups, channels, statuses, activity, recent,
    flagged, overdue, transport, calls] = await Promise.all([
    count(`SELECT count(*)::int n FROM cases`),
    count(`SELECT count(*)::int n FROM cases WHERE status<>'closed'`),
    count(`SELECT count(*)::int n FROM referrals`),
    count(`SELECT count(*)::int n FROM doctor_requests WHERE status='approved'`),
    count(`SELECT count(*)::int n FROM followups WHERE status='pending'`),
    trend('cases', 'created_at'),
    trend('cases', 'created_at', `status<>'closed'`),
    trend('referrals', 'created_at'),
    trend('doctor_requests', 'reviewed_at', `status='approved'`),
    trend('followups', 'created_at'),
    q('SELECT channel, count(*)::int count FROM cases GROUP BY channel ORDER BY count DESC'),
    q('SELECT status, count(*)::int count FROM cases GROUP BY status'),
    q(`SELECT a.*, u.name AS actor FROM activity_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 6`),
    q('SELECT * FROM cases ORDER BY updated_at DESC LIMIT 8'),
    q(`SELECT id, created_at FROM questions WHERE flagged AND status='open' ORDER BY id DESC LIMIT 3`),
    q(`SELECT f.id, c.code, to_char(f.due_date,'YYYY-MM-DD') due, f.due_date::timestamptz AS at
       FROM followups f JOIN cases c ON c.id=f.case_id
       WHERE f.status='pending' AND f.due_date < CURRENT_DATE ORDER BY f.due_date LIMIT 3`),
    q(`SELECT id, code, updated_at FROM cases WHERE need ILIKE '%transport%' AND status IN ('new','in_progress') ORDER BY id DESC LIMIT 2`),
    q(`SELECT id, created_at FROM call_requests WHERE status='pending' AND created_at < now() - interval '1 hour' ORDER BY id LIMIT 2`),
  ]);

  const alerts = [
    ...flagged.rows.map((r) => ({ key: 'q' + r.id, type: 'urgent', title: 'High-risk symptom detected', sub: `Question #${r.id} needs immediate review`, at: r.created_at, view: 'assistant' })),
    ...overdue.rows.map((r) => ({ key: 'f' + r.id, type: 'followup', title: 'Follow-up overdue', sub: `Case ${r.code}, due ${r.due}`, at: r.at, view: 'followup' })),
    ...transport.rows.map((r) => ({ key: 't' + r.id, type: 'transport', title: 'Transport support pending', sub: `Case ${r.code} is waiting for a partner`, at: r.updated_at, view: 'cases' })),
    ...calls.rows.map((r) => ({ key: 'c' + r.id, type: 'call', title: 'Call request waiting', sub: 'A patient has waited over an hour', at: r.created_at, view: 'calls' })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 5);

  res.json({
    stats: {
      total: { value: total, change: tTotal }, active: { value: active, change: tActive },
      referrals: { value: refs, change: tRefs }, appointments: { value: appts, change: tAppts },
      followups: { value: fups, change: tFups },
    },
    channels: channels.rows, statuses: statuses.rows, activity: activity.rows, recent: recent.rows, alerts,
  });
}));

admin.get('/search', h(async (req, res) => {
  const s = String(req.query.q || '').trim().slice(0, 60);
  if (s.length < 2) return res.json({ cases: [], patients: [], facilities: [] });
  const like = `%${s}%`;
  const [cases, patients, facilities] = await Promise.all([
    q(`SELECT id,code,patient_name,need,status FROM cases WHERE code ILIKE $1 OR patient_name ILIKE $1 OR phone ILIKE $1 ORDER BY updated_at DESC LIMIT 5`, [like]),
    q(`SELECT id,name,phone,email FROM users WHERE role='user' AND (name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1) LIMIT 5`, [like]),
    q(`SELECT id,name,district FROM facilities WHERE name ILIKE $1 OR district ILIKE $1 LIMIT 5`, [like]),
  ]);
  res.json({ cases: cases.rows, patients: patients.rows, facilities: facilities.rows });
}));

/* --- cases --- */
admin.get('/cases', h(async (req, res) => {
  const status = CASE_STATUS.includes(req.query.status) ? req.query.status : '';
  const s = String(req.query.q || '').trim().slice(0, 60);
  const { rows } = await q(
    `SELECT * FROM cases WHERE ($1='' OR status=$1) AND ($2='' OR patient_name ILIKE $3 OR code ILIKE $3 OR phone ILIKE $3)
     ORDER BY updated_at DESC LIMIT 200`, [status, s, `%${s}%`]);
  res.json(rows);
}));

admin.post('/cases', h(async (req, res) => {
  const name = String(req.body.patient_name || '').trim();
  const channel = CHANNELS.includes(req.body.channel) ? req.body.channel : 'community';
  if (name.length < 2) return res.status(400).json({ error: 'Enter the patient name.' });
  const c = await openCase({
    name, phone: req.body.phone ? normPhone(req.body.phone) : null, channel,
    need: String(req.body.need || 'Health information').slice(0, 80),
    priority: req.body.priority === 'high' ? 'high' : 'normal',
    notes: String(req.body.notes || '').slice(0, 1000) || null,
  });
  await log(req.user.id, 'case_added', 'case:' + c.code, channel);
  res.json(c);
}));

admin.get('/cases/:id', h(async (req, res) => {
  const c = (await q('SELECT * FROM cases WHERE id=$1', [req.params.id])).rows[0];
  if (!c) return res.status(404).json({ error: 'Case not found.' });
  const [refs, fups] = await Promise.all([
    q(`SELECT r.*, f.name AS facility FROM referrals r LEFT JOIN facilities f ON f.id=r.facility_id WHERE r.case_id=$1 ORDER BY r.id DESC`, [c.id]),
    q(`SELECT *, to_char(due_date,'YYYY-MM-DD') due FROM followups WHERE case_id=$1 ORDER BY id DESC`, [c.id]),
  ]);
  res.json({ case: c, referrals: refs.rows, followups: fups.rows });
}));

admin.patch('/cases/:id', h(async (req, res) => {
  const b = req.body;
  if (b.status && !CASE_STATUS.includes(b.status)) return res.status(400).json({ error: 'Invalid status.' });
  const { rows } = await q(
    `UPDATE cases SET status=COALESCE($1,status), assigned_to=COALESCE($2,assigned_to), notes=COALESCE($3,notes),
       priority=COALESCE($4,priority), updated_at=now() WHERE id=$5 RETURNING *`,
    [b.status || null, b.assigned_to ?? null, b.notes ?? null, ['normal', 'high'].includes(b.priority) ? b.priority : null, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Case not found.' });
  await log(req.user.id, 'case_updated', 'case:' + rows[0].code, b.status || null);
  res.json(rows[0]);
}));

admin.post('/cases/:id/summary', h(async (req, res) => {
  const c = (await q('SELECT * FROM cases WHERE id=$1', [req.params.id])).rows[0];
  if (!c) return res.status(404).json({ error: 'Case not found.' });
  const prompt = `Summarise this case in 3 short lines for a health worker and suggest one next step.\n` +
    `Patient: ${c.patient_name}\nChannel: ${c.channel}\nSupport needed: ${c.need}\nStatus: ${c.status}\nPriority: ${c.priority}\n` +
    `Details: ${c.ai_summary || ''} ${c.notes || ''}`;
  const summary = await askAI(prompt, SYS_STAFF, `Case ${c.code}: ${c.need} via ${c.channel}. Status: ${c.status}. Priority: ${c.priority}.`, 300);
  const { rows } = await q('UPDATE cases SET ai_summary=$1, updated_at=now() WHERE id=$2 RETURNING *', [summary, c.id]);
  await log(req.user.id, 'ai_summary_completed', 'case:' + c.code, null);
  res.json(rows[0]);
}));

/* --- referrals --- */
admin.get('/referrals', h(async (_req, res) => {
  const { rows } = await q(
    `SELECT r.*, c.code, c.patient_name, f.name AS facility FROM referrals r
     JOIN cases c ON c.id=r.case_id LEFT JOIN facilities f ON f.id=r.facility_id ORDER BY r.id DESC LIMIT 200`);
  res.json(rows);
}));

admin.post('/referrals', h(async (req, res) => {
  const c = await findCase(req.body);
  if (!c) return res.status(404).json({ error: 'Case not found. Check the case ID.' });
  const facilityId = Number(req.body.facility_id) || null;
  const reason = String(req.body.reason || '').trim().slice(0, 300) || c.need;
  const { rows } = await q(
    'INSERT INTO referrals(case_id,facility_id,reason,created_by) VALUES($1,$2,$3,$4) RETURNING *',
    [c.id, facilityId, reason, String(req.user.id)]);
  await q(`UPDATE cases SET status='referred', updated_at=now() WHERE id=$1`, [c.id]);
  const f = facilityId ? (await q('SELECT name FROM facilities WHERE id=$1', [facilityId])).rows[0] : null;
  const text = `You have been referred${f ? ' to ' + f.name : ''}. Please visit as soon as you can. Reply to this message if you need transport help.`;
  if (c.user_id) await notify(c.user_id, 'info', 'You have a referral', text);
  if (c.phone) await sendSms(c.phone, 'Mama Care: ' + text, null);
  await log(req.user.id, 'referral_assigned', 'case:' + c.code, f?.name || null);
  res.json(rows[0]);
}));

admin.patch('/referrals/:id', h(async (req, res) => {
  if (!['pending', 'completed'].includes(req.body.status)) return res.status(400).json({ error: 'Invalid status.' });
  const { rows } = await q('UPDATE referrals SET status=$1 WHERE id=$2 RETURNING *', [req.body.status, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Referral not found.' });
  await log(req.user.id, 'referral_' + req.body.status, 'referral:' + rows[0].id, null);
  res.json(rows[0]);
}));

/* --- follow-ups --- */
admin.get('/followups', h(async (_req, res) => {
  const { rows } = await q(
    `SELECT f.id, f.case_id, f.note, f.status, f.created_at, to_char(f.due_date,'YYYY-MM-DD') due,
            (f.status='pending' AND f.due_date < CURRENT_DATE) AS overdue, c.code, c.patient_name, c.phone
     FROM followups f JOIN cases c ON c.id=f.case_id
     ORDER BY (f.status='pending') DESC, f.due_date LIMIT 200`);
  res.json(rows);
}));

admin.post('/followups', h(async (req, res) => {
  const c = await findCase(req.body);
  if (!c) return res.status(404).json({ error: 'Case not found. Check the case ID.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(req.body.due_date || ''))) return res.status(400).json({ error: 'Choose a follow-up date.' });
  const { rows } = await q('INSERT INTO followups(case_id,due_date,note) VALUES($1,$2,$3) RETURNING *',
    [c.id, req.body.due_date, String(req.body.note || '').slice(0, 300) || null]);
  await q(`UPDATE cases SET status='awaiting_followup', updated_at=now() WHERE id=$1`, [c.id]);
  await log(req.user.id, 'followup_scheduled', 'case:' + c.code, req.body.due_date);
  res.json(rows[0]);
}));

admin.patch('/followups/:id', h(async (req, res) => {
  if (!['pending', 'done'].includes(req.body.status)) return res.status(400).json({ error: 'Invalid status.' });
  const { rows } = await q('UPDATE followups SET status=$1 WHERE id=$2 RETURNING *', [req.body.status, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Follow-up not found.' });
  await log(req.user.id, 'followup_' + req.body.status, 'followup:' + rows[0].id, null);
  res.json(rows[0]);
}));

admin.post('/followups/:id/message', h(async (req, res) => {
  const f = (await q(`SELECT f.*, c.phone, c.user_id, c.code FROM followups f JOIN cases c ON c.id=f.case_id WHERE f.id=$1`, [req.params.id])).rows[0];
  if (!f) return res.status(404).json({ error: 'Follow-up not found.' });
  if (!f.phone) return res.status(400).json({ error: 'This patient has no phone number saved.' });
  await sendSms(f.phone, 'Mama Care: this is a friendly follow-up. How are you feeling? Reply here or call us if you need help.', null);
  await log(req.user.id, 'followup_message_sent', 'case:' + f.code, null);
  res.json({ ok: true });
}));

/* --- patients + facilities --- */
admin.get('/patients', h(async (req, res) => {
  const s = String(req.query.q || '').trim().slice(0, 60);
  const { rows } = await q(
    `SELECT u.id,u.name,u.phone,u.email,u.source,u.created_at,u.last_login,
            (SELECT count(*)::int FROM cases c WHERE c.user_id=u.id::text) AS cases
     FROM users u WHERE u.role='user' AND ($1='' OR u.name ILIKE $2 OR u.phone ILIKE $2 OR u.email ILIKE $2)
     ORDER BY u.id DESC LIMIT 200`, [s, `%${s}%`]);
  res.json(rows);
}));

admin.post('/facilities', h(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (name.length < 3) return res.status(400).json({ error: 'Enter the facility name.' });
  const { rows } = await q('INSERT INTO facilities(name,district,type,phone) VALUES($1,$2,$3,$4) RETURNING *',
    [name.slice(0, 120), String(req.body.district || '').slice(0, 80) || null, String(req.body.type || 'Health facility').slice(0, 60),
      req.body.phone ? normPhone(req.body.phone) : null]);
  await log(req.user.id, 'facility_added', 'facility:' + rows[0].id, name);
  res.json(rows[0]);
}));
admin.delete('/facilities/:id', h(async (req, res) => {
  await q('DELETE FROM facilities WHERE id=$1', [req.params.id]);
  await log(req.user.id, 'facility_removed', 'facility:' + req.params.id, null);
  res.json({ ok: true });
}));

/* --- staff AI assistant --- */
admin.post('/assistant', h(async (req, res) => {
  const text = String(req.body.text || '').trim().slice(0, 1500);
  if (!text) return res.status(400).json({ error: 'Write a message first.' });
  res.json({ answer: await askAI(text, SYS_STAFF, FALLBACK_STAFF, 600) });
}));

/* --- questions, sms, calls, ussd --- */
admin.get('/questions', h(async (req, res) => {
  const { rows } = await q(
    `SELECT qu.*, u.name FROM questions qu LEFT JOIN users u ON u.id=qu.user_id
     WHERE ($1::boolean IS FALSE OR qu.flagged) ORDER BY qu.id DESC LIMIT 200`, [req.query.flagged === '1']);
  res.json(rows);
}));
admin.patch('/questions/:id', h(async (req, res) => {
  const { rows } = await q(`UPDATE questions SET status='resolved' WHERE id=$1 RETURNING *`, [req.params.id]);
  await log(req.user.id, 'question_resolved', 'question:' + req.params.id, null);
  res.json(rows[0]);
}));

admin.get('/sms', h(async (_req, res) => {
  const { rows } = await q(
    `SELECT s.*, u.name FROM sms_messages s LEFT JOIN users u ON u.id=s.user_id ORDER BY s.id DESC LIMIT 200`);
  res.json(rows);
}));
admin.post('/sms', h(async (req, res) => {
  const phone = normPhone(req.body.phone);
  const body = String(req.body.body || '').trim().slice(0, 300);
  if (!phone || !body) return res.status(400).json({ error: 'Enter a phone number and a message.' });
  const { rows } = await q('SELECT id FROM users WHERE phone=$1', [phone]);
  await sendSms(phone, body, rows[0]?.id || null);
  await log(req.user.id, 'sms_sent', phone, null);
  res.json({ ok: true });
}));

admin.get('/ussd', h(async (_req, res) => {
  res.json((await q('SELECT * FROM ussd_logs ORDER BY id DESC LIMIT 200')).rows);
}));

admin.get('/calls', h(async (_req, res) => {
  const { rows } = await q(
    `SELECT c.*, u.name, u.phone FROM call_requests c JOIN users u ON u.id=c.user_id ORDER BY c.id DESC LIMIT 200`);
  res.json(rows);
}));
admin.patch('/calls/:id', h(async (req, res) => {
  const { status, transcript } = req.body;
  if (status && !['contacted', 'done'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const { rows } = await q(
    'UPDATE call_requests SET status=COALESCE($1,status), transcript=COALESCE($2,transcript) WHERE id=$3 RETURNING *',
    [status || null, transcript == null ? null : String(transcript).slice(0, 5000), req.params.id]);
  await log(req.user.id, status ? 'call_' + status : 'call_transcript_saved', 'call:' + req.params.id, null);
  res.json(rows[0]);
}));

/* --- users, activity, reports, system --- */
admin.get('/users', h(async (_req, res) => {
  const { rows } = await q('SELECT id,name,phone,email,role,source,created_at,last_login FROM users ORDER BY id DESC LIMIT 200');
  res.json(rows);
}));
admin.get('/activity', h(async (_req, res) => {
  const { rows } = await q(
    `SELECT a.*, u.name AS actor FROM activity_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 200`);
  res.json(rows);
}));

admin.get('/reports', h(async (req, res) => {
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const since = 'created_at >= now() - make_interval(days => $1::int)';
  const [total, closed, byChannel, byNeed, byStatus, daily] = await Promise.all([
    count(`SELECT count(*)::int n FROM cases WHERE ${since}`, [days]),
    count(`SELECT count(*)::int n FROM cases WHERE status='closed' AND ${since}`, [days]),
    q(`SELECT channel AS label, count(*)::int count FROM cases WHERE ${since} GROUP BY 1 ORDER BY 2 DESC`, [days]),
    q(`SELECT need AS label, count(*)::int count FROM cases WHERE ${since} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, [days]),
    q(`SELECT status AS label, count(*)::int count FROM cases WHERE ${since} GROUP BY 1 ORDER BY 2 DESC`, [days]),
    q(`SELECT to_char(created_at::date,'YYYY-MM-DD') AS label, count(*)::int count FROM cases WHERE ${since} GROUP BY 1 ORDER BY 1`, [days]),
  ]);
  res.json({ days, total, closed, byChannel: byChannel.rows, byNeed: byNeed.rows, byStatus: byStatus.rows, daily: daily.rows });
}));

admin.get('/reports/cases.csv', h(async (_req, res) => {
  const { rows } = await q(
    `SELECT code,patient_name,phone,channel,need,status,priority,assigned_to,created_at FROM cases ORDER BY id DESC`);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['code', 'patient_name', 'phone', 'channel', 'need', 'status', 'priority', 'assigned_to', 'created_at'];
  const csv = [head.join(','), ...rows.map((r) => head.map((k) => esc(r[k])).join(','))].join('\n');
  res.type('text/csv').send(csv);
}));

admin.get('/system', h(async (_req, res) => {
  res.json({
    ai: !!process.env.AI_API_KEY, model: process.env.AI_MODEL || 'claude-sonnet-5-5',
    sms: !!process.env.AT_API_KEY, google: !!process.env.GOOGLE_CLIENT_ID, ussd: !!process.env.SMS_WEBHOOK_KEY,
  });
}));

app.use('/api/admin', admin);

/* ---------------- errors + start ---------------- */
app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

async function seedAdmin() {
  const { ADMIN_NAME, ADMIN_PHONE, ADMIN_PIN } = process.env;
  if (!ADMIN_PHONE || !ADMIN_PIN) return;
  const phone = normPhone(ADMIN_PHONE);
  await q(
    `INSERT INTO users(name,phone,pin_hash,role,source) VALUES($1,$2,$3,'admin','web')
     ON CONFLICT (phone) DO UPDATE SET role='admin', pin_hash=EXCLUDED.pin_hash`,
    [ADMIN_NAME || 'Admin', phone, await bcrypt.hash(ADMIN_PIN, 10)]);
  console.log('Admin ready:', phone);
}

(async () => {
  try { await ensureSchema(); await seedAdmin(); }
  catch (e) { console.error('Setup error:', e.message); }
})();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Mama Care API running on http://localhost:${PORT}`));