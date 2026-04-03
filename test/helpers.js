import hre from "hardhat";

// Constants matching the contract
export const ORACLE_FEE = 500_000n; // 0.50 USDT in 6-decimal base units
export const MIN_BET_AMOUNT_USDT = 5n;
export const TEN_USDT = 10n; // 10 whole USDT tokens (the default bet amount in tests)
export const MAX_BET_AMOUNT_USDT = 250n;
export const USDT_UNIT = 10n ** 6n; // 1 USDT in smallest unit — used for balance math
export const ONE_DAY = 86400; // seconds

/**
 * Returns the fixed 0.50 USDT oracle fee (ignores arguments for backward compat).
 */
export function oracleFee() {
  return ORACLE_FEE;
}

/**
 * Convenience: returns the USDT balance (bigint) of `address`.
 */
export async function bal(usdtContract, address) {
  return usdtContract.balanceOf(address);
}

/**
 * Base fixture: deploys MockUSDT + BGAmble, mints & approves USDT for all players.
 *
 * Signers layout:
 *   deployer  – contract deployer (not an oracle, not a player)
 *   oracle1, oracle2, oracle3, oracle4 – the four oracles
 *   alice, bob, carol, dave, eve – players
 */
export async function deployFixture() {
  const connection = await hre.network.connect();
  const { ethers, networkHelpers } = connection;

  const [deployer, oracle1, oracle2, oracle3, oracle4, alice, bob, carol, dave, eve] =
    await ethers.getSigners();

  // Deploy MockUSDT
  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const usdt = await MockUSDT.deploy();

  // Deploy BGAmble with USDT address
  const BGAmble = await ethers.getContractFactory("BGAmble");
  const bgamble = await BGAmble.deploy(
    [oracle1.address, oracle2.address, oracle3.address, oracle4.address],
    await usdt.getAddress(),
  );

  const bgambleAddress = await bgamble.getAddress();

  // Mint USDT to all players and approve BGAmble to spend it
  const mintAmount = 1_000_000n * USDT_UNIT; // 1 million USDT each
  for (const signer of [alice, bob, carol, dave, eve]) {
    await usdt.mint(signer.address, mintAmount);
    await usdt.connect(signer).approve(bgambleAddress, mintAmount);
  }

  return {
    ethers,
    networkHelpers,
    bgamble,
    usdt,
    deployer,
    oracle1,
    oracle2,
    oracle3,
    oracle4,
    alice,
    bob,
    carol,
    dave,
    eve,
  };
}

/**
 * Creates a 2-player bet (Open state, 1 slot remaining).
 * Returns betId = 1.
 */
export async function createOpenBetFixture() {
  const base = await deployFixture();
  const { bgamble, alice } = base;
  const winner = 1;
  await bgamble.connect(alice).create(1, TEN_USDT, 2, winner);
  return { ...base, betId: 1, winner };
}

/**
 * Creates a 2-player bet with both slots filled (Confirming state).
 */
export async function confirmingBetFixture() {
  const base = await deployFixture();
  const { bgamble, alice, bob } = base;
  const winnerA = 1;
  const winnerB = 2;
  await bgamble.connect(alice).create(1, TEN_USDT, 2, winnerA);
  await bgamble.connect(bob).join(1, winnerB);
  return { ...base, betId: 1, winnerA, winnerB };
}

/**
 * Creates a 2-player bet that is fully locked (both confirmed).
 */
export async function lockedBetFixture() {
  const base = await deployFixture();
  const { bgamble, alice, bob } = base;
  const winnerA = 1;
  const winnerB = 2;
  await bgamble.connect(alice).create(1, TEN_USDT, 2, winnerA);
  await bgamble.connect(bob).join(1, winnerB);
  await bgamble.connect(alice).confirm(1);
  await bgamble.connect(bob).confirm(1);
  return { ...base, betId: 1, winnerA, winnerB };
}

/**
 * Creates a 3-player locked bet.
 */
export async function lockedBet3PlayersFixture() {
  const base = await deployFixture();
  const { bgamble, alice, bob, carol } = base;
  const winnerA = 1;
  const winnerB = 2;
  const winnerC = 3;
  await bgamble.connect(alice).create(1, TEN_USDT, 3, winnerA);
  await bgamble.connect(bob).join(1, winnerB);
  await bgamble.connect(carol).join(1, winnerC);
  await bgamble.connect(alice).confirm(1);
  await bgamble.connect(bob).confirm(1);
  await bgamble.connect(carol).confirm(1);
  return { ...base, betId: 1, winnerA, winnerB, winnerC };
}

/**
 * Advance time by `seconds` and mine a block.
 */
export async function timeTravel(networkHelpers, seconds) {
  await networkHelpers.time.increase(seconds);
}
