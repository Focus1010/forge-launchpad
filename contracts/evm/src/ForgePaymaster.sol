// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {BasePaymaster} from "@account-abstraction/core/BasePaymaster.sol";
import {IEntryPoint} from "@account-abstraction/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "@account-abstraction/interfaces/PackedUserOperation.sol";
import {ForgeFactory} from "./ForgeFactory.sol";
import {BondingCurve} from "./BondingCurve.sol";

/// @title ForgePaymaster
/// @notice ERC-4337 paymaster that sponsors gas for a small set of Forge
///         actions: deploying a token, buying under a value cap, and selling.
///         It inspects the smart account's execute() calldata, recovers the
///         inner call's target and selector, and only sponsors when both match
///         the Forge factory or curve and a whitelisted function.
///
/// @dev Built on the account-abstraction v0.7 BasePaymaster. This assumes the
///      smart account exposes the common single-call entry point:
///
///          execute(address dest, uint256 value, bytes func)
///
///      with selector 0xb61d27f6. Accounts using a different execute shape
///      would need their selector added below. This is testnet code and is
///      intentionally permissive about which account implementation is used.
contract ForgePaymaster is BasePaymaster {
    /// @notice Standard smart-account execute(address,uint256,bytes) selector.
    bytes4 public constant EXECUTE_SELECTOR = 0xb61d27f6;

    /// @notice Whitelisted Forge selectors.
    bytes4 public constant DEPLOY_TOKEN_SELECTOR = ForgeFactory.deployToken.selector;
    bytes4 public constant BUY_SELECTOR = BondingCurve.buy.selector;
    bytes4 public constant SELL_SELECTOR = BondingCurve.sell.selector;

    /// @notice Value ceiling for sponsored buys: 0.01 ETH.
    uint256 public constant MAX_SPONSORED_BUY = 0.01 ether;

    /// @notice The Forge factory whose deployToken calls are sponsored.
    address public immutable factory;

    /// @notice The Forge bonding curve whose buy and sell calls are sponsored.
    address public immutable bondingCurve;

    error TargetNotAllowed();
    error SelectorNotAllowed();
    error BuyValueTooHigh();
    error UnsupportedAccountCall();

    constructor(IEntryPoint entryPoint_, address factory_, address bondingCurve_)
        BasePaymaster(entryPoint_)
    {
        factory = factory_;
        bondingCurve = bondingCurve_;
    }

    /// @inheritdoc BasePaymaster
    /// @dev Reverting here rejects sponsorship. We return empty context and a
    ///      zero validation data (valid, no time bounds) when the op is allowed.
    function _validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32, /* userOpHash */
        uint256 /* maxCost */
    ) internal view override returns (bytes memory context, uint256 validationData) {
        (address dest, uint256 value, bytes memory innerData) = _decodeExecute(userOp.callData);

        bytes4 innerSelector = _selectorOf(innerData);

        if (innerSelector == DEPLOY_TOKEN_SELECTOR) {
            if (dest != factory) revert TargetNotAllowed();
        } else if (innerSelector == BUY_SELECTOR) {
            if (dest != bondingCurve) revert TargetNotAllowed();
            if (value > MAX_SPONSORED_BUY) revert BuyValueTooHigh();
        } else if (innerSelector == SELL_SELECTOR) {
            if (dest != bondingCurve) revert TargetNotAllowed();
        } else {
            revert SelectorNotAllowed();
        }

        return ("", 0);
    }

    /// @dev Decode a standard execute(address,uint256,bytes) account call.
    function _decodeExecute(bytes calldata callData)
        internal
        pure
        returns (address dest, uint256 value, bytes memory innerData)
    {
        if (callData.length < 4) revert UnsupportedAccountCall();
        if (bytes4(callData[:4]) != EXECUTE_SELECTOR) revert UnsupportedAccountCall();

        // abi.decode the three execute() arguments from the calldata after the
        // 4-byte selector.
        (dest, value, innerData) = abi.decode(callData[4:], (address, uint256, bytes));
    }

    /// @dev Read the leading 4-byte selector from an in-memory calldata blob.
    function _selectorOf(bytes memory data) internal pure returns (bytes4 selector) {
        if (data.length < 4) revert UnsupportedAccountCall();
        assembly {
            // Skip the 32-byte length prefix, load the first word, keep top 4 bytes.
            selector := mload(add(data, 0x20))
        }
    }
}
