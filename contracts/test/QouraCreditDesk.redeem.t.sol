// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {QouraCreditDesk} from "../src/QouraCreditDesk.sol";
import {QouraTwinHash} from "../src/QouraTwinHash.sol";
import {QouraRedeemCheck} from "../src/QouraRedeemCheck.sol";
import {MockUsdg} from "./Mocks.sol";

/// End to end: credits bought on the desk, a redeem proof made by the site's TypeScript prover
/// (test/ffi/redeem.mts through vm.ffi), checked by the real UltraHonk verifier.
contract QouraCreditDeskRedeemTest is Test {
    uint256 constant FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 constant NULLIFIER = 0x0badc0ffee0badc0ffee0badc0ffee0badc0ffee0badc0ffee0badc0ffee01;
    uint256 constant SECRET = 0x05ec7e705ec7e705ec7e705ec7e705ec7e705ec7e705ec7e705ec7e705ec702;

    QouraCreditDesk desk;
    QouraRedeemCheck verifier;
    MockUsdg usdg;
    address buyer = makeAddr("buyer");
    uint256[] leaves;

    function setUp() public {
        usdg = new MockUsdg();
        verifier = new QouraRedeemCheck();
        desk = new QouraCreditDesk(address(usdg), makeAddr("treasury"), address(verifier), makeAddr("owner"));
        usdg.mint(buyer, 1_000_000e6);
        vm.prank(buyer);
        usdg.approve(address(desk), type(uint256).max);
    }

    function _buy(uint256 commitment, uint256 face) internal {
        vm.prank(buyer);
        desk.buy(commitment, face);
        leaves.push(QouraTwinHash.hash([commitment, face]));
    }

    function _fill(uint256 n, uint256 salt) internal {
        for (uint256 i; i < n; i++) _buy(uint256(keccak256(abi.encode(salt, i))) % FIELD, i % 2 == 0 ? 25 : 10);
    }

    function _keyBinding(string memory apiKey) internal pure returns (uint256) {
        return uint256(sha256(bytes(apiKey))) >> 8;
    }

    function _prove(uint256 face, uint256 keyBinding) internal returns (bytes memory proof, uint256 root, uint256 spendTag, uint256 index) {
        string memory list = "[";
        for (uint256 i; i < leaves.length; i++) {
            list = string.concat(list, i == 0 ? "" : ",", '"', vm.toString(bytes32(leaves[i])), '"');
        }
        string memory json = string.concat(
            '{"face":',
            vm.toString(face),
            ',"nullifier":"',
            vm.toString(bytes32(NULLIFIER)),
            '","secret":"',
            vm.toString(bytes32(SECRET)),
            '","keyBinding":"',
            vm.toString(bytes32(keyBinding)),
            '","leaves":',
            list,
            "]}"
        );
        string[] memory cmd = new string[](5);
        cmd[0] = "node";
        cmd[1] = "--no-warnings";
        cmd[2] = "test/ffi/redeem.mts";
        cmd[3] = "prove";
        cmd[4] = json;
        (proof, root, spendTag, index) = abi.decode(vm.ffi(cmd), (bytes, uint256, uint256, uint256));
    }

    struct Redeem {
        bytes proof;
        uint256 root;
        uint256 spendTag;
        uint256 kb;
    }

    function _check(Redeem memory r, uint256 face) internal view returns (bool) {
        return desk.checkRedeem(r.proof, r.root, face, r.spendTag, r.kb);
    }

    function test_RedeemWithRealProof() public {
        _fill(6, 1);
        _buy(QouraTwinHash.hash([NULLIFIER, SECRET]), 25);
        _fill(5, 2);
        Redeem memory r;
        r.kb = _keyBinding("qk-0123456789abcdef0123456789abcdef0123456789abcdef");
        uint256 index;
        (r.proof, r.root, r.spendTag, index) = _prove(25, r.kb);
        assertEq(index, 6);
        assertEq(r.root, desk.currentRoot(), "TypeScript tree matches the desk");

        uint256 g = gasleft();
        bool ok = _check(r, 25);
        emit log_named_uint("gas checkRedeem (eth_call)", g - gasleft());
        assertTrue(ok, "real proof accepted");

        bytes32[] memory pub = new bytes32[](4);
        pub[0] = bytes32(r.root);
        pub[1] = bytes32(uint256(25));
        pub[2] = bytes32(r.spendTag);
        pub[3] = bytes32(r.kb);
        assertTrue(verifier.verify(r.proof, pub));

        _refusesChangedStatements(r);
        _refusesChangedProofs(r);

        // The proof stays valid while its root is among the last 100, then expires.
        _fill(99, 3);
        assertTrue(_check(r, 25), "root still in history");
        _fill(1, 4);
        assertFalse(_check(r, 25), "root left the history");
    }

    function _refusesChangedStatements(Redeem memory r) internal view {
        Redeem memory x = Redeem(r.proof, r.root, r.spendTag, r.kb ^ 1);
        assertFalse(_check(x, 25), "other key binding");
        x.kb = _keyBinding("qk-ffffffffffffffffffffffffffffffffffffffffffffffff");
        assertFalse(_check(x, 25), "other api key");
        x.kb = r.kb + FIELD;
        assertFalse(_check(x, 25), "key binding outside the field");
        assertFalse(_check(r, 10), "other face");
        assertFalse(_check(r, 50), "larger face");
        assertFalse(_check(r, 0), "face zero");
        assertFalse(_check(r, 1001), "face too large");
        x = Redeem(r.proof, r.root, r.spendTag ^ 1, r.kb);
        assertFalse(_check(x, 25), "other spend tag");
        x.spendTag = r.spendTag + FIELD;
        assertFalse(_check(x, 25), "spend tag outside the field");
        x = Redeem(r.proof, r.root ^ 1, r.spendTag, r.kb);
        assertFalse(_check(x, 25), "unknown root");
    }

    function _refusesChangedProofs(Redeem memory r) internal view {
        bytes memory tampered = bytes.concat(r.proof);
        tampered[tampered.length / 2] = bytes1(uint8(tampered[tampered.length / 2]) ^ 0x01);
        assertFalse(_check(Redeem(tampered, r.root, r.spendTag, r.kb), 25), "tampered proof");
        bytes memory shortProof = new bytes(r.proof.length - 32);
        for (uint256 i; i < shortProof.length; i++) shortProof[i] = r.proof[i];
        assertFalse(_check(Redeem(shortProof, r.root, r.spendTag, r.kb), 25), "truncated proof");
        assertFalse(_check(Redeem(hex"", r.root, r.spendTag, r.kb), 25), "empty proof");
    }

    function test_RedeemFirstLeaf() public {
        uint256 commitment = QouraTwinHash.hash([NULLIFIER, SECRET]);
        _buy(commitment, 10);
        _fill(3, 5);
        uint256 kb = _keyBinding("qk-00000000000000000000000000000000000000000000000a");
        (bytes memory proof, uint256 root, uint256 spendTag, uint256 index) = _prove(10, kb);
        assertEq(index, 0);
        assertEq(root, desk.currentRoot());
        assertTrue(desk.checkRedeem(proof, root, 10, spendTag, kb));
        // Same credit, a different face claimed by the prover: the leaf does not exist, so no proof.
        assertFalse(desk.checkRedeem(proof, root, 25, spendTag, kb));
    }
}
