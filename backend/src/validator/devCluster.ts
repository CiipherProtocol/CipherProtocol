/**
 * Local multi-process validator cluster for development:
 *
 *   npm run validators:dev            # 5 validators on ports 6001–6005
 *   VALIDATOR_COUNT=7 npm run validators:dev
 *
 * Each validator runs as its own OS process with its own key directory
 * (data/cluster/validator-<i>/), so no process ever holds another's share.
 * Writes data/cluster/cluster.json for the backend; point the backend at it
 * with VALIDATOR_CLUSTER_FILE=data/cluster/cluster.json. The first backend
 * start runs the DKG over HTTP; later starts reuse the shares.
 */
import { ChildProcess, spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { loadOrCreateIdentity } from './main';
import { ClusterFile } from './remoteValidator';

const root = path.join(__dirname, '..', '..', 'data', 'cluster');
const count = Number(process.env.VALIDATOR_COUNT) || 5;
const basePort = Number(process.env.VALIDATOR_BASE_PORT) || 6000;

const clusterPath = path.join(root, 'cluster.json');
const previous: ClusterFile | null = fs.existsSync(clusterPath) ? JSON.parse(fs.readFileSync(clusterPath, 'utf8')) : null;

const members = Array.from({ length: count }, (_, k) => {
  const index = k + 1;
  const keyDir = path.join(root, `validator-${index}`);
  const identity = loadOrCreateIdentity(keyDir);
  const apiToken =
    previous?.validators.find((v) => v.index === index)?.apiToken ?? crypto.randomBytes(32).toString('hex');
  return { index, keyDir, identity, apiToken, port: basePort + index };
});

const cluster: ClusterFile = {
  validators: members.map((m) => ({
    index: m.index,
    url: `http://127.0.0.1:${m.port}`,
    identityKey: m.identity.publicKey,
    apiToken: m.apiToken,
  })),
};
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(clusterPath, JSON.stringify(cluster, null, 2), { mode: 0o600 });

const peerKeys = members.map((m) => `${m.index}:${m.identity.publicKey}`).join(',');
// Works both from source (ts-node) and from the compiled dist/ build.
const runningTs = path.extname(__filename) === '.ts';
const entry = path.join(__dirname, `main${path.extname(__filename)}`);
const nodeArgs = runningTs ? ['-r', 'ts-node/register/transpile-only', entry] : [entry];
const children: ChildProcess[] = members.map((m) =>
  spawn(process.execPath, nodeArgs, {
    stdio: 'inherit',
    env: {
      ...process.env,
      VALIDATOR_INDEX: String(m.index),
      VALIDATOR_PORT: String(m.port),
      VALIDATOR_KEY_DIR: m.keyDir,
      VALIDATOR_API_TOKEN: m.apiToken,
      VALIDATOR_PEER_KEYS: peerKeys,
    },
  })
);

console.log(`\nStarted ${count} validator processes. Run the backend with:\n`);
console.log(`  VALIDATOR_CLUSTER_FILE=${path.relative(process.cwd(), clusterPath)} npm run dev\n`);

const stop = () => {
  for (const c of children) c.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
