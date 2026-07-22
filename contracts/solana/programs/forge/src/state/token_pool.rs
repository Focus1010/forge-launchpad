use anchor_lang::prelude::*;

/// One TokenPool account per launched token. It holds the curve state and the
/// token metadata, and is the authority over the token vault that custodies the
/// unsold supply. Created as a PDA seeded by ["pool", mint].
#[account]
pub struct TokenPool {
    /// Wallet that launched the token.
    pub creator: Pubkey,
    /// The SPL mint for this token.
    pub mint: Pubkey,
    /// Token name, up to 32 characters.
    pub name: String,
    /// Token symbol, up to 10 characters.
    pub symbol: String,
    /// IPFS metadata URI, up to 200 characters.
    pub metadata_uri: String,
    /// SOL held by the curve, in lamports.
    pub reserve_lamports: u64,
    /// Tokens sold through the curve, in base units.
    pub tokens_sold: u64,
    /// Total minted supply in base units (1_000_000_000 * 10^6).
    pub total_supply: u64,
    /// True once the reserve reaches the graduation target.
    pub graduated: bool,
    /// True once the creator has claimed their reward.
    pub rewards_claimed: bool,
    /// Unix timestamp of launch.
    pub launched_at: i64,
    /// PDA bump.
    pub bump: u8,
}

impl TokenPool {
    pub const MAX_NAME_LEN: usize = 32;
    pub const MAX_SYMBOL_LEN: usize = 10;
    pub const MAX_URI_LEN: usize = 200;

    /// Space for the account: 8 discriminator + fields. Strings are stored as a
    /// 4-byte length prefix plus their max byte length so the account never has
    /// to be resized.
    pub const SPACE: usize = 8
        + 32  // creator
        + 32  // mint
        + 4 + Self::MAX_NAME_LEN
        + 4 + Self::MAX_SYMBOL_LEN
        + 4 + Self::MAX_URI_LEN
        + 8   // reserve_lamports
        + 8   // tokens_sold
        + 8   // total_supply
        + 1   // graduated
        + 1   // rewards_claimed
        + 8   // launched_at
        + 1; // bump
}
