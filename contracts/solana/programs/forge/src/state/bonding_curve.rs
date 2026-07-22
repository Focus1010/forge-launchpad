use anchor_lang::prelude::*;

/// Linear bonding curve math for Solana, mirroring the EVM BondingCurve.
///
/// Token base units use 6 decimals (SOLANA_DECIMALS), so one whole token is
/// 1_000_000 base units. Prices are in lamports per whole token.
///
/// Price at `sold` base units:
///
///     P(s) = P0 + (M * s) / TOKEN_UNIT                          (lamports)
///
/// Reserve is the integral of price over tokens sold:
///
///     R(s) = (P0 * s) / TOKEN_UNIT + (M * s^2) / (2 * TOKEN_UNIT^2)
///
/// BUY: given lamports_in, solve R(s + dx) - R(s) = lamports_in for dx.
/// Multiplying the integral difference through by 2 * TOKEN_UNIT^2 gives
///
///     M * dx^2 + (2*TOKEN_UNIT*P0 + 2*M*s) * dx - 2*TOKEN_UNIT^2*lamports_in = 0
///
/// Positive root:
///
///     b    = 2*TOKEN_UNIT*P0 + 2*M*s
///     disc = b^2 + 8 * TOKEN_UNIT^2 * M * lamports_in
///     dx   = (sqrt(disc) - b) / (2*M)
///
/// SELL: lamports returned for burning dx tokens needs no square root:
///
///     lamports_out = (P0*dx)/TOKEN_UNIT + (M*(2*s*dx - dx^2)) / (2*TOKEN_UNIT^2)
///
/// All intermediate products can exceed u64, so the math runs in u128 and
/// converts back at the end. This is unaudited testnet code.
pub struct Curve;

/// Base units per whole token (6 decimals).
pub const TOKEN_UNIT: u128 = 1_000_000;

/// Launch price in lamports per whole token. 0.000001 SOL = 1000 lamports
/// (1 SOL = 1e9 lamports).
pub const P0: u128 = 1_000;

/// Curve slope: lamports of price added per whole token sold.
pub const M: u128 = 2;

/// Graduation target in lamports. 0.5 SOL.
pub const GRADUATION_TARGET: u64 = 500_000_000;

/// Total supply in base units: 1,000,000,000 tokens * 10^6.
pub const TOTAL_SUPPLY: u64 = 1_000_000_000 * 1_000_000;

/// Creator reward numerator/denominator: 1% of the reserve.
pub const REWARD_NUM: u64 = 1;
pub const REWARD_DEN: u64 = 100;

impl Curve {
    /// Current price in lamports per whole token.
    pub fn price(sold: u64) -> u64 {
        let s = sold as u128;
        (P0 + (M * s) / TOKEN_UNIT) as u64
    }

    /// Tokens (base units) received for `lamports_in` at the current `sold`.
    pub fn tokens_out(sold: u64, lamports_in: u64) -> u64 {
        let s = sold as u128;
        let l = lamports_in as u128;
        let unit2 = TOKEN_UNIT * TOKEN_UNIT;
        let b = 2 * TOKEN_UNIT * P0 + 2 * M * s;
        let disc = b * b + 8 * unit2 * M * l;
        let root = int_sqrt(disc);
        // root >= b since the added term is non-negative.
        ((root - b) / (2 * M)) as u64
    }

    /// Lamports received for burning `dx` base units at the current `sold`.
    /// Caller must ensure dx <= sold.
    pub fn lamports_out(sold: u64, dx: u64) -> u64 {
        let s = sold as u128;
        let d = dx as u128;
        let unit2 = TOKEN_UNIT * TOKEN_UNIT;
        let linear = (P0 * d) / TOKEN_UNIT;
        // 2*s*d - d^2 = d * (2*s - d); dx <= sold keeps this non-negative.
        let quadratic = (M * (d * (2 * s - d))) / (2 * unit2);
        (linear + quadratic) as u64
    }
}

/// Floor integer square root over u128 (Babylonian method).
pub fn int_sqrt(x: u128) -> u128 {
    if x < 2 {
        return x;
    }
    let mut z = (x + 1) / 2;
    let mut y = x;
    while z < y {
        y = z;
        z = (x / z + z) / 2;
    }
    y
}
