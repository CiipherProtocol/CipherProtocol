import { api } from './api';
import { walletService } from './wallet';

interface Session {
  token: string;
  address: string;
  expires_at: number;
}

const STORAGE_KEY = 'cipher-protocol:session';
const EXPIRY_MARGIN_S = 60;

function load(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function save(session: Session | null) {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable (private mode) — session just won't survive reloads
  }
}

let current: Session | null = load();
let inflight: Promise<Session> | null = null;

const isFresh = (s: Session | null, address: string): s is Session =>
  !!s && s.address === address && s.expires_at - EXPIRY_MARGIN_S > Date.now() / 1000;

/**
 * Proves control of `address` to the backend: fetch a challenge transaction,
 * have Freighter sign it (it is never submitted — sequence 0), and exchange
 * the signature for a short-lived session token. Cached per tab.
 */
async function signIn(address: string): Promise<Session> {
  const { data: challenge } = await api.post<{ transaction: string; network_passphrase: string }>(
    '/auth/challenge',
    { address }
  );
  const signed = await walletService.signTransaction(challenge.transaction, challenge.network_passphrase, address);
  const { data } = await api.post<Session>('/auth/verify', { transaction: signed });
  return data;
}

export const authService = {
  async getToken(address: string): Promise<string> {
    if (isFresh(current, address)) return current.token;
    inflight ??= signIn(address).finally(() => {
      inflight = null;
    });
    current = await inflight;
    save(current);
    return current.token;
  },

  async authHeaders(address: string): Promise<Record<string, string>> {
    return { Authorization: `Bearer ${await this.getToken(address)}` };
  },

  clear() {
    current = null;
    save(null);
  },
};
