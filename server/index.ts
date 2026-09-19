import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import ViteExpress from 'vite-express';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  createDecryptionStream,
  createPasswordCheck,
  encryptFiles,
  ensureEncryptionConfiguration,
  getDecryptionKey,
  passwordMatches,
} from './crypto.js';
import {
  ensureStorage,
  encryptedFileExists,
  deleteShare,
  purgeExpiredShares,
  readShare,
  sharePaths,
  UPLOADS_DIR,
  removeUploads,
} from './storage.js';
import type { Expiration, ShareMetadata } from './types.js';

const PORT = Number(process.env.PORT ?? 3000);
const MAX_SHARE_SIZE = 1024 * 1024 * 1024;
const DOWNLOAD_LOCKS = new Set<string>();
const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: MAX_SHARE_SIZE, files: 100 },
});

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));

function validId(value: string) {
  return /^[a-f0-9-]{36}$/i.test(value);
}

app.post('/api/shares', upload.array('files', 100), async (req, res, next) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  try {
    const expiration = req.body.expiration as Expiration;
    const password = typeof req.body.password === 'string' ? req.body.password : undefined;
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (!files.length) return res.status(400).json({ error: 'Selecione ao menos um arquivo.' });
    if (totalBytes > MAX_SHARE_SIZE)
      return res.status(413).json({ error: 'O limite do compartilhamento é 1 GB.' });
    if (expiration !== 'one-download' && expiration !== 'one-day')
      return res.status(400).json({ error: 'Expiração inválida.' });
    if (password && (password.length < 4 || password.length > 256))
      return res.status(400).json({ error: 'A senha deve ter entre 4 e 256 caracteres.' });

    const id = randomUUID();
    const cryptography = await encryptFiles(files, sharePaths(id).encrypted, password);
    const encryptedSize = (await stat(sharePaths(id).encrypted)).size;
    if (encryptedSize > MAX_SHARE_SIZE) {
      await deleteShare(id);
      return res.status(413).json({ error: 'O ZIP final ultrapassou o limite de 1 GB.' });
    }
    const metadata: ShareMetadata = {
      id,
      createdAt: new Date().toISOString(),
      expiresAt: expiration === 'one-day' ? new Date(Date.now() + 86_400_000).toISOString() : null,
      expiration,
      passwordProtected: Boolean(password),
      passwordCheck: password ? createPasswordCheck(cryptography.key) : undefined,
      salt: cryptography.salt,
      iv: cryptography.iv,
      authTag: cryptography.authTag,
      fileCount: files.length,
      originalBytes: totalBytes,
    };
    await writeFile(sharePaths(id).metadata, JSON.stringify(metadata), { mode: 0o600 });
    res.status(201).json({ id, url: `${req.protocol}://${req.get('host')}/s/${id}` });
  } catch (error) {
    next(error);
  } finally {
    await removeUploads(files);
  }
});

app.get('/api/shares/:id', async (req, res) => {
  const id = String(req.params.id);
  if (!validId(id)) return res.status(404).end();
  const share = await readShare(id);
  if (
    !share ||
    !(await encryptedFileExists(share.id)) ||
    (share.expiresAt && new Date(share.expiresAt).getTime() <= Date.now())
  ) {
    await deleteShare(id);
    return res.status(404).json({ error: 'Este link não está mais disponível.' });
  }
  res.json({
    passwordProtected: share.passwordProtected,
    expiresAt: share.expiresAt,
    fileCount: share.fileCount,
    expiration: share.expiration,
  });
});

app.post('/api/shares/:id/download', async (req: Request, res: Response, next: NextFunction) => {
  const id = String(req.params.id);
  if (!validId(id) || DOWNLOAD_LOCKS.has(id))
    return res.status(404).json({ error: 'Este link não está mais disponível.' });
  const share = await readShare(id);
  if (
    !share ||
    !(await encryptedFileExists(id)) ||
    (share.expiresAt && new Date(share.expiresAt).getTime() <= Date.now())
  ) {
    await deleteShare(id);
    return res.status(404).json({ error: 'Este link não está mais disponível.' });
  }
  const password = typeof req.body?.password === 'string' ? req.body.password : undefined;
  const key = getDecryptionKey(share, password);
  if (!key) return res.status(401).json({ error: 'Informe a senha do link.' });

  if (!passwordMatches(share, key)) {
    return res.status(401).json({ error: 'Senha incorreta.' });
  }
  DOWNLOAD_LOCKS.add(id);
  try {
    const decipher = createDecryptionStream(share, key);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="drop-share.zip"');
    res.setHeader('Cache-Control', 'no-store');
    const cleanup = async () => {
      if (share.expiration === 'one-download') await deleteShare(id);
      DOWNLOAD_LOCKS.delete(id);
    };
    res.once('close', () => void cleanup());
    await pipeline(createReadStream(sharePaths(id).encrypted), decipher, res);
    if (share.expiration !== 'one-download') DOWNLOAD_LOCKS.delete(id);
  } catch (error) {
    DOWNLOAD_LOCKS.delete(id);
    if (!res.headersSent) next(error);
    else res.destroy(error as Error);
  }
});

// vite-express handles SPA history fallback in development. Its production static
// middleware needs this explicit public-link route so shared URLs work directly.
if (process.env.NODE_ENV === 'production') {
  app.get('/s/:id', (_req, res) => res.sendFile(path.resolve('dist/client/index.html')));
}

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  const temporaryFiles = (req.files as Express.Multer.File[] | undefined) ?? [];
  void removeUploads(temporaryFiles);
  const multerError = error as multer.MulterError;
  if (multerError instanceof multer.MulterError) {
    return res.status(413).json({
      error:
        multerError.code === 'LIMIT_FILE_SIZE'
          ? 'Cada arquivo pode ter no máximo 1 GB.'
          : 'Limite de upload excedido.',
    });
  }
  console.error(error);
  res.status(500).json({ error: 'Não foi possível criar o compartilhamento.' });
});

await ensureStorage();
ensureEncryptionConfiguration();
await purgeExpiredShares();
setInterval(() => void purgeExpiredShares(), 15 * 60 * 1000).unref();

ViteExpress.config({
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  viteConfigFile: 'vite.config.ts',
  ignorePaths: /^\/api\//,
});
ViteExpress.listen(app, PORT, () => console.log(`Drop Share em http://localhost:${PORT}`));
