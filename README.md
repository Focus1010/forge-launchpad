# Forge

Forge is a multi-chain token launchpad running on Base Sepolia and Solana Devnet. It pairs real bonding-curve token launches with a native social feed, sponsored gas, and simulated market activity so the platform feels alive from the first visit. The design system is strictly black and white, with red reserved for destructive actions and errors.

This is a testnet project built to production structure.

## Repository layout

```
forge/
├── apps/
│   ├── web/        Next.js 15 frontend (App Router, Tailwind, Wagmi, Solana Wallet Adapter)
│   └── api/        Fastify backend (Redis, Pinata IPFS, onchain indexer, simulation)
├── packages/
│   └── shared/     Shared TypeScript types and constants consumed by web and api
└── contracts/
    ├── evm/        Foundry project for Base Sepolia (bonding curve, factory, paymaster)
    └── solana/     Anchor project for Solana Devnet
```

## Prerequisites

- Node.js 20 or newer
- pnpm 10 (`npm install -g pnpm`)
- For EVM contracts: Foundry (`forge`, `cast`, `anvil`)
- For Solana contracts: Rust, the Solana CLI, and Anchor

## Install

```bash
pnpm install
```

This installs dependencies for every workspace (`apps/web`, `apps/api`, `packages/shared`).

## Environment variables

Copy the example files and fill in the values.

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
```

Frontend (`apps/web/.env.local`):

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Base URL for the Fastify API |
| `NEXT_PUBLIC_WS_URL` | WebSocket URL for the live feed |
| `NEXT_PUBLIC_BASE_SEPOLIA_RPC` | Base Sepolia RPC endpoint |
| `NEXT_PUBLIC_SOLANA_RPC` | Solana Devnet RPC endpoint |
| `NEXT_PUBLIC_FORGE_FACTORY_ADDRESS` | Deployed ForgeFactory address |
| `NEXT_PUBLIC_FORGE_PAYMASTER_ADDRESS` | Deployed ForgePaymaster address |
| `NEXT_PUBLIC_SOLANA_PROGRAM_ID` | Deployed Anchor program id |
| `NEXT_PUBLIC_CHAIN_ID` | `84532` for Base Sepolia |
| `NEXT_PUBLIC_WC_PROJECT_ID` | WalletConnect project id |

Backend (`apps/api/.env`):

| Variable | Purpose |
| --- | --- |
| `PORT` | API port (default `3001`) |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |
| `PINATA_API_KEY` | Pinata API key for IPFS uploads |
| `PINATA_SECRET_API_KEY` | Pinata secret |
| `PINATA_GATEWAY` | Pinata gateway URL |
| `BASE_SEPOLIA_RPC` | Base Sepolia RPC for the indexer |
| `SOLANA_DEVNET_RPC` | Solana Devnet RPC for the indexer |
| `FORGE_FACTORY_ADDRESS` | Deployed ForgeFactory address |
| `SIMULATION_INTERVAL_MS` | Simulation tick interval (default `25000`) |

## Run locally

```bash
pnpm dev
```

This runs the frontend and backend together. To run them separately:

```bash
pnpm dev:web   # Next.js on http://localhost:3000
pnpm dev:api   # Fastify on http://localhost:3001
```

## Deploy contracts

EVM (Base Sepolia), from `contracts/evm`:

```bash
forge test
forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast
```

Deployment order is BondingCurve, ForgeToken implementation, ForgeFactory, ForgePaymaster. Copy the printed addresses into both `.env` files.

Solana (Devnet), from `contracts/solana`:

```bash
anchor build
anchor deploy --provider.cluster devnet
```

Copy the printed program id into both `.env` files.

## Deploy the apps

- Frontend: Vercel, root directory `apps/web`.
- Backend: Railway, root directory `apps/api`.

Set the environment variables above in each platform's dashboard.

## Build order

The project is built in stages. Each stage is a self-contained commit that builds and type-checks before the next one begins. See the build order in the project brief.
