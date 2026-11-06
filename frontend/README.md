# Cipher Protocol — Frontend

React + TypeScript + Vite. Wallet connect (Freighter), the swap form, batch
monitor, and order history.

## Setup

```bash
npm install
cp .env.example .env   # defaults point at a local backend on :5001
npm run dev            # http://localhost:5173
```

Connect with the [Freighter](https://www.freighter.app/) extension, or click
**Try demo wallet** to use a throwaway testnet key held in the tab. The demo
key is only used to sign the sign-in challenge, and it's discarded on
disconnect. Without a backend, the app still renders, and a banner says the
backend is unreachable.

## Scripts

- `npm run dev` — dev server with hot reload
- `npm run build` — type-check (`tsc -b`) + production build
- `npm run preview` — preview the production build
- `npm test` — Vitest (encryption wire format, amounts, SwapForm, demo wallet)

Deploying: see [docs/DEPLOY.md](../docs/DEPLOY.md). `vercel.json` and
`public/_redirects` set up SPA routing on Vercel and Netlify, and the
`Dockerfile` serves the build through nginx, proxying `/api`.

## Structure

See the root [README](../README.md#architecture) for the overall data flow.
Key entry points: `src/pages/SwapPage.tsx` (main flow), `src/services/api.ts`
(backend client), `src/crypto/orderCipher.ts` (threshold encryption, byte-identical to the
backend copy), `src/services/wallet.ts` (Freighter or demo key), and
`src/components/layout/ModeBanner.tsx` (what's real versus simulated).
