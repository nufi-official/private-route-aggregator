# FUNDX - Private Cross-Chain Funding

Demo video: https://youtu.be/OJ93iusWYdk

A privacy-focused application for seamlessly exchanging assets between shielded Solana accounts and major currencies across leading blockchain networks.

## Overview

FUNDX enables users to:

- **Deposit** assets from any supported blockchain into shielded Solana accounts
- **Withdraw** from shielded accounts to any supported blockchain with single-transaction flows
- **Swap** between different assets while maintaining privacy
- **Choose** between Privacy Cash and ShadowWire privacy protocols

### How It Works

**Outbound (Withdraw):** Swaps from shielded accounts are executed through a streamlined, single-transaction flow. SOL is withdrawn from the privacy pool and automatically swapped to the destination asset via NEAR Intents.

**Inbound (Deposit):** Funding shielded accounts involves a two-step process:
1. The originating asset is swapped into the user's unshielded Solana wallet balance
2. The funds are then deposited into the user's shielded balance

## Supported Privacy Protocols

- **ShadowWire** - Privacy protocol by RADR Labs
- **Privacy Cash** - Alternative privacy protocol with signature-based authentication

## Tech Stack

- **Frontend:** React 18, Material UI, Vite
- **Blockchain:** Solana Web3.js, Wallet Adapter
- **Cross-chain:** NEAR Intents API
- **Build:** TypeScript, pnpm monorepo

## Project Structure

```
packages/
├── example-app/       # Main FUNDX React application
├── near-intents/      # NEAR Intents SDK integration
├── private-routers/   # Privacy router core implementations
└── signers/           # Wallet signer abstractions
```

## Prerequisites

- Node.js >= 20
- pnpm >= 10.28.2

## Installation

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build
```

## Development

```bash
# Start development server
pnpm dev

# Run from example-app directory
cd packages/example-app
pnpm dev
```

## Environment Variables

Create a `.env` file in the root directory:

```env
VITE_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

## Building for Production

```bash
pnpm build
```

## Deployment

The app is configured for Heroku deployment:

```bash
git push heroku main
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Build all packages |
| `pnpm test` | Run tests |
| `pnpm lint` | Lint code |
| `pnpm format` | Format code with Prettier |
| `pnpm typecheck` | Type check with TypeScript |

## Security Notice

This application is a prototype for testing purposes. Use with test funds only. Never enter real mnemonics or use significant funds in this prototype.

## License

MIT
