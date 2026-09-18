export type Expiration = "one-download" | "one-day";

export interface ShareMetadata {
  id: string;
  createdAt: string;
  expiresAt: string | null;
  expiration: Expiration;
  passwordProtected: boolean;
  passwordCheck?: string;
  salt: string;
  iv: string;
  authTag: string;
  fileCount: number;
  originalBytes: number;
}
