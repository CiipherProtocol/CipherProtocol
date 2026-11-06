/**
 * One-shot cluster bootstrap for Docker Compose (the `validator-init`
 * service). Writes into the shared /cluster volume:
 *
 *   validator-<i>/identity.json    that validator's identity key
 *   validator-<i>/validator.env    its API token, peer keys, sealing config
 *   coordinator/cluster.json       what the backend needs to reach them
 *
 * Each container then mounts only its own subdirectory, so a validator
 * never sees another validator's files. Idempotent: existing identities
 * and tokens are kept, so restarts don't re-key anything.
 *
 * NOTE: this bootstrap is run by one operator, so it is a single-operator
 * demo. Real independent validators generate their own identity and
 * exchange only public keys.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { loadOrCreateIdentity } from './main';
import { ClusterFile } from './remoteValidator';

const root = process.env.CLUSTER_DIR || '/cluster';
const count = Number(process.env.VALIDATOR_COUNT) || 5;
const urlFor = (i: number) => (process.env.VALIDATOR_URL_TEMPLATE || 'http://validator-{i}:7700').replace('{i}', String(i));

const clusterPath = path.join(root, 'coordinator', 'cluster.json');
const previous: ClusterFile | null = fs.existsSync(clusterPath) ? JSON.parse(fs.readFileSync(clusterPath, 'utf8')) : null;

const members = Array.from({ length: count }, (_, k) => {
  const index = k + 1;
  const dir = path.join(root, `validator-${index}`);
  const identity = loadOrCreateIdentity(dir);
  const apiToken = previous?.validators.find((v) => v.index === index)?.apiToken ?? crypto.randomBytes(32).toString('hex');
  return { index, dir, identity, apiToken };
});

const peerKeys = members.map((m) => `${m.index}:${m.identity.publicKey}`).join(',');
const sealing = process.env.ORDER_VAULT_CONTRACT
  ? [
      `VALIDATOR_ORDER_VAULT_CONTRACT=${process.env.ORDER_VAULT_CONTRACT}`,
      `VALIDATOR_SOROBAN_RPC_URL=${process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org'}`,
      `VALIDATOR_NETWORK_PASSPHRASE="${process.env.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015'}"`,
    ]
  : ['VALIDATOR_INSECURE_SKIP_COMMITMENT_CHECK=1'];

for (const m of members) {
  const env = [`VALIDATOR_API_TOKEN=${m.apiToken}`, `VALIDATOR_PEER_KEYS=${peerKeys}`, ...sealing].join('\n') + '\n';
  fs.writeFileSync(path.join(m.dir, 'validator.env'), env, { mode: 0o600 });
}

const cluster: ClusterFile = {
  validators: members.map((m) => ({ index: m.index, url: urlFor(m.index), identityKey: m.identity.publicKey, apiToken: m.apiToken })),
};
fs.mkdirSync(path.dirname(clusterPath), { recursive: true });
fs.writeFileSync(clusterPath, JSON.stringify(cluster, null, 2), { mode: 0o600 });

console.log(
  `cluster ready: ${count} validators, sealing check ${process.env.ORDER_VAULT_CONTRACT ? 'ON (on-chain)' : 'OFF (no ORDER_VAULT_CONTRACT)'}`
);
