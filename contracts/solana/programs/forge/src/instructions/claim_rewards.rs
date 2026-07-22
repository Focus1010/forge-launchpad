use anchor_lang::prelude::*;

use crate::instructions::launch_token::ForgeError;
use crate::state::{TokenPool, REWARD_DEN, REWARD_NUM};

#[event]
pub struct RewardsClaimed {
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
}

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pool", pool.mint.as_ref()],
        bump = pool.bump,
        has_one = creator @ ForgeError::NotCreator,
    )]
    pub pool: Account<'info, TokenPool>,
}

/// Creator claims 1% of the graduation reserve once the token has graduated.
/// Paid from the pool PDA's lamports. Can only be claimed once.
pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
    require!(ctx.accounts.pool.graduated, ForgeError::NotGraduated);
    require!(!ctx.accounts.pool.rewards_claimed, ForgeError::AlreadyClaimed);

    // 1% of the tracked reserve.
    let reward = ctx
        .accounts
        .pool
        .reserve_lamports
        .checked_mul(REWARD_NUM)
        .unwrap()
        / REWARD_DEN;
    require!(reward > 0, ForgeError::ZeroAmount);

    **ctx
        .accounts
        .pool
        .to_account_info()
        .try_borrow_mut_lamports()? -= reward;
    **ctx
        .accounts
        .creator
        .to_account_info()
        .try_borrow_mut_lamports()? += reward;

    let pool = &mut ctx.accounts.pool;
    pool.rewards_claimed = true;

    emit!(RewardsClaimed {
        creator: ctx.accounts.creator.key(),
        mint: pool.mint,
        amount: reward,
    });

    Ok(())
}
