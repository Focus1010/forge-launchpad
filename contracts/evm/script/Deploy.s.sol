// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {BondingCurve} from "../src/BondingCurve.sol";
import {ForgeFactory} from "../src/ForgeFactory.sol";
import {ForgePaymaster} from "../src/ForgePaymaster.sol";
import {IEntryPoint} from "@account-abstraction/interfaces/IEntryPoint.sol";

/// @notice Deploys the Forge EVM contracts to Base Sepolia in the required
///         order: BondingCurve, ForgeFactory, ForgePaymaster. The curve needs
///         the factory address and vice versa, so we predict the factory
///         address from the deployer nonce before deploying the curve.
///
/// Usage:
///   forge script script/Deploy.s.sol \
///     --rpc-url $BASE_SEPOLIA_RPC --broadcast --verify
///
/// Set ENTRY_POINT to the canonical ERC-4337 EntryPoint on Base Sepolia.
/// The v0.7 EntryPoint is 0x0000000071727De22E5E9d8BAf0edAc6f37da032.
contract Deploy is Script {
    // Canonical ERC-4337 v0.7 EntryPoint. Same address across chains.
    address internal constant ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // The factory is the next-but-one contract this account will create.
        uint64 nonce = vm.getNonce(deployer);
        address predictedFactory = vm.computeCreateAddress(deployer, nonce + 1);

        BondingCurve curve = new BondingCurve(predictedFactory);
        ForgeFactory factory = new ForgeFactory(address(curve));
        require(address(factory) == predictedFactory, "factory prediction failed");

        ForgePaymaster paymaster =
            new ForgePaymaster(IEntryPoint(ENTRY_POINT), address(factory), address(curve));

        vm.stopBroadcast();

        console2.log("BondingCurve  :", address(curve));
        console2.log("ForgeFactory  :", address(factory));
        console2.log("ForgePaymaster:", address(paymaster));
        console2.log("Fund the paymaster with testnet ETH via EntryPoint.depositTo(paymaster).");
    }
}
