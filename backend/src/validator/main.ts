/**
 * Standalone validator process: one key share, one identity, one port.
 *
 *   VALIDATOR_INDEX       this validator's index (1..n)
 *   VALIDATOR_PORT        port to listen on            (default 6000 + index)
 *   VALIDATOR_HOST        interface to bind            (default 127.0.0.1)
 *   VALIDATOR_KEY_DIR     where this validator keeps identity.json and its share
 *   VALIDATOR_API_TOKEN   bearer token the coordinator must present (≥ 32 chars)
 *   VALIDATOR_PEER_KEYS   identity public keys of all validators: "1:hex,2:hex,…"
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Identity, generateIdentity, publicKeyOf } from '../crypto/signing';
import { LocalValidator, PersistedValidatorKey } from './localValidator';
import { createValidatorApp } from './server';

dotenv.config();

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

export function parsePeerKeys(raw: string): Record<number, string> {
  return Object.fromEntries(
    raw
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const [i, key] = p.split(':');
        if (!/^\d+$/.test(i) || !/^[0-9a-f]{64}$/.test(key ?? '')) throw new Error(`bad VALIDATOR_PEER_KEYS entry "${p}"`);
        return [Number(i), key];
      })
  );
}

/** Loads this validator's identity key, creating it on first run. */
export function loadOrCreateIdentity(keyDir: string): Identity {
  const file = path.join(keyDir, 'identity.json');
  if (fs.existsSync(file)) {
    const { secretKey } = JSON.parse(fs.readFileSync(file, 'utf8')) as Identity;
    return { secretKey, publicKey: publicKeyOf(secretKey) };
  }
  const identity = generateIdentity();
  fs.mkdirSync(keyDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(identity, null, 2), { mode: 0o600 });
  return identity;
}

export function startValidator() {
  const index = Number(required('VALIDATOR_INDEX'));
  const keyDir = required('VALIDATOR_KEY_DIR');
  const port = Number(process.env.VALIDATOR_PORT || 6000 + index);
  const host = process.env.VALIDATOR_HOST || '127.0.0.1';
  const identity = loadOrCreateIdentity(keyDir);
  const peers = parsePeerKeys(required('VALIDATOR_PEER_KEYS'));
  const keyFile = path.join(keyDir, `validator-${index}.json`);
  const opts = { identity, peers, keyFile };

  const validator = fs.existsSync(keyFile)
    ? LocalValidator.fromPersisted(JSON.parse(fs.readFileSync(keyFile, 'utf8')) as PersistedValidatorKey, opts)
    : new LocalValidator(index, opts);

  const app = createValidatorApp(validator, required('VALIDATOR_API_TOKEN'));
  app.listen(port, host, () => {
    console.log(
      `validator ${index} listening on http://${host}:${port} ` +
        `(identity ${identity.publicKey.slice(0, 16)}…, ${fs.existsSync(keyFile) ? 'key share loaded' : 'awaiting DKG'})`
    );
  });
}

if (require.main === module) {
  try {
    startValidator();
  } catch (err) {
    console.error(`validator failed to start: ${(err as Error).message}`);
    process.exit(1);
  }
}
