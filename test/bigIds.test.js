import { describe, it } from "node:test";
import { expect } from "chai";
import {
  deployFixture,
  ORACLE_FEE,
  TEN_USDC,
} from "./helpers.js";

/**
 * Tests using realistic BGA IDs (uint64 range) to verify the contract
 * handles large table IDs and player IDs correctly.
 *
 * Recent BGA table IDs are in the ~800 million range.
 * BGA player IDs can also be large numbers.
 */

// Realistic BGA IDs
const BGA_TABLE_ID = 824948982n;
const BGA_PLAYER_A = 85291463n;
const BGA_PLAYER_B = 93847261n;
const BGA_PLAYER_C = 101538294n;

// IDs that exceed uint32 max (4,294,967,295)
const LARGE_TABLE_ID = 5_000_000_000n;
const LARGE_PLAYER_A = 10_000_000_001n;
const LARGE_PLAYER_B = 10_000_000_002n;

describe("big BGA IDs (uint64)", function () {
  // ── Realistic BGA IDs ───────────────────────────────────────────

  it("should create a bet with a realistic BGA table ID", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    await expect(bgamble.connect(alice).create(BGA_TABLE_ID, TEN_USDC, 2, BGA_PLAYER_A)).to.not.be.revert(ethers);

    const bet = await bgamble.bets(1);
    expect(bet.bgaTableId).to.equal(BGA_TABLE_ID);
  });

  it("should store realistic BGA player IDs as predictedWinner", async function () {
    const { bgamble, alice, bob } = await deployFixture();
    await bgamble.connect(alice).create(BGA_TABLE_ID, TEN_USDC, 2, BGA_PLAYER_A);
    await bgamble.connect(bob).join(1, BGA_PLAYER_B);

    const participants = await bgamble.getParticipants(1);
    expect(participants[0].predictedWinner).to.equal(BGA_PLAYER_A);
    expect(participants[1].predictedWinner).to.equal(BGA_PLAYER_B);
  });

  it("should emit BetCreated with realistic BGA IDs", async function () {
    const { bgamble, alice } = await deployFixture();
    await expect(bgamble.connect(alice).create(BGA_TABLE_ID, TEN_USDC, 2, BGA_PLAYER_A))
      .to.emit(bgamble, "BetCreated")
      .withArgs(1, BGA_TABLE_ID, () => true, alice.address, TEN_USDC, 2, BGA_PLAYER_A);
  });

  it("should resolve correctly with realistic BGA player IDs as winners", async function () {
    const { bgamble, usdc, oracle1, oracle2, oracle3, alice, bob } = await deployFixture();
    await bgamble.connect(alice).create(BGA_TABLE_ID, TEN_USDC, 2, BGA_PLAYER_A);
    await bgamble.connect(bob).join(1, BGA_PLAYER_B);
    await bgamble.connect(alice).confirm(1);
    await bgamble.connect(bob).confirm(1);

    const aliceBefore = await usdc.balanceOf(alice.address);

    await bgamble.connect(oracle1).reportResult(1, [BGA_PLAYER_A]);
    await bgamble.connect(oracle2).reportResult(1, [BGA_PLAYER_A]);
    await bgamble.connect(oracle3).reportResult(1, [BGA_PLAYER_A]);

    const bet = await bgamble.bets(1);
    expect(bet.state).to.equal(3); // Resolved

    const aliceAfter = await usdc.balanceOf(alice.address);
    expect(aliceAfter - aliceBefore).to.equal(TEN_USDC * 2n - ORACLE_FEE);
  });

  it("should store realistic resolvedWinnerIds", async function () {
    const { bgamble, oracle1, oracle2, oracle3, alice, bob } = await deployFixture();
    await bgamble.connect(alice).create(BGA_TABLE_ID, TEN_USDC, 2, BGA_PLAYER_A);
    await bgamble.connect(bob).join(1, BGA_PLAYER_B);
    await bgamble.connect(alice).confirm(1);
    await bgamble.connect(bob).confirm(1);

    await bgamble.connect(oracle1).reportResult(1, [BGA_PLAYER_A]);
    await bgamble.connect(oracle2).reportResult(1, [BGA_PLAYER_A]);
    await bgamble.connect(oracle3).reportResult(1, [BGA_PLAYER_A]);

    const resolved = await bgamble.getResolvedWinnerIds(1);
    expect(resolved.length).to.equal(1);
    expect(resolved[0]).to.equal(BGA_PLAYER_A);
  });

  it("should return realistic IDs in getBetSummary", async function () {
    const { bgamble, alice, bob } = await deployFixture();
    await bgamble.connect(alice).create(BGA_TABLE_ID, TEN_USDC, 2, BGA_PLAYER_A);
    await bgamble.connect(bob).join(1, BGA_PLAYER_B);

    const summary = await bgamble.getBetSummary(1);
    expect(summary.bgaTableId).to.equal(BGA_TABLE_ID);
    expect(summary.participants[0].predictedWinner).to.equal(BGA_PLAYER_A);
    expect(summary.participants[1].predictedWinner).to.equal(BGA_PLAYER_B);
  });

  it("should compute correct oracle result hash for realistic IDs", async function () {
    const { bgamble, ethers, oracle1, alice, bob } = await deployFixture();
    await bgamble.connect(alice).create(BGA_TABLE_ID, TEN_USDC, 2, BGA_PLAYER_A);
    await bgamble.connect(bob).join(1, BGA_PLAYER_B);
    await bgamble.connect(alice).confirm(1);
    await bgamble.connect(bob).confirm(1);

    await bgamble.connect(oracle1).reportResult(1, [BGA_PLAYER_A]);

    const expectedHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(["uint64[]"], [[BGA_PLAYER_A]])
    );
    const hash = await bgamble.getOracleResultHash(1, oracle1.address);
    expect(hash).to.equal(expectedHash);
  });

  // ── IDs exceeding uint32 max ────────────────────────────────────

  it("should handle table IDs exceeding uint32 max", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    await expect(bgamble.connect(alice).create(LARGE_TABLE_ID, TEN_USDC, 2, LARGE_PLAYER_A)).to.not.be.revert(ethers);

    const bet = await bgamble.bets(1);
    expect(bet.bgaTableId).to.equal(LARGE_TABLE_ID);
  });

  it("should handle player IDs exceeding uint32 max", async function () {
    const { bgamble, alice, bob } = await deployFixture();
    await bgamble.connect(alice).create(LARGE_TABLE_ID, TEN_USDC, 2, LARGE_PLAYER_A);
    await bgamble.connect(bob).join(1, LARGE_PLAYER_B);

    const participants = await bgamble.getParticipants(1);
    expect(participants[0].predictedWinner).to.equal(LARGE_PLAYER_A);
    expect(participants[1].predictedWinner).to.equal(LARGE_PLAYER_B);
  });

  it("should resolve correctly with winner IDs exceeding uint32 max", async function () {
    const { bgamble, usdc, oracle1, oracle2, oracle3, alice, bob } = await deployFixture();
    await bgamble.connect(alice).create(LARGE_TABLE_ID, TEN_USDC, 2, LARGE_PLAYER_A);
    await bgamble.connect(bob).join(1, LARGE_PLAYER_B);
    await bgamble.connect(alice).confirm(1);
    await bgamble.connect(bob).confirm(1);

    const aliceBefore = await usdc.balanceOf(alice.address);

    await bgamble.connect(oracle1).reportResult(1, [LARGE_PLAYER_A]);
    await bgamble.connect(oracle2).reportResult(1, [LARGE_PLAYER_A]);
    await bgamble.connect(oracle3).reportResult(1, [LARGE_PLAYER_A]);

    const aliceAfter = await usdc.balanceOf(alice.address);
    expect(aliceAfter - aliceBefore).to.equal(TEN_USDC * 2n - ORACLE_FEE);

    const resolved = await bgamble.getResolvedWinnerIds(1);
    expect(resolved[0]).to.equal(LARGE_PLAYER_A);
  });

  it("should match oracle consensus on large winner IDs", async function () {
    const { bgamble, ethers, oracle1, oracle2, oracle3, alice, bob } = await deployFixture();
    await bgamble.connect(alice).create(LARGE_TABLE_ID, TEN_USDC, 2, LARGE_PLAYER_A);
    await bgamble.connect(bob).join(1, LARGE_PLAYER_B);
    await bgamble.connect(alice).confirm(1);
    await bgamble.connect(bob).confirm(1);

    const expectedHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(["uint64[]"], [[LARGE_PLAYER_A]])
    );

    await bgamble.connect(oracle1).reportResult(1, [LARGE_PLAYER_A]);
    expect(await bgamble.getOracleResultHash(1, oracle1.address)).to.equal(expectedHash);
    expect(await bgamble.getResultVotes(1, expectedHash)).to.equal(1);

    await bgamble.connect(oracle2).reportResult(1, [LARGE_PLAYER_A]);
    expect(await bgamble.getResultVotes(1, expectedHash)).to.equal(2);

    // Not yet resolved (need 3/4)
    let bet = await bgamble.bets(1);
    expect(bet.state).to.equal(2);

    await bgamble.connect(oracle3).reportResult(1, [LARGE_PLAYER_A]);
    expect(await bgamble.getResultVotes(1, expectedHash)).to.equal(3);

    bet = await bgamble.bets(1);
    expect(bet.state).to.equal(3); // Resolved
  });

  it("should split payout among multiple winners with large IDs (3 players)", async function () {
    const { bgamble, usdc, oracle1, oracle2, oracle3, alice, bob, carol } = await deployFixture();
    await bgamble.connect(alice).create(BGA_TABLE_ID, TEN_USDC, 3, BGA_PLAYER_A);
    await bgamble.connect(bob).join(1, BGA_PLAYER_B);
    await bgamble.connect(carol).join(1, BGA_PLAYER_C);
    await bgamble.connect(alice).confirm(1);
    await bgamble.connect(bob).confirm(1);
    await bgamble.connect(carol).confirm(1);

    const aliceBefore = await usdc.balanceOf(alice.address);
    const bobBefore = await usdc.balanceOf(bob.address);

    // Two winners
    const winners = [BGA_PLAYER_A, BGA_PLAYER_B];
    await bgamble.connect(oracle1).reportResult(1, winners);
    await bgamble.connect(oracle2).reportResult(1, winners);
    await bgamble.connect(oracle3).reportResult(1, winners);

    const payout = TEN_USDC * 3n - ORACLE_FEE;
    const share = payout / 2n;
    const remainder = payout % 2n;

    expect(await usdc.balanceOf(alice.address) - aliceBefore).to.equal(share);
    expect(await usdc.balanceOf(bob.address) - bobBefore).to.equal(share + remainder);

    const resolved = await bgamble.getResolvedWinnerIds(1);
    expect(resolved.length).to.equal(2);
    expect(resolved[0]).to.equal(BGA_PLAYER_A);
    expect(resolved[1]).to.equal(BGA_PLAYER_B);
  });

  it("should leave contract with 0 balance after resolution with large IDs", async function () {
    const { bgamble, usdc, oracle1, oracle2, oracle3, alice, bob } = await deployFixture();
    await bgamble.connect(alice).create(LARGE_TABLE_ID, TEN_USDC, 2, LARGE_PLAYER_A);
    await bgamble.connect(bob).join(1, LARGE_PLAYER_B);
    await bgamble.connect(alice).confirm(1);
    await bgamble.connect(bob).confirm(1);

    await bgamble.connect(oracle1).reportResult(1, [LARGE_PLAYER_A]);
    await bgamble.connect(oracle2).reportResult(1, [LARGE_PLAYER_A]);
    await bgamble.connect(oracle3).reportResult(1, [LARGE_PLAYER_A]);

    expect(await usdc.balanceOf(await bgamble.getAddress())).to.equal(0);
  });

  it("should emit OracleReported event with large winner IDs", async function () {
    const { bgamble, ethers, oracle1, alice, bob } = await deployFixture();
    await bgamble.connect(alice).create(LARGE_TABLE_ID, TEN_USDC, 2, LARGE_PLAYER_A);
    await bgamble.connect(bob).join(1, LARGE_PLAYER_B);
    await bgamble.connect(alice).confirm(1);
    await bgamble.connect(bob).confirm(1);

    const expectedHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(["uint64[]"], [[LARGE_PLAYER_A]])
    );

    await expect(bgamble.connect(oracle1).reportResult(1, [LARGE_PLAYER_A]))
      .to.emit(bgamble, "OracleReported")
      .withArgs(1, () => true, oracle1.address, expectedHash, [LARGE_PLAYER_A]);
  });
});


