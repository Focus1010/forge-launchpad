# Forge EVM Contracts (Base Sepolia)

Foundry project for the Forge launchpad on Base Sepolia.

## Contracts

| Contract | Role |
| --- | --- |
| `ForgeToken.sol` | ERC-20 with a 1B cap. Minted on buy, burned on sell, only by the curve. |
| `BondingCurve.sol` | Linear bonding curve. Prices buys and sells, tracks reserve, graduates at 0.5 ETH. |
| `ForgeFactory.sol` | Deploys tokens, registers them on the curve, keeps the onchain registry. |
| `ForgePaymaster.sol` | ERC-4337 paymaster. Sponsors deployToken, buy (under 0.01 ETH), and sell. |

## Bonding curve math

The curve is linear in tokens sold. Price per whole token is `P(s) = P0 + M*s/1e18`,
with launch price `P0 = 1e12` wei (0.000001 ETH) and slope `M = 2e6`. Reserve is the
integral of price over tokens sold. Buys solve a quadratic (with an integer square
root) for tokens out; sells use the closed-form integral difference. Full derivation
is in the header comment of `BondingCurve.sol`.

The math was cross-checked in BigInt against these invariants: round-trip buys never
return more ETH than paid in, price is monotonic, and a full sell recovers at most the
reserve. Run `forge test` to verify against the Solidity implementation.

## Prerequisites

Install Foundry, then the dependencies:

```bash
forge install foundry-rs/forge-std
forge install OpenZeppelin/openzeppelin-contracts
forge install eth-infinitism/account-abstraction
```

Remappings are in `remappings.txt`.

## Test

```bash
forge test -vvv
```

## Deploy

Set `PRIVATE_KEY` and `BASE_SEPOLIA_RPC` in the environment, then:

```bash
forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast --verify
```

Deployment order is BondingCurve, ForgeFactory, ForgePaymaster. The script predicts the
factory address from the deployer nonce so the curve and factory can reference each
other. After deploy, fund the paymaster through the EntryPoint:

```bash
cast send $ENTRY_POINT "depositTo(address)" $PAYMASTER --value 0.2ether \
  --rpc-url $BASE_SEPOLIA_RPC --private-key $PRIVATE_KEY
```

Copy the three printed addresses into `apps/web/.env.local` and `apps/api/.env`.

## Note

This is unaudited testnet code. Do not deploy to mainnet without an audit.
