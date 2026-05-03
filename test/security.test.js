const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, sanitizeText } = require('../src/lib/security');

test('hashPassword + verifyPassword success/failure', () => {
  const hashed = hashPassword('SangatAman123!');
  assert.equal(verifyPassword('SangatAman123!', hashed), true);
  assert.equal(verifyPassword('salah', hashed), false);
});

test('verifyPassword fallback plain mode', () => {
  assert.equal(verifyPassword('admin123', '', 'admin123'), true);
  assert.equal(verifyPassword('wrong', '', 'admin123'), false);
});

test('sanitizeText trims, normalizes spaces, and truncates', () => {
  const input = '  Halo    dunia   radio internal      ';
  assert.equal(sanitizeText(input, 'fallback', 20), 'Halo dunia radio int');
  assert.equal(sanitizeText('', 'fallback', 20), 'fallback');
});
