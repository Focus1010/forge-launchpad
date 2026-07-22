// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {BondingCurve} from "../src/BondingCurve.sol";
import {ForgeFactory} from "../src/ForgeFactory.sol";
import {ForgeToken} from "../src/ForgeToken.sol";

contract ForgeFactoryTest is Test {
    BondingCurve internal curve;
    ForgeFactory internal factory;

    address internal creator = address(0xC0FFEE);

    function setUp() public {
        uint64 nonce = vm.getNonce(address(this));
        address predictedFactory = vm.computeCreateAddress(address(this), nonce + 1);
        curve = new BondingCurve(predictedFactory);
        factory = new ForgeFactory(address(curve));
    }

    function test_DeployRegistersInCurveAndRegistry() public {
        vm.prank(creator);
        address token = factory.deployToken("Cold Stone", "STONE", "ipfs://x", 0);

        (, , , uint256 price) = curve.getCurve(token);
        assertEq(price, curve.P0()); // registered and priced

        address[] memory all = factory.getTokens();
        assertEq(all.length, 1);
        assertEq(all[0], token);

        address[] memory mine = factory.getTokensByCreator(creator);
        assertEq(mine.length, 1);
        assertEq(mine[0], token);
    }

    function test_TokenStoresCreatorAndMetadata() public {
        vm.prank(creator);
        address token = factory.deployToken("Sharp Edge", "EDGE", "ipfs://edge", 0);

        ForgeToken forgeToken = ForgeToken(token);
        assertEq(forgeToken.creator(), creator);
        assertEq(forgeToken.metadataURI(), "ipfs://edge");
        assertEq(forgeToken.name(), "Sharp Edge");
        assertEq(forgeToken.symbol(), "EDGE");
    }

    function test_EmptyNameReverts() public {
        vm.expectRevert(ForgeFactory.EmptyName.selector);
        factory.deployToken("", "X", "ipfs://x", 0);
    }

    function test_EmptySymbolReverts() public {
        vm.expectRevert(ForgeFactory.EmptySymbol.selector);
        factory.deployToken("Name", "", "ipfs://x", 0);
    }

    function test_OnlyCurveCanMint() public {
        vm.prank(creator);
        address token = factory.deployToken("Quiet Core", "CORE", "ipfs://c", 0);

        vm.expectRevert(ForgeToken.OnlyCurve.selector);
        ForgeToken(token).mint(creator, 1e18);
    }
}
