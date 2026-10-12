// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @dev A 6-decimal dollar with EIP-3009 receiveWithAuthorization, shaped like USDG
///      (EIP-712 domain "Global Dollar", version "1"; v, r, s signatures checked with ecrecover).
contract MockUsdg is ERC20, EIP712 {
    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    error CallerMustBePayee();
    error AuthorizationNotYetValid();
    error AuthorizationExpired();
    error AuthorizationUsed();
    error InvalidSignature();

    constructor() ERC20("Global Dollar", "USDG") EIP712("Global Dollar", "1") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

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
    ) external {
        if (to != msg.sender) revert CallerMustBePayee();
        if (block.timestamp <= validAfter) revert AuthorizationNotYetValid();
        if (block.timestamp >= validBefore) revert AuthorizationExpired();
        if (authorizationState[from][nonce]) revert AuthorizationUsed();
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce))
        );
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0) || signer != from) revert InvalidSignature();
        authorizationState[from][nonce] = true;
        _transfer(from, to, value);
    }
}

contract MockToken is ERC20 {
    constructor() ERC20("Holder Token", "HOLD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract RevertingToken {
    function balanceOf(address) external pure returns (uint256) {
        revert("no");
    }
}
