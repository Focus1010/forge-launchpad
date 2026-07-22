use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::instructions::launch_token::ForgeError;
use crate::state::{Curve, TokenPool};

#[event]
pub struct SellEvent {
    pub seller: Pubkey,
    pub mint: Pubkey,
    pub tokens_in: u64,
    pub lamports_out: u64,
    pub new_price: u64,
}

#[derive(Accounts)]
pub struct Sell<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pool", pool.mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, TokenPool>,

    #[account(
        mut,
        associated_token::mint = pool.mint,
        associated_token::authority = pool,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = pool.mint,
        associated_token::authority = seller,
    )]
    pub seller_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

/// Seller returns tokens to the vault and receives SOL from the pool reserve
/// based on the curve. Tokens go back to the vault (not burned) since the vault
/// custodies the full supply on Solana.
pub fn sell(ctx: Context<Sell>, tokens_in: u64) -> Result<()> {
    require!(tokens_in > 0, ForgeError::ZeroAmount);
    require!(!ctx.accounts.pool.graduated, ForgeError::AlreadyGraduated);

    let sold = ctx.accounts.pool.tokens_sold;
    require!(tokens_in <= sold, ForgeError::SellExceedsSold);

    let lamports_out = Curve::lamports_out(sold, tokens_in);
    require!(lamports_out > 0, ForgeError::ZeroAmount);
    require!(
        lamports_out <= ctx.accounts.pool.reserve_lamports,
        ForgeError::InsufficientReserve
    );

    // Move tokens from the seller back into the vault. Seller signs directly.
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.seller_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.seller.to_account_info(),
            },
        ),
        tokens_in,
    )?;

    // Pay SOL out of the pool PDA by adjusting lamports directly. The pool is a
    // program-owned account, so we can debit its lamports and credit the seller.
    **ctx
        .accounts
        .pool
        .to_account_info()
        .try_borrow_mut_lamports()? -= lamports_out;
    **ctx
        .accounts
        .seller
        .to_account_info()
        .try_borrow_mut_lamports()? += lamports_out;

    let pool = &mut ctx.accounts.pool;
    pool.tokens_sold = pool.tokens_sold.checked_sub(tokens_in).unwrap();
    pool.reserve_lamports = pool.reserve_lamports.checked_sub(lamports_out).unwrap();

    let new_price = Curve::price(pool.tokens_sold);
    emit!(SellEvent {
        seller: ctx.accounts.seller.key(),
        mint: pool.mint,
        tokens_in,
        lamports_out,
        new_price,
    });

    Ok(())
}
