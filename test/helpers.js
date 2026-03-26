import hre from "hardhat";

// Constants matching the contract
export const ORACLE_FEE = 500_000n; // USDC 0.50
export const ONE_USDC = 1_000_000n; // 1 USDC in 6-decimal format
export const TEN_USDC = 10_000_000n;
export const FIVE_THOUSAND_USDC = 5_000_000_000n; // 5000 USDC in 6-decimal format
export const ONE_DAY = 86400; // seconds

/**
 * Base fixture: deploys MockUSDC + BGAmble, mints tokens, approves spending.
 *
 * Signers layout:
 *   deployer  – contract deployer (not an oracle, not a player)
 *   oracle1, oracle2, oracle3, oracle4 – the four oracles
 *   alice, bob, carol, dave, eve – players
 *   unapproved – has tokens but no approval (for negative tests)
 */
export async function deployFixture() {
  const connection = await hre.network.connect();
  const { ethers, networkHelpers } = connection;

  const [deployer, oracle1, oracle2, oracle3, oracle4, alice, bob, carol, dave, eve, unapproved] =
    await ethers.getSigners();

  // Deploy MockUSDC
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();

  // Deploy BGAmble
  const BGAmble = await ethers.getContractFactory("BGAmble");
  const bgamble = await BGAmble.deploy(await usdc.getAddress(), [
    oracle1.address,
    oracle2.address,
    oracle3.address,
    oracle4.address,
  ]);

  const players = [alice, bob, carol, dave, eve];
  const allAccounts = [...players, unapproved];

  // Mint 10,000 USDC to every test account
  const mintAmount = 10_000n * ONE_USDC;
  for (const account of allAccounts) {
    await usdc.mint(account.address, mintAmount);
  }

  // Approve max spending for every player (not for `unapproved`)
  const bgambleAddress = await bgamble.getAddress();
  for (const player of players) {
    await usdc.connect(player).approve(bgambleAddress, ethers.MaxUint256);
  }

  return {
    ethers,
    networkHelpers,
    usdc,
    bgamble,
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
    unapproved,
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
  await bgamble.connect(alice).create(1, TEN_USDC, 2, winner);
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
  await bgamble.connect(alice).create(1, TEN_USDC, 2, winnerA);
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
  await bgamble.connect(alice).create(1, TEN_USDC, 2, winnerA);
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
  await bgamble.connect(alice).create(1, TEN_USDC, 3, winnerA);
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
