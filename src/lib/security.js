const crypto = require('crypto');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored, fallbackPlain = '') {
  if (!stored?.includes(':')) return password === fallbackPlain;
  const [salt, known] = stored.split(':');
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(known));
}

function sanitizeText(value, fallback, max = 120) {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, max);
}

module.exports = {
  hashPassword,
  verifyPassword,
  sanitizeText,
};
