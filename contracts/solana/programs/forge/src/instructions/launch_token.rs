use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, MintTo, Token, TokenAccount},
};

use crate::state::{TokenPool, TOTAL_SUPPLY};

/// Emitted when a new token is launched so the indexer can pick it up.
#[event]
pub struct TokenLaunched {
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub name: String,
    pub symbol: String,
    pub metadata_uri: String,
    pub timestamp: i64,
}

#[derive(Accounts)]
pub struct LaunchToken<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    /// The mint for the new token. The pool PDA is the mint authority.
    #[account(
        init,
        payer = creator,
        mint::decimals = 6,
        mint::authority = pool,
    )]
    pub mint: Account<'info, Mint>,

    /// Pool PDA, seeded by the mint. Holds curve state and is the vault owner.
    #[account(
        init,
        payer = creator,
        space = TokenPool::SPACE,
        seeds = [b"pool", mint.key().as_ref()],
        bump,
    )]
    pub pool: Account<'info, TokenPool>,

    /// Vault holding the unsold supply, owned by the pool PDA.
    #[account(
        init,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = pool,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

/// Creates the mint and pool, then mints the entire supply into the vault. The
/// curve sells from and buys back into this vault; nothing is pre-distributed.
pub fn launch_token(
    ctx: Context<LaunchToken>,
    name: String,
    symbol: String,
    metadata_uri: String,
) -> Result<()> {
    require!(name.len() <= TokenPool::MAX_NAME_LEN, ForgeError::NameTooLong);
    require!(symbol.len() <= TokenPool::MAX_SYMBOL_LEN, ForgeError::SymbolTooLong);
    require!(metadata_uri.len() <= TokenPool::MAX_URI_LEN, ForgeError::UriTooLong);

    let clock = Clock::get()?;
    let mint_key = ctx.accounts.mint.key();

    let pool = &mut ctx.accounts.pool;
    pool.creator = ctx.accounts.creator.key();
    pool.mint = mint_key;
    pool.name = name.clone();
    pool.symbol = symbol.clone();
    pool.metadata_uri = metadata_uri.clone();
    pool.reserve_lamports = 0;
    pool.tokens_sold = 0;
    pool.total_supply = TOTAL_SUPPLY;
    pool.graduated = false;
    pool.rewards_claimed = false;
    pool.launched_at = clock.unix_timestamp;
    pool.bump = ctx.bumps.pool;

    // Mint the full supply to the vault. The pool PDA signs as mint authority.
    let bump = pool.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[b"pool", mint_key.as_ref(), &[bump]]];
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            signer_seeds,
        ),
        TOTAL_SUPPLY,
    )?;

    emit!(TokenLaunched {
        creator: ctx.accounts.creator.key(),
        mint: mint_key,
        name,
        symbol,
        metadata_uri,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[error_code]
pub enum ForgeError {
    #[msg("Token name exceeds 32 characters")]
    NameTooLong,
    #[msg("Token symbol exceeds 10 characters")]
    SymbolTooLong,
    #[msg("Metadata URI exceeds 200 characters")]
    UriTooLong,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Token has already graduated")]
    AlreadyGraduated,
    #[msg("Insufficient reserve to cover this sell")]
    InsufficientReserve,
    #[msg("Cannot sell more tokens than have been sold")]
    SellExceedsSold,
    #[msg("Token has not graduated yet")]
    NotGraduated,
    #[msg("Rewards already claimed")]
    AlreadyClaimed,
    #[msg("Only the creator can claim rewards")]
    NotCreator,
}
