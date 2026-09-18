export type Expiration = 'one-download' | 'one-day';

export type ShareDetails = {
  passwordProtected: boolean;
  expiresAt: string | null;
  fileCount: number;
  expiration: Expiration;
};
