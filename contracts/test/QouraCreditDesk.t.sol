// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, Vm} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {QouraCreditDesk} from "../src/QouraCreditDesk.sol";
import {QouraTwinHash} from "../src/QouraTwinHash.sol";
import {QouraRedeemCheck} from "../src/QouraRedeemCheck.sol";
import {MockUsdg, MockToken, RevertingToken} from "./Mocks.sol";

contract QouraCreditDeskTest is Test {
    uint256 constant FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Shared with src/lib/credit/core.test.ts and circuits/redeem.
    uint256 constant V_PAIR12 = 0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189a;
    uint256 constant V_COMMITMENT = 0x040a9753d2b6067ddc2659378c9725a3fcc92191288e9d5af2a5e69a587dadd2;
    uint256 constant V_LEAF = 0x28df7ac67005efb84c12e56c32971d3f1e351f90bbeedf37c268a1abd7efc739;
    bytes32 constant V_NONCE = 0x1c2559198808dd162bf112115d34daf7439ef07b7c6870f0bd32a150c14ee909;
    uint256 constant V_ZERO20 = 0x2134e76ac5d21aab186c2be1dd8f84ee880a1e46eaf712f9d371b6df22191f3e;
    uint256 constant V_KEY_BINDING = 0x00c7212d98058659f267c1a426161a557e022e77d24f7a65a71c539bd9309220;

    QouraCreditDesk desk;
    QouraRedeemCheck verifier;
    MockUsdg usdg;
    address owner = makeAddr("owner");
    address treasury = makeAddr("treasury");
    address relayer = makeAddr("relayer");
    Vm.Wallet buyer;
    Vm.Wallet attacker;

    event CreditAdded(uint256 indexed index, uint256 commitment, uint256 face, uint256 leaf, uint256 root, uint256 paid, bool holder);
    event TreasuryChanged(address indexed previous, address indexed current);

    function setUp() public {
        vm.warp(1_760_000_000);
        usdg = new MockUsdg();
        verifier = new QouraRedeemCheck();
        desk = new QouraCreditDesk(address(usdg), treasury, address(verifier), owner);
        buyer = vm.createWallet("buyer");
        attacker = vm.createWallet("attacker");
        usdg.mint(buyer.addr, 1_000_000e6);
        usdg.mint(attacker.addr, 1_000_000e6);
        vm.prank(buyer.addr);
        usdg.approve(address(desk), type(uint256).max);
    }

    /* ------------------------------------------------------------ helpers */

    function _buy(uint256 commitment, uint256 face) internal returns (uint256) {
        vm.prank(buyer.addr);
        return desk.buy(commitment, face);
    }

    function _sign(Vm.Wallet memory w, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce)
        internal
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 structHash = keccak256(
            abi.encode(usdg.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(), w.addr, to, value, validAfter, validBefore, nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdg.DOMAIN_SEPARATOR(), structHash));
        (v, r, s) = vm.sign(w, digest);
    }

    struct Auth {
        uint256 commitment;
        uint256 face;
        address from;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    function _auth(uint256 commitment, uint256 face) internal returns (Auth memory a) {
        a.commitment = commitment;
        a.face = face;
        a.from = buyer.addr;
        (a.value,) = desk.quote(buyer.addr, face);
        a.validBefore = block.timestamp + 1 hours;
        (a.v, a.r, a.s) = _sign(buyer, address(desk), a.value, 0, a.validBefore, desk.authorizationNonce(commitment, face));
    }

    function _submit(Auth memory a) internal returns (uint256) {
        vm.prank(relayer);
        return desk.buyWithAuthorization(a.commitment, a.face, a.from, a.value, a.validAfter, a.validBefore, a.v, a.r, a.s);
    }

    /// Root of a depth-20 tree holding `leaves`, computed level by level (independent of the desk's insert).
    function _naiveRoot(uint256[] memory leaves) internal view returns (uint256) {
        uint256[] memory level = leaves;
        for (uint256 l; l < 20; l++) {
            uint256 n = (level.length + 1) / 2;
            if (n == 0) return desk.zeros(20);
            uint256[] memory up = new uint256[](n);
            for (uint256 i; i < n; i++) {
                uint256 right = 2 * i + 1 < level.length ? level[2 * i + 1] : desk.zeros(l);
                up[i] = QouraTwinHash.hash([level[2 * i], right]);
            }
            level = up;
        }
        return level[0];
    }

    /* ------------------------------------------------------------ vectors */

    function test_SharedVectors() public view {
        assertEq(QouraTwinHash.hash([uint256(1), 2]), V_PAIR12);
        assertEq(QouraTwinHash.hash([uint256(11), 22]), V_COMMITMENT);
        assertEq(QouraTwinHash.hash([V_COMMITMENT, 25]), V_LEAF);
        assertEq(keccak256(abi.encode(address(0xaa), V_COMMITMENT, uint256(25))), V_NONCE);
        assertEq(uint256(sha256("qk-000000000000000000000000000000000000000000000000")) >> 8, V_KEY_BINDING);
        assertEq(desk.authorizationNonce(V_COMMITMENT, 25), keccak256(abi.encode(address(desk), V_COMMITMENT, uint256(25))));
        assertEq(desk.zeros(0), 0);
        for (uint256 i = 1; i <= 20; i++) assertEq(desk.zeros(i), QouraTwinHash.hash([desk.zeros(i - 1), desk.zeros(i - 1)]));
        assertEq(desk.zeros(20), V_ZERO20);
        assertEq(desk.currentRoot(), V_ZERO20);
    }

    function test_ZerosOutOfRange() public {
        vm.expectRevert(abi.encodeWithSelector(QouraCreditDesk.LevelOutOfRange.selector, 21));
        desk.zeros(21);
    }

    function test_RootsMatchJsVectors() public {
        uint256[5] memory want = [
            0x1b210660145e73d9adb90da99e79444c860ba552bd4b5d4d89d7d7e4fe3359bc,
            0x0fdfd9f0fda3430a003c58c01c002867a3ae0bbe46d1edcdadf42514d9524752,
            0x2363dff860d02f5d065a9d74d3b7e65ac122086cfa7e31e401ebe06a90e3ebb7,
            0x1729326e8c17a08456e670350f1ebbbdc7e1d05aaa56046b22ff864ebef6fea4,
            0x1ab749881961831d71cc8ae1b132a6eb8efd1e05453451c7e0de95e9765bc134
        ];
        for (uint256 x = 1; x <= 5; x++) {
            _buy(QouraTwinHash.hash([x, x + 100]), 10);
            assertEq(desk.currentRoot(), want[x - 1]);
        }
    }

    function test_InsertMatchesNaiveTree() public {
        uint256[] memory leaves = new uint256[](37);
        for (uint256 i; i < leaves.length; i++) {
            uint256 c = uint256(keccak256(abi.encode("c", i))) % FIELD;
            uint256 face = 1 + (i % 7);
            leaves[i] = QouraTwinHash.hash([c, face]);
            _buy(c, face);
            uint256[] memory prefix = new uint256[](i + 1);
            for (uint256 j; j <= i; j++) prefix[j] = leaves[j];
            if (i < 9 || i == 15 || i == 16 || i == 31 || i == 32 || i == 36) assertEq(desk.currentRoot(), _naiveRoot(prefix));
        }
        assertEq(desk.nextIndex(), 37);
    }

    function test_ConstructorRejectsZeroAddresses() public {
        vm.expectRevert(QouraCreditDesk.ZeroAddress.selector);
        new QouraCreditDesk(address(0), treasury, address(verifier), owner);
        vm.expectRevert(QouraCreditDesk.ZeroAddress.selector);
        new QouraCreditDesk(address(usdg), address(0), address(verifier), owner);
        vm.expectRevert(QouraCreditDesk.ZeroAddress.selector);
        new QouraCreditDesk(address(usdg), treasury, address(0), owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new QouraCreditDesk(address(usdg), treasury, address(verifier), address(0));
    }

    /* ------------------------------------------------------------ buy */

    function test_Buy() public {
        uint256 leaf = QouraTwinHash.hash([V_COMMITMENT, 25]);
        uint256[] memory one = new uint256[](1);
        one[0] = leaf;
        uint256 root = _naiveRoot(one);
        vm.expectEmit(address(desk));
        emit CreditAdded(0, V_COMMITMENT, 25, leaf, root, 25e6, false);
        uint256 index = _buy(V_COMMITMENT, 25);
        assertEq(index, 0);
        assertEq(usdg.balanceOf(treasury), 25e6);
        assertEq(usdg.balanceOf(address(desk)), 0);
        assertEq(desk.faceCount(25), 1);
        assertEq(desk.nextIndex(), 1);
        assertTrue(desk.commitmentUsed(V_COMMITMENT));
        assertTrue(desk.isKnownRoot(root));
        assertTrue(desk.isKnownRoot(V_ZERO20));
    }

    function test_BuyNeedsAllowance() public {
        vm.prank(attacker.addr);
        vm.expectRevert();
        desk.buy(5, 10);
    }

    function test_FaceBounds() public {
        vm.startPrank(buyer.addr);
        vm.expectRevert(abi.encodeWithSelector(QouraCreditDesk.FaceOutOfRange.selector, 0));
        desk.buy(5, 0);
        vm.expectRevert(abi.encodeWithSelector(QouraCreditDesk.FaceOutOfRange.selector, 1001));
        desk.buy(5, 1001);
        desk.buy(5, 1);
        desk.buy(6, 1000);
        vm.stopPrank();
        assertEq(usdg.balanceOf(treasury), 1001e6);
        assertEq(desk.faceCount(1), 1);
        assertEq(desk.faceCount(1000), 1);
        vm.expectRevert(abi.encodeWithSelector(QouraCreditDesk.FaceOutOfRange.selector, 1001));
        desk.quote(buyer.addr, 1001);
    }

    function test_CommitmentRules() public {
        vm.startPrank(buyer.addr);
        vm.expectRevert(QouraCreditDesk.BadCommitment.selector);
        desk.buy(0, 10);
        vm.expectRevert(QouraCreditDesk.BadCommitment.selector);
        desk.buy(FIELD, 10);
        desk.buy(FIELD - 1, 10);
        desk.buy(7, 10);
        vm.expectRevert(abi.encodeWithSelector(QouraCreditDesk.CommitmentTaken.selector, 7));
        desk.buy(7, 10);
        // The same commitment under another face is still the same commitment.
        vm.expectRevert(abi.encodeWithSelector(QouraCreditDesk.CommitmentTaken.selector, 7));
        desk.buy(7, 20);
        vm.stopPrank();
    }

    function test_TreeFull() public {
        // nextIndex sits after qouraToken (20 bytes) and holderDiscountBps (2 bytes) in slot 2.
        bytes32 slot = bytes32(uint256(2));
        uint256 word = uint256(vm.load(address(desk), slot));
        word |= uint256(1 << 20) << 176;
        vm.store(address(desk), slot, bytes32(word));
        assertEq(desk.nextIndex(), 1 << 20);
        vm.prank(buyer.addr);
        vm.expectRevert(QouraCreditDesk.TreeFull.selector);
        desk.buy(5, 10);
    }

    function test_RootHistory() public {
        uint256 first = desk.currentRoot();
        _buy(1, 10);
        uint256 afterOne = desk.currentRoot();
        for (uint256 i = 2; i <= 99; i++) _buy(i, 10);
        // 99 inserts: the initial root is still among the last 100.
        assertTrue(desk.isKnownRoot(first));
        _buy(100, 10);
        assertFalse(desk.isKnownRoot(first));
        assertTrue(desk.isKnownRoot(afterOne));
        _buy(101, 10);
        assertFalse(desk.isKnownRoot(afterOne));
        assertTrue(desk.isKnownRoot(desk.currentRoot()));
        assertFalse(desk.isKnownRoot(0));
        assertFalse(desk.isKnownRoot(12345));
    }

    /* ------------------------------------------------------------ gasless */

    function test_BuyWithAuthorization() public {
        Auth memory a = _auth(V_COMMITMENT, 25);
        uint256 index = _submit(a);
        assertEq(index, 0);
        assertEq(usdg.balanceOf(treasury), 25e6);
        assertEq(usdg.balanceOf(address(desk)), 0);
        assertEq(usdg.balanceOf(buyer.addr), 1_000_000e6 - 25e6);
        assertEq(usdg.balanceOf(relayer), 0);
        assertEq(desk.faceCount(25), 1);
        // Replaying the same authorization fails.
        vm.expectRevert(abi.encodeWithSelector(QouraCreditDesk.CommitmentTaken.selector, V_COMMITMENT));
        _submit(a);
    }

    function test_AuthorizationWithForeignNonceFails() public {
        Auth memory a = _auth(V_COMMITMENT, 25);
        // Signed with a random nonce instead of the one bound to (desk, commitment, face).
        (a.v, a.r, a.s) = _sign(buyer, address(desk), a.value, 0, a.validBefore, keccak256("random"));
        vm.expectRevert(MockUsdg.InvalidSignature.selector);
        _submit(a);
    }

    function test_CopiedAuthorizationCannotFundAnotherCommitment() public {
        Auth memory a = _auth(V_COMMITMENT, 25);
        // An attacker sees the signed authorization and tries to buy their own commitment with it.
        vm.prank(attacker.addr);
        vm.expectRevert(MockUsdg.InvalidSignature.selector);
        desk.buyWithAuthorization(999, a.face, a.from, a.value, 0, a.validBefore, a.v, a.r, a.s);
        // Or the same commitment under another face.
        vm.prank(attacker.addr);
        vm.expectRevert();
        desk.buyWithAuthorization(V_COMMITMENT, 50, a.from, a.value, 0, a.validBefore, a.v, a.r, a.s);
        // Or pulls it into USDG directly: only the payee (the desk) may submit a receive authorization.
        bytes32 nonce = desk.authorizationNonce(V_COMMITMENT, 25);
        vm.prank(attacker.addr);
        vm.expectRevert(MockUsdg.CallerMustBePayee.selector);
        usdg.receiveWithAuthorization(a.from, address(desk), a.value, 0, a.validBefore, nonce, a.v, a.r, a.s);
        // Front-running with the identical call only buys the buyer's own credit.
        vm.prank(attacker.addr);
        desk.buyWithAuthorization(a.commitment, a.face, a.from, a.value, 0, a.validBefore, a.v, a.r, a.s);
        assertTrue(desk.commitmentUsed(V_COMMITMENT));
        assertEq(usdg.balanceOf(attacker.addr), 1_000_000e6);
        vm.expectRevert(abi.encodeWithSelector(QouraCreditDesk.CommitmentTaken.selector, V_COMMITMENT));
        _submit(a);
    }

    function test_AuthorizationFromSomeoneElseFails() public {
        Auth memory a = _auth(V_COMMITMENT, 25);
        a.from = attacker.addr;
        vm.expectRevert(MockUsdg.InvalidSignature.selector);
        _submit(a);
    }

    function test_AuthorizationWrongValue() public {
        Auth memory a = _auth(V_COMMITMENT, 25);
        a.value = 24e6;
        vm.expectRevert(abi.encodeWithSelector(QouraCreditDesk.WrongValue.selector, 24e6, 25e6));
        _submit(a);
        a.value = 26e6;
        vm.expectRevert(abi.encodeWithSelector(QouraCreditDesk.WrongValue.selector, 26e6, 25e6));
        _submit(a);
    }

    function test_AuthorizationExpiredOrEarly() public {
        Auth memory a = _auth(V_COMMITMENT, 25);
        vm.warp(a.validBefore);
        vm.expectRevert(MockUsdg.AuthorizationExpired.selector);
        _submit(a);
        vm.warp(1_760_000_000);
        Auth memory b = _auth(77, 25);
        b.validAfter = block.timestamp + 10;
        (b.v, b.r, b.s) = _sign(buyer, address(desk), b.value, b.validAfter, b.validBefore, desk.authorizationNonce(77, 25));
        vm.expectRevert(MockUsdg.AuthorizationNotYetValid.selector);
        _submit(b);
        vm.warp(b.validAfter + 1);
        _submit(b);
        assertEq(desk.faceCount(25), 1);
    }

    function test_AuthorizationPriceFollowsHolderStatus() public {
        MockToken token = _holderSetup(1000e18, 2500);
        token.mint(buyer.addr, 1000e18);
        Auth memory a = _auth(V_COMMITMENT, 25);
        assertEq(a.value, 18_750_000);
        // The buyer sells the tokens before the relayer submits: the signed value no longer matches.
        vm.prank(buyer.addr);
        token.transfer(attacker.addr, 1);
        vm.expectRevert(abi.encodeWithSelector(QouraCreditDesk.WrongValue.selector, 18_750_000, 25e6));
        _submit(a);
    }

    /* ------------------------------------------------------------ holder pricing */

    function _holderSetup(uint256 minBalance, uint256 bps) internal returns (MockToken token) {
        token = new MockToken();
        vm.startPrank(owner);
        desk.setQouraToken(address(token));
        desk.setHolderTerms(minBalance, bps);
        vm.stopPrank();
    }

    function test_HolderDiscount() public {
        MockToken token = _holderSetup(500e18, 1000);
        (uint256 p, bool h) = desk.quote(buyer.addr, 25);
        assertEq(p, 25e6);
        assertFalse(h);
        token.mint(buyer.addr, 500e18);
        (p, h) = desk.quote(buyer.addr, 25);
        assertEq(p, 22_500_000);
        assertTrue(h);
        uint256 leaf = QouraTwinHash.hash([uint256(5), 25]);
        uint256[] memory one = new uint256[](1);
        one[0] = leaf;
        uint256 root = _naiveRoot(one);
        vm.expectEmit(address(desk));
        emit CreditAdded(0, 5, 25, leaf, root, 22_500_000, true);
        _buy(5, 25);
        assertEq(usdg.balanceOf(treasury), 22_500_000);
    }

    function test_HolderDiscountRoundsUp() public {
        MockToken token = _holderSetup(1, 3);
        token.mint(buyer.addr, 1);
        (uint256 p,) = desk.quote(buyer.addr, 1);
        // 1e6 * 9997 / 10000 = 999,700 exactly.
        assertEq(p, 999_700);
        vm.prank(owner);
        desk.setHolderTerms(1, 2999);
        (p,) = desk.quote(buyer.addr, 7);
        // Whole-dollar faces always divide exactly (1e6 / 10000 = 100); the ceil is defensive.
        assertEq(p, 4_900_700);
    }

    function testFuzz_HolderPriceIsCeil(uint256 face, uint256 bps) public {
        face = bound(face, 1, 1000);
        bps = bound(bps, 0, 3000);
        MockToken token = _holderSetup(1, bps);
        token.mint(buyer.addr, 1);
        (uint256 p, bool h) = desk.quote(buyer.addr, face);
        assertTrue(h);
        uint256 num = face * 1e6 * (10_000 - bps);
        assertEq(p, num / 10_000 + (num % 10_000 == 0 ? 0 : 1));
        assertGe(p * 10_000, num);
        assertLt(p * 10_000, num + 10_000);
    }

    function test_BrokenHolderTokenDoesNotBlockBuying() public {
        RevertingToken bad = new RevertingToken();
        vm.prank(owner);
        desk.setQouraToken(address(bad));
        (uint256 p, bool h) = desk.quote(buyer.addr, 10);
        assertEq(p, 10e6);
        assertFalse(h);
        _buy(5, 10);
    }

    function test_SetQouraTokenOnce() public {
        vm.prank(attacker.addr);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker.addr));
        desk.setQouraToken(address(1));
        vm.startPrank(owner);
        vm.expectRevert(QouraCreditDesk.ZeroAddress.selector);
        desk.setQouraToken(address(0));
        desk.setQouraToken(address(1));
        vm.expectRevert(QouraCreditDesk.TokenAlreadySet.selector);
        desk.setQouraToken(address(2));
        vm.stopPrank();
        assertEq(desk.qouraToken(), address(1));
    }

    function test_HolderTermsBounds() public {
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(QouraCreditDesk.DiscountTooHigh.selector, 3001));
        desk.setHolderTerms(1, 3001);
        desk.setHolderTerms(7, 3000);
        vm.stopPrank();
        assertEq(desk.holderMinBalance(), 7);
        assertEq(desk.holderDiscountBps(), 3000);
        vm.prank(attacker.addr);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker.addr));
        desk.setHolderTerms(1, 1);
    }

    /* ------------------------------------------------------------ owner */

    function test_Pause() public {
        vm.prank(attacker.addr);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker.addr));
        desk.pause();
        vm.prank(owner);
        desk.pause();
        vm.prank(buyer.addr);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        desk.buy(5, 10);
        Auth memory a = _auth(5, 10);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        _submit(a);
        // Reads and redeem checks keep working while buying is paused.
        assertFalse(desk.checkRedeem(hex"", desk.currentRoot(), 10, 1, 1));
        assertEq(desk.currentRoot(), V_ZERO20);
        vm.prank(owner);
        desk.unpause();
        _submit(a);
        assertEq(desk.nextIndex(), 1);
    }

    function test_SetTreasury() public {
        vm.prank(owner);
        vm.expectRevert(QouraCreditDesk.ZeroAddress.selector);
        desk.setTreasury(address(0));
        address next = makeAddr("next");
        vm.expectEmit(address(desk));
        emit TreasuryChanged(treasury, next);
        vm.prank(owner);
        desk.setTreasury(next);
        _buy(5, 10);
        assertEq(usdg.balanceOf(next), 10e6);
        vm.prank(attacker.addr);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker.addr));
        desk.setTreasury(attacker.addr);
    }

    function test_OwnershipIsTwoStep() public {
        address next = makeAddr("nextOwner");
        vm.prank(owner);
        desk.transferOwnership(next);
        assertEq(desk.owner(), owner);
        vm.prank(next);
        desk.acceptOwnership();
        assertEq(desk.owner(), next);
    }

    /* ------------------------------------------------------------ gas */

    function test_GasBuy() public {
        _buy(1, 10); // warm the tree like a live desk
        vm.prank(buyer.addr);
        uint256 g = gasleft();
        desk.buy(2, 10);
        emit log_named_uint("gas buy (2nd credit)", g - gasleft());
        for (uint256 i = 3; i <= 64; i++) _buy(i, 10);
        vm.prank(buyer.addr);
        g = gasleft();
        desk.buy(65, 10);
        emit log_named_uint("gas buy (65th credit)", g - gasleft());
    }

    function test_GasBuyWithAuthorization() public {
        _buy(1, 10);
        Auth memory a = _auth(2, 10);
        vm.prank(relayer);
        uint256 g = gasleft();
        desk.buyWithAuthorization(a.commitment, a.face, a.from, a.value, a.validAfter, a.validBefore, a.v, a.r, a.s);
        emit log_named_uint("gas buyWithAuthorization (2nd credit)", g - gasleft());
    }
}
