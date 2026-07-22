// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ForgeToken} from "./ForgeToken.sol";
import {BondingCurve} from "./BondingCurve.sol";

/// @title ForgeFactory
/// @notice Deploys new Forge tokens and registers them with the bonding curve.
///         Keeps an onchain registry of every token and of the tokens each
///         creator has launched so the indexer and profile pages can enumerate
///         them without scanning logs.
contract ForgeFactory {
    /// @notice The bonding curve every deployed token trades on.
    BondingCurve public immutable curve;

    /// @notice All tokens ever deployed, in launch order.
    address[] private allTokens;

    /// @notice Tokens deployed by each creator.
    mapping(address => address[]) private tokensByCreator;

    /// @notice Chain hint values. EVM is informational only on this contract.
    uint8 public constant CHAIN_EVM = 0;
    uint8 public constant CHAIN_SOLANA = 1;

    event TokenLaunched(
        address indexed creator,
        address indexed token,
        string name,
        string symbol,
        string metadataURI,
        uint256 timestamp
    );

    error EmptyName();
    error EmptySymbol();

    constructor(address curve_) {
        curve = BondingCurve(curve_);
    }

    /// @notice Deploy a new token and register it on the curve.
    /// @param name Token name.
    /// @param symbol Token symbol.
    /// @param metadataURI IPFS URI for the metadata JSON.
    /// @param chain Chain hint. Informational on the EVM side.
    /// @return token The address of the newly deployed token.
    function deployToken(
        string memory name,
        string memory symbol,
        string memory metadataURI,
        uint8 chain
    ) external returns (address token) {
        if (bytes(name).length == 0) revert EmptyName();
        if (bytes(symbol).length == 0) revert EmptySymbol();
        // chain is a hint only; silence unused-variable tooling without cost.
        chain;

        ForgeToken deployed = new ForgeToken(name, symbol, metadataURI, msg.sender, address(curve));
        token = address(deployed);

        curve.register(token);

        allTokens.push(token);
        tokensByCreator[msg.sender].push(token);

        emit TokenLaunched(msg.sender, token, name, symbol, metadataURI, block.timestamp);
    }

    /// @notice Every token ever deployed.
    function getTokens() external view returns (address[] memory) {
        return allTokens;
    }

    /// @notice Tokens deployed by a specific creator.
    function getTokensByCreator(address creator) external view returns (address[] memory) {
        return tokensByCreator[creator];
    }

    /// @notice Total number of tokens deployed.
    function tokenCount() external view returns (uint256) {
        return allTokens.length;
    }
}
