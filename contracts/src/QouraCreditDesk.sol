// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {QouraTwinHash} from "./QouraTwinHash.sol";
import {IQouraRedeemCheck} from "./QouraRedeemCheck.sol";

/// @notice EIP-3009 pull used by the gasless path (USDG implements it).
interface IQouraUsdgAuth {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

/// @title QouraCreditDesk
/// @notice Sells AI compute credits for USDG. Each purchase appends
///         leaf = Poseidon(commitment, face) to a depth-20 Merkle tree. Redeeming a credit is a
///         zero-knowledge proof of one leaf of a given face, checked by `checkRedeem`; the contract
///         never learns which leaf, and never sees a redeem (spend tags live with the gateway).
/// @dev Payments go straight to the treasury in the purchase transaction; nothing rests here.
///      The owner can pause buying and set pricing terms, but cannot touch leaves, roots or funds.
contract QouraCreditDesk is Ownable2Step, Pausable {
    using SafeERC20 for IERC20;

    uint256 public constant FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 public constant TREE_DEPTH = 20;
    uint256 public constant ROOT_HISTORY = 100;
    uint256 public constant FACE_MIN = 1;
    uint256 public constant FACE_MAX = 1000;
    uint256 public constant MAX_DISCOUNT_BPS = 3000;
    uint256 private constant UNIT = 1e6; // USDG has 6 decimals

    IERC20 public immutable usdg;
    IQouraRedeemCheck public immutable verifier;

    // One slot: read together on every purchase.
    address public qouraToken;
    uint16 public holderDiscountBps;
    uint32 public nextIndex;
    uint32 private rootCursor;

    address public treasury;
    uint256 public holderMinBalance;
    /// @notice filledSubtrees[i]: the root of the last completed left subtree at level i
    ///         (written only when a leaf completes it, which is all a later right sibling needs).
    uint256[TREE_DEPTH] public filledSubtrees;
    uint256[ROOT_HISTORY] private roots;

    mapping(uint256 => bool) public commitmentUsed;
    mapping(uint256 => uint256) public faceCount;

    event CreditAdded(uint256 indexed index, uint256 commitment, uint256 face, uint256 leaf, uint256 root, uint256 paid, bool holder);
    event TreasuryChanged(address indexed previous, address indexed current);
    event QouraTokenSet(address indexed token);
    event HolderTermsChanged(uint256 minBalance, uint256 discountBps);

    error ZeroAddress();
    error FaceOutOfRange(uint256 face);
    error BadCommitment();
    error CommitmentTaken(uint256 commitment);
    error TreeFull();
    error LevelOutOfRange(uint256 level);
    error WrongValue(uint256 value, uint256 price);
    error TokenAlreadySet();
    error DiscountTooHigh(uint256 bps);

    constructor(address usdg_, address treasury_, address verifier_, address initialOwner) Ownable(initialOwner) {
        if (usdg_ == address(0) || treasury_ == address(0) || verifier_ == address(0)) revert ZeroAddress();
        usdg = IERC20(usdg_);
        verifier = IQouraRedeemCheck(verifier_);
        treasury = treasury_;
        roots[0] = zeros(TREE_DEPTH);
        emit TreasuryChanged(address(0), treasury_);
    }

    /* ------------------------------------------------------------------ buying */

    /// @notice Buys a credit of `face` whole US dollars for msg.sender's price (needs a USDG allowance).
    function buy(uint256 commitment, uint256 face) external whenNotPaused returns (uint256 index) {
        (uint256 price, bool holder) = quote(msg.sender, face);
        index = _add(commitment, face, price, holder);
        usdg.safeTransferFrom(msg.sender, treasury, price);
    }

    /// @notice Buys a credit with an EIP-3009 authorization signed by `from`. Anyone may submit it.
    /// @dev The authorization nonce must be keccak256(abi.encode(this, commitment, face)), so a copied
    ///      signature can only ever fund the commitment it was signed for.
    function buyWithAuthorization(
        uint256 commitment,
        uint256 face,
        address from,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external whenNotPaused returns (uint256 index) {
        index = _addFor(commitment, face, from, value);
        _pull(from, value, validAfter, validBefore, authorizationNonce(commitment, face), v, r, s);
    }

    function _addFor(uint256 commitment, uint256 face, address from, uint256 value) private returns (uint256) {
        (uint256 price, bool holder) = quote(from, face);
        if (value != price) revert WrongValue(value, price);
        return _add(commitment, face, price, holder);
    }

    function _pull(address from, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)
        private
    {
        IQouraUsdgAuth(address(usdg)).receiveWithAuthorization(from, address(this), value, validAfter, validBefore, nonce, v, r, s);
        usdg.safeTransfer(treasury, value);
    }

    /// @notice The EIP-3009 nonce a buyer signs for `commitment` and `face`.
    function authorizationNonce(uint256 commitment, uint256 face) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), commitment, face));
    }

    /// @notice Price in USDG base units for `buyer`, and whether the holder discount applies.
    function quote(address buyer, uint256 face) public view returns (uint256 price, bool holder) {
        if (face < FACE_MIN || face > FACE_MAX) revert FaceOutOfRange(face);
        price = face * UNIT;
        holder = _isHolder(buyer);
        if (holder) price = (price * (10_000 - holderDiscountBps) + 9_999) / 10_000;
    }

    function _isHolder(address buyer) private view returns (bool) {
        address token = qouraToken;
        if (token == address(0)) return false;
        // A broken token must not block buying: any failure means "not a holder".
        try IERC20(token).balanceOf(buyer) returns (uint256 bal) {
            return bal >= holderMinBalance;
        } catch {
            return false;
        }
    }

    function _add(uint256 commitment, uint256 face, uint256 paid, bool holder) private returns (uint256 index) {
        if (commitment == 0 || commitment >= FIELD) revert BadCommitment();
        if (commitmentUsed[commitment]) revert CommitmentTaken(commitment);
        commitmentUsed[commitment] = true;
        uint256 leaf = QouraTwinHash.hash([commitment, face]);
        uint256 root;
        (index, root) = _insert(leaf);
        unchecked {
            faceCount[face]++;
        }
        emit CreditAdded(index, commitment, face, leaf, root, paid, holder);
    }

    function _insert(uint256 leaf) private returns (uint256 index, uint256 root) {
        index = nextIndex;
        if (index >= 1 << TREE_DEPTH) revert TreeFull();
        uint256 node = leaf;
        uint256 at = index;
        // Lower bits of index all ones up to level i <=> this leaf completes the subtree of size 2^i.
        uint256 complete = index + 1;
        for (uint256 i; i < TREE_DEPTH; ) {
            if ((at & 1) == 0) {
                if ((complete & ((1 << i) - 1)) == 0) filledSubtrees[i] = node;
                node = QouraTwinHash.hash([node, zeros(i)]);
            } else {
                node = QouraTwinHash.hash([filledSubtrees[i], node]);
            }
            at >>= 1;
            unchecked {
                ++i;
            }
        }
        root = node;
        uint32 cursor = uint32((uint256(rootCursor) + 1) % ROOT_HISTORY);
        rootCursor = cursor;
        roots[cursor] = root;
        nextIndex = uint32(index + 1);
    }

    /* ------------------------------------------------------------------ reads */

    function currentRoot() public view returns (uint256) {
        return roots[rootCursor];
    }

    /// @notice True for the current root and the 99 before it.
    function isKnownRoot(uint256 root) public view returns (bool) {
        if (root == 0) return false;
        uint256 cursor = rootCursor;
        uint256 i = cursor;
        do {
            if (roots[i] == root) return true;
            i = i == 0 ? ROOT_HISTORY - 1 : i - 1;
        } while (i != cursor);
        return false;
    }

    /// @notice Checks a redeem proof: the credit of `face` is a leaf under a known root, `spendTag`
    ///         belongs to it, and the proof is bound to `keyBinding`. Returns false instead of reverting.
    function checkRedeem(bytes calldata proof, uint256 root, uint256 face, uint256 spendTag, uint256 keyBinding)
        external
        view
        returns (bool)
    {
        if (face < FACE_MIN || face > FACE_MAX) return false;
        if (spendTag >= FIELD || keyBinding >= FIELD) return false;
        if (!isKnownRoot(root)) return false;
        bytes32[] memory inputs = new bytes32[](4);
        inputs[0] = bytes32(root);
        inputs[1] = bytes32(face);
        inputs[2] = bytes32(spendTag);
        inputs[3] = bytes32(keyBinding);
        try verifier.verify(proof, inputs) returns (bool ok) {
            return ok;
        } catch {
            return false;
        }
    }

    /// @notice zeros(0) = 0, zeros(i) = Poseidon(zeros(i-1), zeros(i-1)).
    function zeros(uint256 i) public pure returns (uint256) {
        if (i == 0) return 0;
        if (i == 1) return 0x2098f5fb9e239eab3ceac3f27b81e481dc3124d55ffed523a839ee8446b64864;
        if (i == 2) return 0x1069673dcdb12263df301a6ff584a7ec261a44cb9dc68df067a4774460b1f1e1;
        if (i == 3) return 0x18f43331537ee2af2e3d758d50f72106467c6eea50371dd528d57eb2b856d238;
        if (i == 4) return 0x07f9d837cb17b0d36320ffe93ba52345f1b728571a568265caac97559dbc952a;
        if (i == 5) return 0x2b94cf5e8746b3f5c9631f4c5df32907a699c58c94b2ad4d7b5cec1639183f55;
        if (i == 6) return 0x2dee93c5a666459646ea7d22cca9e1bcfed71e6951b953611d11dda32ea09d78;
        if (i == 7) return 0x078295e5a22b84e982cf601eb639597b8b0515a88cb5ac7fa8a4aabe3c87349d;
        if (i == 8) return 0x2fa5e5f18f6027a6501bec864564472a616b2e274a41211a444cbe3a99f3cc61;
        if (i == 9) return 0x0e884376d0d8fd21ecb780389e941f66e45e7acce3e228ab3e2156a614fcd747;
        if (i == 10) return 0x1b7201da72494f1e28717ad1a52eb469f95892f957713533de6175e5da190af2;
        if (i == 11) return 0x1f8d8822725e36385200c0b201249819a6e6e1e4650808b5bebc6bface7d7636;
        if (i == 12) return 0x2c5d82f66c914bafb9701589ba8cfcfb6162b0a12acf88a8d0879a0471b5f85a;
        if (i == 13) return 0x14c54148a0940bb820957f5adf3fa1134ef5c4aaa113f4646458f270e0bfbfd0;
        if (i == 14) return 0x190d33b12f986f961e10c0ee44d8b9af11be25588cad89d416118e4bf4ebe80c;
        if (i == 15) return 0x22f98aa9ce704152ac17354914ad73ed1167ae6596af510aa5b3649325e06c92;
        if (i == 16) return 0x2a7c7c9b6ce5880b9f6f228d72bf6a575a526f29c66ecceef8b753d38bba7323;
        if (i == 17) return 0x2e8186e558698ec1c67af9c14d463ffc470043c9c2988b954d75dd643f36b992;
        if (i == 18) return 0x0f57c5571e9a4eab49e2c8cf050dae948aef6ead647392273546249d1c1ff10f;
        if (i == 19) return 0x1830ee67b5fb554ad5f63d4388800e1cfe78e310697d46e43c9ce36134f72cca;
        if (i == 20) return 0x2134e76ac5d21aab186c2be1dd8f84ee880a1e46eaf712f9d371b6df22191f3e;
        revert LevelOutOfRange(i);
    }

    /* ------------------------------------------------------------------ owner */

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Sets the $QOURA token used for holder pricing. Once.
    function setQouraToken(address token) external onlyOwner {
        if (qouraToken != address(0)) revert TokenAlreadySet();
        if (token == address(0)) revert ZeroAddress();
        qouraToken = token;
        emit QouraTokenSet(token);
    }

    function setHolderTerms(uint256 minBalance, uint256 discountBps) external onlyOwner {
        if (discountBps > MAX_DISCOUNT_BPS) revert DiscountTooHigh(discountBps);
        holderMinBalance = minBalance;
        holderDiscountBps = uint16(discountBps);
        emit HolderTermsChanged(minBalance, discountBps);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        emit TreasuryChanged(treasury, treasury_);
        treasury = treasury_;
    }
}
