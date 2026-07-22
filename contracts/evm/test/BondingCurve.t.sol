// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {BondingCurve} from "../src/BondingCurve.sol";
import {ForgeFactory} from "../src/ForgeFactory.sol";
import {ForgeToken} from "../src/ForgeToken.sol";

contract BondingCurveTest is Test {
    BondingCurve internal curve;
    ForgeFactory internal factory;
    address internal token;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        // The factory needs the curve address, and the curve needs the factory
        // address. Compute the factory's future address so we can wire both.
        uint64 nonce = vm.getNonce(address(this));
        address predictedFactory = vm.computeCreateAddress(address(this), nonce + 1);

        curve = new BondingCurve(predictedFactory);
        factory = new ForgeFactory(address(curve));
        require(address(factory) == predictedFactory, "factory address mismatch");

        token = factory.deployToken("Dark Wolf", "WOLF", "ipfs://meta", 0);

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function test_InitialPriceIsLaunchPrice() public view {
        assertEq(curve.getPrice(token), curve.P0());
    }

    function test_BuyMintsTokensAndCreditsReserve() public {
        uint256 ethIn = 0.01 ether;
        uint256 expected = curve.getTokensOut(token, ethIn);

        vm.prank(alice);
        curve.buy{value: ethIn}(token);

        assertEq(ForgeToken(token).balanceOf(alice), expected);
        (, uint256 reserve, uint256 sold, ) = curve.getCurve(token);
        assertEq(reserve, ethIn);
        assertEq(sold, expected);
    }

    function test_PriceIncreasesAfterBuy() public {
        uint256 before = curve.getPrice(token);
        vm.prank(alice);
        curve.buy{value: 0.05 ether}(token);
        assertGt(curve.getPrice(token), before);
    }

    function test_SellReturnsEthAndBurnsTokens() public {
        vm.prank(alice);
        curve.buy{value: 0.05 ether}(token);
        uint256 held = ForgeToken(token).balanceOf(alice);

        uint256 aliceEthBefore = alice.balance;
        uint256 quote = curve.getEthOut(token, held);

        vm.prank(alice);
        curve.sell(token, held);

        assertEq(ForgeToken(token).balanceOf(alice), 0);
        assertEq(alice.balance, aliceEthBefore + quote);
    }

    function test_BuySellRoundTripDoesNotCreateEth() public {
        // A single buyer who immediately sells everything must never get back
        // more ETH than they put in (no free money from rounding).
        uint256 ethIn = 0.1 ether;
        vm.startPrank(alice);
        curve.buy{value: ethIn}(token);
        uint256 held = ForgeToken(token).balanceOf(alice);
        uint256 ethOut = curve.getEthOut(token, held);
        vm.stopPrank();
        assertLe(ethOut, ethIn);
    }

    function test_GraduationLocksTheCurve() public {
        // Push the reserve past the 0.5 ETH target.
        vm.prank(alice);
        curve.buy{value: 0.5 ether}(token);

        (bool graduated, uint256 reserve, , ) = curve.getCurve(token);
        assertTrue(graduated);
        assertGe(reserve, curve.GRADUATION_TARGET());

        // Further trades revert.
        vm.prank(bob);
        vm.expectRevert(BondingCurve.AlreadyGraduated.selector);
        curve.buy{value: 0.01 ether}(token);
    }

    function test_BuyRevertsOnZeroValue() public {
        vm.prank(alice);
        vm.expectRevert(BondingCurve.ZeroAmount.selector);
        curve.buy{value: 0}(token);
    }

    function test_SellRevertsWhenExceedingSold() public {
        vm.prank(alice);
        curve.buy{value: 0.01 ether}(token);
        uint256 held = ForgeToken(token).balanceOf(alice);

        vm.prank(alice);
        vm.expectRevert(); // "sell exceeds sold" require in _ethOut
        curve.sell(token, held + 1e18);
    }

    function test_UnregisteredTokenReverts() public {
        vm.prank(alice);
        vm.expectRevert(BondingCurve.NotRegistered.selector);
        curve.buy{value: 0.01 ether}(address(0xDEAD));
    }

    function testFuzz_TwoBuyersPriceIsMonotonic(uint96 a, uint96 b) public {
        a = uint96(bound(a, 1e14, 0.2 ether));
        b = uint96(bound(b, 1e14, 0.2 ether));

        uint256 priceStart = curve.getPrice(token);
        vm.prank(alice);
        curve.buy{value: a}(token);
        uint256 priceMid = curve.getPrice(token);
        vm.prank(bob);
        curve.buy{value: b}(token);
        uint256 priceEnd = curve.getPrice(token);

        assertGe(priceMid, priceStart);
        assertGe(priceEnd, priceMid);
    }
}
