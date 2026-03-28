import hre from "hardhat";

// Constants matching the contract
export const ORACLE_FEE_BPS = 100n; // 1% in basis points
export const TEN_POL = 10n; // 10 whole POL tokens (the default bet amount in tests)
export const TEN_THOUSAND_POL = 10_000n; // max bet amount
export const POL = 10n ** 18n; // 1 POL in wei — used for msg.value and balance math
export const GAS_MARGIN = POL; // 1 POL margin for gas cost tolerance in balance checks
export const ONE_DAY = 86400; // seconds

/**
 * Computes the 1% oracle fee for a given prize pool in wei.
 */
export function oracleFee(prizePoolWei) {
  return prizePoolWei * ORACLE_FEE_BPS / 10_000n;
}

/**
 * Base fixture: deploys BGAmble with 4 oracle addresses.
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

  // Deploy BGAmble (no token needed — uses native POL)
  const BGAmble = await ethers.getContractFactory("BGAmble");
  const bgamble = await BGAmble.deploy([
    oracle1.address,
    oracle2.address,
    oracle3.address,
    oracle4.address,
  ]);

  return {
    ethers,
    networkHelpers,
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
  await bgamble.connect(alice).create(1, TEN_POL, 2, winner, { value: TEN_POL * POL });
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
  await bgamble.connect(alice).create(1, TEN_POL, 2, winnerA, { value: TEN_POL * POL });
  await bgamble.connect(bob).join(1, winnerB, { value: TEN_POL * POL });
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
  await bgamble.connect(alice).create(1, TEN_POL, 2, winnerA, { value: TEN_POL * POL });
  await bgamble.connect(bob).join(1, winnerB, { value: TEN_POL * POL });
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
  await bgamble.connect(alice).create(1, TEN_POL, 3, winnerA, { value: TEN_POL * POL });
  await bgamble.connect(bob).join(1, winnerB, { value: TEN_POL * POL });
  await bgamble.connect(carol).join(1, winnerC, { value: TEN_POL * POL });
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
