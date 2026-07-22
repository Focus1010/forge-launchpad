use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;

use instructions::*;

// Replace with the real program id printed by `anchor keys list` after the
// first build, then run `anchor build` again so the IDL embeds it.
declare_id!("Forge11111111111111111111111111111111111111");

/// Forge launchpad program for Solana Devnet.
///
/// Mirrors the EVM launchpad: launch a token backed by a linear bonding curve,
/// buy and sell against the curve, and let the creator claim a reward once the
/// token graduates. The bonding curve math lives in `state::bonding_curve` and
/// is documented there.
#[program]
pub mod forge {
    use super::*;

    pub fn launch_token(
        ctx: Context<LaunchToken>,
        name: String,
        symbol: String,
        metadata_uri: String,
    ) -> Result<()> {
        instructions::launch_token::launch_token(ctx, name, symbol, metadata_uri)
    }

    pub fn buy(ctx: Context<Buy>, lamports_in: u64) -> Result<()> {
        instructions::buy::buy(ctx, lamports_in)
    }

    pub fn sell(ctx: Context<Sell>, tokens_in: u64) -> Result<()> {
        instructions::sell::sell(ctx, tokens_in)
    }

    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
        instructions::claim_rewards::claim_rewards(ctx)
    }
}
