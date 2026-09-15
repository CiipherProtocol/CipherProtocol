# Cipher Protocol — Frontend

React + TypeScript + Vite. Wallet connect (Freighter), the swap form, batch
monitor, and order history.

## Setup

```bash
npm install
cp .env.example .env   # defaults point at a local backend on :5001
npm run dev            # http://localhost:5173
```

Requires the [Freighter](https://www.freighter.app/) browser extension to
connect a wallet. Without a backend running, the swap form and batch monitor
still render — API calls just fail gracefully (empty lists, logged errors).

## Scripts

- `npm run dev` — dev server with hot reload
- `npm run build` — type-check (`tsc -b`) + production build
- `npm run preview` — preview the production build

## Structure

See the root [README](../README.md#architecture) for the overall data flow.
Key entry points: `src/pages/SwapPage.tsx` (main flow), `src/services/api.ts`
(backend client), `src/services/encryption.ts` (placeholder — see root
README's Status section), `src/context/WalletContext.tsx` (Freighter
connection state).
