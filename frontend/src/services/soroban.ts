import { rpc } from '@stellar/stellar-sdk';
import { SOROBAN_RPC_URL } from '../constants/config';

const server = new rpc.Server(SOROBAN_RPC_URL);

/**
 * Direct Soroban RPC access, for reads the backend API doesn't cover
 * (e.g. live pool reserves). Order submission and status go through the
 * backend API (see services/api.ts), not directly through this client.
 */
export const sorobanService = {
  getServer(): rpc.Server {
    return server;
  },
};
