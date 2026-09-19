import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ShareMetadata } from './types.js';

export const STORAGE_ROOT = path.resolve('storage');
export const UPLOADS_DIR = path.join(STORAGE_ROOT, 'uploads');
export const SHARES_DIR = path.join(STORAGE_ROOT, 'shares');

export const sharePaths = (id: string) => ({
  encrypted: path.join(SHARES_DIR, `${id}.zip.enc`),
  metadata: path.join(SHARES_DIR, `${id}.json`),
});

export function removeUploads(files: Express.Multer.File[]) {
  return Promise.all(files.map((file) => rm(file.path, { force: true })));
}

export async function ensureStorage() {
  await Promise.all([
    mkdir(UPLOADS_DIR, { recursive: true }),
    mkdir(SHARES_DIR, { recursive: true }),
  ]);
}

export async function readShare(id: string): Promise<ShareMetadata | null> {
  try {
    return JSON.parse(await readFile(sharePaths(id).metadata, 'utf8')) as ShareMetadata;
  } catch {
    return null;
  }
}

export async function deleteShare(id: string) {
  const paths = sharePaths(id);
  await Promise.all([rm(paths.encrypted, { force: true }), rm(paths.metadata, { force: true })]);
}

export async function purgeExpiredShares() {
  const names = await readdir(SHARES_DIR).catch(() => [] as string[]);
  await Promise.all(
    names
      .filter((name) => name.endsWith('.json'))
      .map(async (name) => {
        const id = name.slice(0, -5);
        const metadata = await readShare(id);
        if (
          !metadata ||
          (metadata.expiresAt && new Date(metadata.expiresAt).getTime() <= Date.now())
        ) {
          await deleteShare(id);
        }
      }),
  );
}

export async function encryptedFileExists(id: string) {
  try {
    return (await stat(sharePaths(id).encrypted)).isFile();
  } catch {
    return false;
  }
}
