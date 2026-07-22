// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title ForgeToken
/// @notice A standard ERC-20 launched through the Forge platform. Supply is not
///         pre-minted. Tokens are minted on demand by the bonding curve when a
///         buyer purchases, and burned when a seller sells, up to a fixed cap of
///         one billion tokens. Only the bonding curve contract may mint or burn.
contract ForgeToken is ERC20 {
    /// @notice Hard cap on total supply: 1,000,000,000 tokens (18 decimals).
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 1e18;

    /// @notice The bonding curve contract authorized to mint and burn.
    address public immutable curve;

    /// @notice The wallet that launched this token.
    address public immutable creator;

    /// @notice Unix timestamp of deployment.
    uint256 public immutable launchedAt;

    /// @notice IPFS URI pointing to the token metadata JSON.
    string public metadataURI;

    error OnlyCurve();
    error MaxSupplyExceeded();

    modifier onlyCurve() {
        if (msg.sender != curve) revert OnlyCurve();
        _;
    }

    /// @param name_ Token name.
    /// @param symbol_ Token symbol.
    /// @param metadataURI_ IPFS URI for the metadata JSON.
    /// @param creator_ The launching wallet.
    /// @param curve_ The bonding curve contract that controls minting.
    constructor(
        string memory name_,
        string memory symbol_,
        string memory metadataURI_,
        address creator_,
        address curve_
    ) ERC20(name_, symbol_) {
        metadataURI = metadataURI_;
        creator = creator_;
        curve = curve_;
        launchedAt = block.timestamp;
    }

    /// @notice Mint tokens to a buyer. Callable only by the bonding curve.
    /// @dev Reverts if the mint would push total supply past the cap.
    function mint(address to, uint256 amount) external onlyCurve {
        if (totalSupply() + amount > MAX_SUPPLY) revert MaxSupplyExceeded();
        _mint(to, amount);
    }

    /// @notice Burn tokens from a seller. Callable only by the bonding curve.
    function burn(address from, uint256 amount) external onlyCurve {
        _burn(from, amount);
    }
}
