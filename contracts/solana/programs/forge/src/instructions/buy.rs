use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::instructions::launch_token::ForgeError;
use crate::state::{Curve, TokenPool, GRADUATION_TARGET};

/// Emitted on every buy so the indexer can update charts and the feed.
#[event]
pub struct BuyEvent {
    pub buyer: Pubkey,
    pub mint: Pubkey,
    pub lamports_in: u64,
    pub tokens_out: u64,
    pub new_price: u64,
}

#[event]
pub struct GraduatedEvent {
    pub mint: Pubkey,
    pub reserve_lamports: u64,
}

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pool", pool.mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, TokenPool>,

    /// Vault holding unsold supply, owned by the pool PDA.
    #[account(
        mut,
        associated_token::mint = pool.mint,
        associated_token::authority = pool,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Buyer's token account, created if needed.
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = pool.mint,
        associated_token::authority = buyer,
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    /// CHECK: the mint, read only, validated by the ATA constraints above.
    #[account(address = pool.mint)]
    pub mint: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Buyer sends SOL, receives tokens from the vault based on the linear curve.
/// SOL is moved into the pool PDA (which raises its lamports) and tracked in
/// `reserve_lamports`.
pub fn buy(ctx: Context<Buy>, lamports_in: u64) -> Result<()> {
    require!(lamports_in > 0, ForgeError::ZeroAmount);
    require!(!ctx.accounts.pool.graduated, ForgeError::AlreadyGraduated);

    let sold = ctx.accounts.pool.tokens_sold;
    let tokens_out = Curve::tokens_out(sold, lamports_in);
    require!(tokens_out > 0, ForgeError::ZeroAmount);

    // Move SOL from buyer into the pool account.
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.pool.to_account_info(),
            },
        ),
        lamports_in,
    )?;

    // Transfer tokens from the vault to the buyer. The pool PDA signs.
    let mint_key = ctx.accounts.pool.mint;
    let bump = ctx.accounts.pool.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[b"pool", mint_key.as_ref(), &[bump]]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.buyer_token_account.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            signer_seeds,
        ),
        tokens_out,
    )?;

    let pool = &mut ctx.accounts.pool;
    pool.tokens_sold = pool.tokens_sold.checked_add(tokens_out).unwrap();
    pool.reserve_lamports = pool.reserve_lamports.checked_add(lamports_in).unwrap();

    let new_price = Curve::price(pool.tokens_sold);
    emit!(BuyEvent {
        buyer: ctx.accounts.buyer.key(),
        mint: mint_key,
        lamports_in,
        tokens_out,
        new_price,
    });

    if pool.reserve_lamports >= GRADUATION_TARGET {
        pool.graduated = true;
        emit!(GraduatedEvent {
            mint: mint_key,
            reserve_lamports: pool.reserve_lamports,
        });
    }

    Ok(())
}
