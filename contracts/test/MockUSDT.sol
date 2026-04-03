// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Minimal ERC-20 mock used exclusively in tests. USDT uses 6 decimals.
contract MockUSDT is ERC20 {
    constructor() ERC20("Mock USDT", "USDT") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @dev Anyone can mint — test-only convenience.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

