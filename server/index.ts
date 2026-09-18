import "dotenv/config";
import archiver from "archiver";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import ViteExpress from "vite-express";
import { createCipheriv, createDecipheriv, createHmac, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { ensureStorage, encryptedFileExists, deleteShare, purgeExpiredShares, readShare, sharePaths, UPLOADS_DIR } from "./storage.js";
import type { Expiration, ShareMetadata } from "./types.js";

const PORT = Number(process.env.PORT ?? 3000);
const MAX_SHARE_SIZE = 1024 * 1024 * 1024;
const DOWNLOAD_LOCKS = new Set<string>();
const SERVER_SECRET = process.env.SERVER_ENCRYPTION_KEY ?? "development-only-secret-change-me";

if (process.env.NODE_ENV === "production" && !process.env.SERVER_ENCRYPTION_KEY) {
  throw new Error("SERVER_ENCRYPTION_KEY é obrigatório em produção.");
}

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: MAX_SHARE_SIZE, files: 100 },
});

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

function validId(value: string) {
  return /^[a-f0-9-]{36}$/i.test(value);
}

function safeFilename(value: string, used: Set<string>) {
  const base = path.basename(value).replace(/[\\/:*?"<>|\x00-\x1F]/g, "_").trim() || "arquivo";
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

function deriveKey(metadata: ShareMetadata, password?: string) {
  if (metadata.passwordProtected && !password) return null;
  const material = metadata.passwordProtected ? password! : SERVER_SECRET;
  return pbkdf2Sync(material, Buffer.from(metadata.salt, "base64"), 210_000, 32, "sha512");
}

function passwordCheck(key: Buffer) {
  return createHmac("sha256", key).update("drop-share-password-check").digest("base64");
}

function removeUploads(files: Express.Multer.File[]) {
  return Promise.all(files.map((file) => rm(file.path, { force: true })));
}

async function encryptShare(files: Express.Multer.File[], id: string, password: string | undefined) {
  const salt = randomBytes(16);
  const key = pbkdf2Sync(password || SERVER_SECRET, salt, 210_000, 32, "sha512");
  const target = sharePaths(id).encrypted;
  const iv = randomBytes(12);
  const archive = archiver("zip", { zlib: { level: 9 } });
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const output = createWriteStream(target);
  const usedNames = new Set<string>();

  await new Promise<void>((resolve, reject) => {
    const fail = (error: Error) => reject(error);
    archive.on("error", fail);
    cipher.on("error", fail);
    output.on("error", fail);
    output.on("close", resolve);
    archive.pipe(cipher).pipe(output);
    for (const file of files) archive.append(createReadStream(file.path), { name: safeFilename(file.originalname, usedNames) });
    archive.finalize().catch(fail);
  });

  return { key, salt: salt.toString("base64"), iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}

app.post("/api/shares", upload.array("files", 100), async (req, res, next) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  try {
    const expiration = req.body.expiration as Expiration;
    const password = typeof req.body.password === "string" ? req.body.password : undefined;
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (!files.length) return res.status(400).json({ error: "Selecione ao menos um arquivo." });
    if (totalBytes > MAX_SHARE_SIZE) return res.status(413).json({ error: "O limite do compartilhamento é 1 GB." });
    if (expiration !== "one-download" && expiration !== "one-day") return res.status(400).json({ error: "Expiração inválida." });
    if (password && (password.length < 4 || password.length > 256)) return res.status(400).json({ error: "A senha deve ter entre 4 e 256 caracteres." });

    const id = randomUUID();
    const cryptography = await encryptShare(files, id, password);
    const encryptedSize = (await stat(sharePaths(id).encrypted)).size;
    if (encryptedSize > MAX_SHARE_SIZE) {
      await deleteShare(id);
      return res.status(413).json({ error: "O ZIP final ultrapassou o limite de 1 GB." });
    }
    const metadata: ShareMetadata = {
      id,
      createdAt: new Date().toISOString(),
      expiresAt: expiration === "one-day" ? new Date(Date.now() + 86_400_000).toISOString() : null,
      expiration,
      passwordProtected: Boolean(password),
      passwordCheck: password ? passwordCheck(cryptography.key) : undefined,
      salt: cryptography.salt,
      iv: cryptography.iv,
      authTag: cryptography.authTag,
      fileCount: files.length,
      originalBytes: totalBytes,
    };
    await writeFile(sharePaths(id).metadata, JSON.stringify(metadata), { mode: 0o600 });
    res.status(201).json({ id, url: `${req.protocol}://${req.get("host")}/s/${id}` });
  } catch (error) {
    next(error);
  } finally {
    await removeUploads(files);
  }
});

app.get("/api/shares/:id", async (req, res) => {
  const id = String(req.params.id);
  if (!validId(id)) return res.status(404).end();
  const share = await readShare(id);
  if (!share || !await encryptedFileExists(share.id) || (share.expiresAt && new Date(share.expiresAt).getTime() <= Date.now())) {
    await deleteShare(id);
    return res.status(404).json({ error: "Este link não está mais disponível." });
  }
  res.json({ passwordProtected: share.passwordProtected, expiresAt: share.expiresAt, fileCount: share.fileCount, expiration: share.expiration });
});

app.post("/api/shares/:id/download", async (req: Request, res: Response, next: NextFunction) => {
  const id = String(req.params.id);
  if (!validId(id) || DOWNLOAD_LOCKS.has(id)) return res.status(404).json({ error: "Este link não está mais disponível." });
  const share = await readShare(id);
  if (!share || !await encryptedFileExists(id) || (share.expiresAt && new Date(share.expiresAt).getTime() <= Date.now())) {
    await deleteShare(id);
    return res.status(404).json({ error: "Este link não está mais disponível." });
  }
  const password = typeof req.body?.password === "string" ? req.body.password : undefined;
  const key = deriveKey(share, password);
  if (!key) return res.status(401).json({ error: "Informe a senha do link." });

  // Reject a wrong password before starting the file stream.
  try {
    if (share.passwordProtected) {
      const expected = Buffer.from(share.passwordCheck ?? "", "base64");
      const actual = Buffer.from(passwordCheck(key), "base64");
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        return res.status(401).json({ error: "Senha incorreta." });
      }
    }
  } catch {
    return res.status(500).json({ error: "Compartilhamento corrompido." });
  }
  DOWNLOAD_LOCKS.add(id);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(share.iv, "base64"));
    decipher.setAuthTag(Buffer.from(share.authTag, "base64"));
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="drop-share.zip"');
    res.setHeader("Cache-Control", "no-store");
    const cleanup = async () => {
      if (share.expiration === "one-download") await deleteShare(id);
      DOWNLOAD_LOCKS.delete(id);
    };
    res.once("close", () => void cleanup());
    await pipeline(createReadStream(sharePaths(id).encrypted), decipher, res);
    if (share.expiration !== "one-download") DOWNLOAD_LOCKS.delete(id);
  } catch (error) {
    DOWNLOAD_LOCKS.delete(id);
    if (!res.headersSent) next(error);
    else res.destroy(error as Error);
  }
});

// vite-express handles SPA history fallback in development. Its production static
// middleware needs this explicit public-link route so shared URLs work directly.
if (process.env.NODE_ENV === "production") {
  app.get("/s/:id", (_req, res) => res.sendFile(path.resolve("dist/client/index.html")));
}

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  const temporaryFiles = (req.files as Express.Multer.File[] | undefined) ?? [];
  void removeUploads(temporaryFiles);
  const multerError = error as multer.MulterError;
  if (multerError instanceof multer.MulterError) {
    return res.status(413).json({ error: multerError.code === "LIMIT_FILE_SIZE" ? "Cada arquivo pode ter no máximo 1 GB." : "Limite de upload excedido." });
  }
  console.error(error);
  res.status(500).json({ error: "Não foi possível criar o compartilhamento." });
});

await ensureStorage();
await purgeExpiredShares();
setInterval(() => void purgeExpiredShares(), 15 * 60 * 1000).unref();

ViteExpress.config({
  mode: process.env.NODE_ENV === "production" ? "production" : "development",
  viteConfigFile: "vite.config.ts",
  ignorePaths: /^\/api\//,
});
ViteExpress.listen(app, PORT, () => console.log(`Drop Share em http://localhost:${PORT}`));
