// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ForgeToken} from "./ForgeToken.sol";

/// @title BondingCurve
/// @notice Linear bonding curve pricing for Forge tokens. Buyers send ETH and
///         receive freshly minted tokens; sellers burn tokens and receive ETH
///         back from the reserve. Price rises linearly with the number of
///         tokens sold. Once the reserve reaches the graduation target the curve
///         locks and no further buys or sells are allowed.
///
/// @dev THE MATH (all values in wei; token amounts in 18-decimal base units,
///      which we treat directly as WAD fixed point so 1 token == 1e18 == 1.0):
///
///      Let s = tokensSold (base units, i.e. WAD whole tokens).
///      Instantaneous price per whole token:
///
///          P(s) = P0 + (M * s) / 1e18                                    (wei)
///
///      where P0 is the launch price per token and M is the slope (the price
///      added per whole token sold). Dividing by 1e18 converts s from WAD to
///      whole tokens.
///
///      The reserve is the integral of price over tokens sold:
///
///          R(s) = (P0 * s) / 1e18  +  (M * s^2) / (2 * 1e36)             (wei)
///
///      BUYING. Given ethIn, we need dx (base units) added to sold such that
///      R(s + dx) - R(s) = ethIn. Expanding the integral and multiplying
///      through by 2e36 gives the quadratic
///
///          M * dx^2 + (2e18*P0 + 2*M*s) * dx - 2e36 * ethIn = 0
///
///      Solving with the quadratic formula (positive root):
///
///          b    = 2e18*P0 + 2*M*s
///          disc = b^2 + 8e36 * M * ethIn
///          dx   = (sqrt(disc) - b) / (2*M)
///
///      SELLING. Given dx tokens burned, the ETH returned is R(s) - R(s - dx),
///      which needs no square root:
///
///          ethOut = (P0*dx)/1e18 + (M * (2*s*dx - dx^2)) / (2*1e36)
///
///      This is unaudited testnet code. Run the Foundry test suite before any
///      real deployment.
contract BondingCurve {
    /// @notice Launch price per whole token, in wei. 0.000001 ETH.
    uint256 public constant P0 = 1e12;

    /// @notice Curve slope: wei of price added per whole token sold.
    uint256 public constant M = 2e6;

    /// @notice Reserve level at which a token graduates, in wei. 0.5 ETH.
    uint256 public constant GRADUATION_TARGET = 0.5 ether;

    struct Curve {
        bool registered;
        bool graduated;
        uint256 reserveBalance; // ETH held for this token, in wei
        uint256 tokensSold; // base units minted through the curve
    }

    /// @notice Per-token curve state, keyed by token address.
    mapping(address => Curve) public curves;

    /// @notice The factory allowed to register new tokens.
    address public immutable factory;

    event Buy(
        address indexed buyer,
        address indexed token,
        uint256 ethIn,
        uint256 tokensOut,
        uint256 newPrice
    );
    event Sell(
        address indexed seller,
        address indexed token,
        uint256 tokensIn,
        uint256 ethOut,
        uint256 newPrice
    );
    event Graduated(address indexed token, uint256 reserveBalance);

    error OnlyFactory();
    error NotRegistered();
    error AlreadyGraduated();
    error ZeroAmount();
    error InsufficientReserve();
    error TransferFailed();

    constructor(address factory_) {
        factory = factory_;
    }

    /// @notice Register a newly deployed token so it can trade on the curve.
    /// @dev Only the factory may call this, at deploy time.
    function register(address token) external {
        if (msg.sender != factory) revert OnlyFactory();
        curves[token].registered = true;
    }

    /// @notice Buy tokens by sending ETH. Mints tokens to the caller based on
    ///         the curve and credits the reserve.
    function buy(address token) external payable {
        Curve storage curve = curves[token];
        if (!curve.registered) revert NotRegistered();
        if (curve.graduated) revert AlreadyGraduated();
        if (msg.value == 0) revert ZeroAmount();

        uint256 tokensOut = _tokensOut(curve.tokensSold, msg.value);
        if (tokensOut == 0) revert ZeroAmount();

        curve.tokensSold += tokensOut;
        curve.reserveBalance += msg.value;

        ForgeToken(token).mint(msg.sender, tokensOut);

        uint256 newPrice = _price(curve.tokensSold);
        emit Buy(msg.sender, token, msg.value, tokensOut, newPrice);

        if (curve.reserveBalance >= GRADUATION_TARGET) {
            curve.graduated = true;
            emit Graduated(token, curve.reserveBalance);
        }
    }

    /// @notice Sell tokens back to the curve for ETH. Burns the tokens and pays
    ///         out from the reserve.
    function sell(address token, uint256 tokenAmount) external {
        Curve storage curve = curves[token];
        if (!curve.registered) revert NotRegistered();
        if (curve.graduated) revert AlreadyGraduated();
        if (tokenAmount == 0) revert ZeroAmount();

        uint256 ethOut = _ethOut(curve.tokensSold, tokenAmount);
        if (ethOut == 0) revert ZeroAmount();
        if (ethOut > curve.reserveBalance) revert InsufficientReserve();

        curve.tokensSold -= tokenAmount;
        curve.reserveBalance -= ethOut;

        ForgeToken(token).burn(msg.sender, tokenAmount);

        (bool ok, ) = payable(msg.sender).call{value: ethOut}("");
        if (!ok) revert TransferFailed();

        uint256 newPrice = _price(curve.tokensSold);
        emit Sell(msg.sender, token, tokenAmount, ethOut, newPrice);
    }

    /// @notice Current price in wei per whole token.
    function getPrice(address token) external view returns (uint256) {
        return _price(curves[token].tokensSold);
    }

    /// @notice Tokens received for a given ETH amount at the current state.
    function getTokensOut(address token, uint256 ethIn) external view returns (uint256) {
        return _tokensOut(curves[token].tokensSold, ethIn);
    }

    /// @notice ETH received for selling a given token amount at the current state.
    function getEthOut(address token, uint256 tokenAmount) external view returns (uint256) {
        return _ethOut(curves[token].tokensSold, tokenAmount);
    }

    // -------------------------------------------------------------------------
    // Internal math
    // -------------------------------------------------------------------------

    /// @dev P(s) = P0 + (M * s) / 1e18. See contract-level docs.
    function _price(uint256 sold) internal pure returns (uint256) {
        return P0 + (M * sold) / 1e18;
    }

    /// @dev Solve the buy quadratic for dx. See contract-level docs.
    ///      dx = (sqrt(b^2 + 8e36 * M * ethIn) - b) / (2*M), b = 2e18*P0 + 2*M*s.
    function _tokensOut(uint256 sold, uint256 ethIn) internal pure returns (uint256) {
        uint256 b = 2e18 * P0 + 2 * M * sold;
        uint256 disc = b * b + 8e36 * M * ethIn;
        uint256 root = _sqrt(disc);
        // root is always >= b because the added term is non-negative.
        return (root - b) / (2 * M);
    }

    /// @dev ethOut = (P0*dx)/1e18 + (M * (2*s*dx - dx^2)) / (2e36).
    ///      Requires dx <= s (cannot sell more than has been sold).
    function _ethOut(uint256 sold, uint256 dx) internal pure returns (uint256) {
        require(dx <= sold, "sell exceeds sold");
        uint256 linear = (P0 * dx) / 1e18;
        // 2*s*dx - dx^2 = dx * (2*s - dx); dx <= s guarantees 2*s - dx >= s > 0.
        uint256 quadratic = (M * (dx * (2 * sold - dx))) / (2 * 1e36);
        return linear + quadratic;
    }

    /// @dev Babylonian (Newton) integer square root. Returns floor(sqrt(x)).
    function _sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }

    /// @notice Read helper for the frontend and indexer.
    function getCurve(address token)
        external
        view
        returns (bool graduated, uint256 reserveBalance, uint256 tokensSold, uint256 price)
    {
        Curve storage curve = curves[token];
        return (curve.graduated, curve.reserveBalance, curve.tokensSold, _price(curve.tokensSold));
    }
}
