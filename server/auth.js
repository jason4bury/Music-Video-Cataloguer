const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('./db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL
  );
`);

// Passwords that only ever appeared as examples. The app refuses to start with one of these
// rather than create (or keep) an account anyone could guess.
const EXAMPLE_PASSWORDS = new Set(['changeme', 'change-me', 'password', 'admin']);
const MIN_PASSWORD_LENGTH = 8;

class SettingsError extends Error {}

// Works out the sign-in account from AUTH_USERNAME / AUTH_PASSWORD:
// - AUTH_PASSWORD set: the account always matches .env. Changing the password (or username) in
//   .env and restarting the container changes it in the app too.
// - AUTH_PASSWORD blank, first start: a random password is generated and printed once to the log.
// - AUTH_PASSWORD blank, later starts: the existing account is kept as it is.
// Throws a SettingsError (index.js prints it and exits) if the password is an example value or
// too short.
function ensureAccount() {
  const username = (process.env.AUTH_USERNAME || '').trim() || 'admin';
  const password = process.env.AUTH_PASSWORD || '';
  const existing = db.prepare('SELECT * FROM users ORDER BY id LIMIT 1').get();

  if (password) {
    if (EXAMPLE_PASSWORDS.has(password.toLowerCase())) {
      throw new SettingsError(
        `AUTH_PASSWORD is still the example value "${password}". Set your own password in .env, or leave it blank to have one generated.`
      );
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new SettingsError(`AUTH_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    const hash = bcrypt.hashSync(password, 10);
    if (!existing) {
      db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
      console.log(`Sign-in account "${username}" created from AUTH_USERNAME / AUTH_PASSWORD.`);
      return;
    }
    const changed = existing.username !== username || !bcrypt.compareSync(password, existing.password_hash);
    if (changed) {
      db.prepare('UPDATE users SET username = ?, password_hash = ? WHERE id = ?').run(username, hash, existing.id);
      // Anyone signed in with the old details has to sign in again.
      db.prepare('DELETE FROM sessions').run();
      console.log(`Sign-in account updated from .env (username "${username}"). Existing sessions were signed out.`);
    }
    return;
  }

  if (existing) {
    if (bcrypt.compareSync('changeme', existing.password_hash)) {
      throw new SettingsError(
        'The sign-in account still has the old example password "changeme". Set AUTH_PASSWORD in .env to your own password and restart.'
      );
    }
    return;
  }

  const generated = crypto.randomBytes(12).toString('base64url');
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, bcrypt.hashSync(generated, 10));
  console.log('='.repeat(64));
  console.log('No sign-in account found, so one was created:');
  console.log(`  username: ${username}`);
  console.log(`  password: ${generated}`);
  console.log('Note it down: it is only shown this once. Set AUTH_PASSWORD in .env');
  console.log('to choose your own instead.');
  console.log('='.repeat(64));
}

// Simple per-address brake on password guessing: after MAX_FAILURES wrong attempts within
// WINDOW_MS, further attempts from that address get a 429 until the window passes. In memory
// only, which is fine for a single-process app: a restart just clears the counters.
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map(); // ip -> { count, first }

function isLockedOut(ip) {
  const entry = failures.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    failures.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function noteFailure(ip) {
  const entry = failures.get(ip);
  if (!entry || Date.now() - entry.first > WINDOW_MS) {
    failures.set(ip, { count: 1, first: Date.now() });
  } else {
    entry.count++;
  }
}

// Compared against when the username doesn't exist, so a wrong username takes as long as a wrong
// password and the response time doesn't reveal which one was wrong.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);

async function verifyCredentials(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) return null;
  const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username.trim());
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  return ok && user ? user : null;
}

async function login(req, res, next) {
  const ip = req.ip;
  if (isLockedOut(ip)) {
    return res.status(429).json({ error: 'Too many failed sign-in attempts. Try again in 15 minutes.' });
  }
  const { username, password } = req.body || {};
  let user;
  try {
    user = await verifyCredentials(username, password);
  } catch (err) {
    return next(err);
  }
  if (!user) {
    noteFailure(ip);
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  failures.delete(ip);
  // New session ID on sign-in, so a session ID picked up before login can't be reused after it.
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ ok: true });
  });
  return undefined;
}

module.exports = { ensureAccount, login, SettingsError };
