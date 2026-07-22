# Forge Solana Program (Devnet)

Anchor program for the Forge launchpad on Solana Devnet. Mirrors the EVM design:
a linear bonding curve backs every token, with graduation at 0.5 SOL and a 1%
creator reward on graduation.

## Layout

```
programs/forge/src/
├── lib.rs                     Program entry, instruction routing
├── instructions/
│   ├── launch_token.rs        Create mint + pool PDA, mint full supply to vault
│   ├── buy.rs                 SOL in, tokens out from vault, graduation check
│   ├── sell.rs                Tokens back to vault, SOL out from reserve
│   └── claim_rewards.rs       Creator claims 1% of reserve once graduated
└── state/
    ├── token_pool.rs          TokenPool account (curve state + metadata)
    └── bonding_curve.rs       Curve math (documented), u128 intermediates
```

## Bonding curve math

Token base units use 6 decimals, so one whole token is 1,000,000 base units.
Price per whole token is `P(s) = P0 + M*s/TOKEN_UNIT` with `P0 = 1000` lamports
(0.000001 SOL) and slope `M = 2`. Buys solve a quadratic with an integer square
root over u128; sells use the closed-form integral difference. Full derivation is
in the header of `state/bonding_curve.rs`.

The math was cross-checked in BigInt: round-trips never return more SOL than paid,
price is monotonic, the discriminant stays within u128 (~104 bits at worst), and a
0.5 SOL graduation buy mints far under the supply cap.

## Accounts model

The pool PDA (`["pool", mint]`) owns a vault that custodies the entire minted
supply. Buys transfer tokens out of the vault to the buyer and move SOL into the
pool account. Sells return tokens to the vault and debit the pool's lamports.
Rewards debit the pool's lamports to the creator.

## Prerequisites

Install Rust, the Solana CLI, and Anchor 0.30.1.

## Build, test, deploy

```bash
anchor build
anchor keys list                 # copy the program id
# paste it into declare_id! in lib.rs and into Anchor.toml, then rebuild
anchor build
anchor test                      # local validator tests
anchor deploy --provider.cluster devnet
```

Copy the deployed program id into `apps/web/.env.local`
(`NEXT_PUBLIC_SOLANA_PROGRAM_ID`) and `apps/api/.env`.

## Note

This is unaudited testnet code. Do not deploy to mainnet without an audit.
