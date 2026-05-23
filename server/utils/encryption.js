const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';

// Derive a guaranteed 32-byte key by hashing the env value with SHA-256.
// This means any length key in .env will always produce a valid AES-256 key.
const rawKey = process.env.ENCRYPTION_KEY || 'J0bbieEncrypt32CharacterKey2026X';
const KEY = crypto.createHash('sha256').update(rawKey).digest();

const encrypt = (text) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
};

const decrypt = (encryptedText) => {
  const [ivHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

module.exports = { encrypt, decrypt };
