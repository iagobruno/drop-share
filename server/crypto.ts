import archiver from 'archiver';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import type { Transform } from 'node:stream';
import type { ShareMetadata } from './types.js';

const SERVER_SECRET = process.env.SERVER_ENCRYPTION_KEY ?? 'development-only-secret-change-me';
const PBKDF2_ITERATIONS = 210_000;

export type EncryptionResult = {
  key: Buffer;
  salt: string;
  iv: string;
  authTag: string;
};

export function ensureEncryptionConfiguration() {
  if (process.env.NODE_ENV === 'production' && !process.env.SERVER_ENCRYPTION_KEY) {
    throw new Error('SERVER_ENCRYPTION_KEY é obrigatório em produção.');
  }
}

function safeFilename(value: string, used: Set<string>) {
  const base =
    path
      .basename(value)
      .replace(/[\\/:*?"<>|\x00-\x1F]/g, '_')
      .trim() || 'arquivo';
  const extension = path.extname(base);
  const stem = path.basename(base, extension);
  let candidate = base.slice(0, 200);
  let index = 2;

  while (used.has(candidate.toLowerCase())) {
    candidate = `${stem.slice(0, 180)} (${index++})${extension}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function deriveKey(material: string, salt: Buffer) {
  return pbkdf2Sync(material, salt, PBKDF2_ITERATIONS, 32, 'sha512');
}

export function createPasswordCheck(key: Buffer) {
  return createHmac('sha256', key).update('drop-share-password-check').digest('base64');
}

export function getDecryptionKey(metadata: ShareMetadata, password?: string) {
  if (metadata.passwordProtected && !password) return null;
  const material = metadata.passwordProtected ? password! : SERVER_SECRET;
  return deriveKey(material, Buffer.from(metadata.salt, 'base64'));
}

export function passwordMatches(metadata: ShareMetadata, key: Buffer) {
  if (!metadata.passwordProtected) return true;

  const expected = Buffer.from(metadata.passwordCheck ?? '', 'base64');
  const actual = Buffer.from(createPasswordCheck(key), 'base64');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function encryptFiles(
  files: Express.Multer.File[],
  target: string,
  password?: string,
): Promise<EncryptionResult> {
  const salt = randomBytes(16);
  const key = deriveKey(password || SERVER_SECRET, salt);
  const iv = randomBytes(12);
  const archive = archiver('zip', { zlib: { level: 9 } });
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const output = createWriteStream(target);
  const usedNames = new Set<string>();

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const fail = (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    archive.on('error', fail);
    cipher.on('error', fail);
    output.on('error', fail);
    output.on('close', finish);
    archive.pipe(cipher).pipe(output);

    for (const file of files) {
      archive.append(createReadStream(file.path), {
        name: safeFilename(file.originalname, usedNames),
      });
    }
    archive.finalize().catch(fail);
  });

  return {
    key,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

export function createDecryptionStream(metadata: ShareMetadata, key: Buffer): Transform {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(metadata.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(metadata.authTag, 'base64'));
  return decipher;
}
