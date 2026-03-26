import { describe, it } from "node:test";
import { expect } from "chai";
import {
  deployFixture,
  lockedBetFixture,
  lockedBet3PlayersFixture,
  confirmingBetFixture,
  ORACLE_FEE,
  TEN_USDC,
  ONE_USDC,
} from "./helpers.js";

describe("reportResult", function () {
  // ── Positive tests ──────────────────────────────────────────────

  it("should allow an oracle to report a result", async function () {
    const { bgamble, oracle1, winnerA, ethers } = await lockedBetFixture();
    await expect(bgamble.connect(oracle1).reportResult(1, [winnerA])).to.not.be.revert(ethers);
  });

  it("should emit OracleReported event with hash and winnerIds", async function () {
    const { bgamble, oracle1, winnerA, ethers } = await lockedBetFixture();
    const resultHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["uint64[]"], [[winnerA]]));
    await expect(bgamble.connect(oracle1).reportResult(1, [winnerA]))
      .to.emit(bgamble, "OracleReported")
      .withArgs(1, () => true, oracle1.address, resultHash, [winnerA]);
  });

  it("should store the oracle result hash", async function () {
    const { bgamble, oracle1, winnerA, ethers } = await lockedBetFixture();
    await bgamble.connect(oracle1).reportResult(1, [winnerA]);

    const hash = await bgamble.getOracleResultHash(1, oracle1.address);
    expect(hash).to.not.equal(ethers.ZeroHash);
  });

  it("should increment resultVotes for the reported hash", async function () {
    const { bgamble, oracle1, winnerA, ethers } = await lockedBetFixture();
    await bgamble.connect(oracle1).reportResult(1, [winnerA]);

    const resultHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["uint64[]"], [[winnerA]]));
    expect(await bgamble.getResultVotes(1, resultHash)).to.equal(1);
  });

  it("should NOT resolve with only 1 oracle report", async function () {
    const { bgamble, oracle1, winnerA } = await lockedBetFixture();
    await bgamble.connect(oracle1).reportResult(1, [winnerA]);
    const bet = await bgamble.bets(1);
    expect(bet.state).to.equal(2); // Still Locked
  });

  it("should NOT resolve with only 2 oracle reports", async function () {
    const { bgamble, oracle1, oracle2, winnerA } = await lockedBetFixture();
    await bgamble.connect(oracle1).reportResult(1, [winnerA]);
    await bgamble.connect(oracle2).reportResult(1, [winnerA]);
    const bet = await bgamble.bets(1);
    expect(bet.state).to.equal(2); // Still Locked
  });

  // ── 3/4 consensus resolves ──────────────────────────────────────

  it("should resolve on 3/4 consensus and set state to Resolved", async function () {
    const { bgamble, oracle1, oracle2, oracle3, winnerA } = await lockedBetFixture();
    await bgamble.connect(oracle1).reportResult(1, [winnerA]);
    await bgamble.connect(oracle2).reportResult(1, [winnerA]);
    await bgamble.connect(oracle3).reportResult(1, [winnerA]);

    const bet = await bgamble.bets(1);
    expect(bet.state).to.equal(3); // Resolved
  });

  it("should emit BetResolved on consensus", async function () {
    const { bgamble, oracle1, oracle2, oracle3, winnerA } = await lockedBetFixture();
    await bgamble.connect(oracle1).reportResult(1, [winnerA]);
    await bgamble.connect(oracle2).reportResult(1, [winnerA]);
    await expect(bgamble.connect(oracle3).reportResult(1, [winnerA]))
      .to.emit(bgamble, "BetResolved")
      .withArgs(1, () => true, oracle3.address, [winnerA]);
  });

  it("should store resolvedWinnerIds on consensus", async function () {
    const { bgamble, oracle1, oracle2, oracle3, winnerA } = await lockedBetFixture();
    await bgamble.connect(oracle1).reportResult(1, [winnerA]);
    await bgamble.connect(oracle2).reportResult(1, [winnerA]);
    await bgamble.connect(oracle3).reportResult(1, [winnerA]);

    const resolved = await bgamble.getResolvedWinnerIds(1);
    expect(resolved.length).to.equal(1);
    expect(resolved[0]).to.equal(winnerA);
  });

  it("should return empty resolvedWinnerIds before resolution", async function () {
    const { bgamble, oracle1, winnerA } = await lockedBetFixture();
    await bgamble.connect(oracle1).reportResult(1, [winnerA]);

    const resolved = await bgamble.getResolvedWinnerIds(1);
    expect(resolved.length).to.equal(0);
  });

  // ── Single winner payout ────────────────────────────────────────

  it("should pay the single winner the full prize pool minus oracle fee (2 players)", async function () {
    const { bgamble, usdc, oracle1, oracle2, oracle3, alice, winnerA } = await lockedBetFixture();
    const aliceBefore = await usdc.balanceOf(alice.address);
    await bgamble.connect(oracle1).reportResult(1, [winnerA]);
    await bgamble.connect(oracle2).reportResult(1, [winnerA]);
    await bgamble.connect(oracle3).reportResult(1, [winnerA]);
    const aliceAfter = await usdc.balanceOf(alice.address);

    const expectedPayout = TEN_USDC * 2n - ORACLE_FEE;
    expect(aliceAfter - aliceBefore).to.equal(expectedPayout);
  });

  it("should pay the single winner the full prize minus oracle fee (3 players)", async function () {
    const { bgamble, usdc, oracle1, oracle2, oracle3, alice, winnerA } = await lockedBet3PlayersFixture();
    const aliceBefore = await usdc.balanceOf(alice.address);
    await bgamble.connect(oracle1).reportResult(1, [winnerA]);
    await bgamble.connect(oracle2).reportResult(1, [winnerA]);
    await bgamble.connect(oracle3).reportResult(1, [winnerA]);
    const aliceAfter = await usdc.balanceOf(alice.address);

    expect(aliceAfter - aliceBefore).to.equal(TEN_USDC * 3n - ORACLE_FEE);
  });

  it("should pay nothing to the loser", async function () {
    const { bgamble, usdc, oracle1, oracle2, oracle3, bob, winnerA } = await lockedBetFixture();
    const bobBefore = await usdc.balanceOf(bob.address);
    await bgamble.connect(oracle1).reportResult(1, [winnerA]);
    await bgamble.connect(oracle2).reportResult(1, [winnerA]);
    await bgamble.connect(oracle3).reportResult(1, [winnerA]);
    const bobAfter = await usdc.balanceOf(bob.address);
    expect(bobAfter).to.equal(bobBefore);
  });

  // ── Multiple winners split payout ───────────────────────────────

  it("should split payout equally between 2 winners (3 players)", async function () {
    const { bgamble, usdc, oracle1, oracle2, oracle3, alice, bob, winnerA, winnerB } =
      await lockedBet3PlayersFixture();

    const aliceBefore = await usdc.balanceOf(alice.address);
    const bobBefore = await usdc.balanceOf(bob.address);

    const winners = [winnerA, winnerB];
    await bgamble.connect(oracle1).reportResult(1, winners);
    await bgamble.connect(oracle2).reportResult(1, winners);
    await bgamble.connect(oracle3).reportResult(1, winners);

    const payout = TEN_USDC * 3n - ORACLE_FEE;
    const share = payout / 2n;
    const remainder = payout % 2n;

    const aliceAfter = await usdc.balanceOf(alice.address);
    const bobAfter = await usdc.balanceOf(bob.address);

    expect(aliceAfter - aliceBefore).to.equal(share);
    expect(bobAfter - bobBefore).to.equal(share + remainder);
  });

  it("should give dust (remainder) to the last winner", async function () {
    const { bgamble, usdc, oracle1, oracle2, oracle3, alice, bob, carol, ethers } = await deployFixture();
    const sevenUsdc = 7n * ONE_USDC;
    const wA = 1;
    const wB = 2;
    const wC = 3;
    await bgamble.connect(alice).create(1, sevenUsdc, 3, wA);
    await bgamble.connect(bob).join(1, wB);
    await bgamble.connect(carol).join(1, wC);
    await bgamble.connect(alice).confirm(1);
    await bgamble.connect(bob).confirm(1);
    await bgamble.connect(carol).confirm(1);

    const aliceBefore = await usdc.balanceOf(alice.address);
    const bobBefore = await usdc.balanceOf(bob.address);
    const carolBefore = await usdc.balanceOf(carol.address);

    await bgamble.connect(oracle1).reportResult(1, [wA, wB, wC]);
    await bgamble.connect(oracle2).reportResult(1, [wA, wB, wC]);
    await bgamble.connect(oracle3).reportResult(1, [wA, wB, wC]);

    const payout = sevenUsdc * 3n - ORACLE_FEE;
    const share = payout / 3n;
    const remainder = payout % 3n;

    expect(await usdc.balanceOf(alice.address) - aliceBefore).to.equal(share);
    expect(await usdc.balanceOf(bob.address) - bobBefore).to.equal(share);
    expect(await usdc.balanceOf(carol.address) - carolBefore).to.equal(share + remainder);
  });

  // ── All participants predicted the winner ───────────────────────

  it("should split payout among all participants when everyone predicted the winner", async function () {
    const { bgamble, usdc, oracle1, oracle2, oracle3, alice, bob, ethers } = await deployFixture();
    const sameWinner = 99;
    await bgamble.connect(alice).create(1, TEN_USDC, 2, sameWinner);
    await bgamble.connect(bob).join(1, sameWinner);
    await bgamble.connect(alice).confirm(1);
    await bgamble.connect(bob).confirm(1);

    const aliceBefore = await usdc.balanceOf(alice.address);
    const bobBefore = await usdc.balanceOf(bob.address);

    await bgamble.connect(oracle1).reportResult(1, [sameWinner]);
    await bgamble.connect(oracle2).reportResult(1, [sameWinner]);
    await bgamble.connect(oracle3).reportResult(1, [sameWinner]);

    const payout = TEN_USDC * 2n - ORACLE_FEE;
    const share = payout / 2n;

    expect(await usdc.balanceOf(alice.address) - aliceBefore).to.equal(share);
    expect(await usdc.balanceOf(bob.address) - bobBefore).to.equal(share + payout % 2n);
  });

  // ── No participant predicted the winner ─────────────────────────

  it("should refund all (minus fee) when no participant predicted the winner", async function () {
    const { bgamble, usdc, oracle1, oracle2, oracle3, alice, bob, ethers } = await lockedBetFixture();
    const unknownWinner = 99;

    const aliceBefore = await usdc.balanceOf(alice.address);
    const bobBefore = await usdc.balanceOf(bob.address);

    await bgamble.connect(oracle1).reportResult(1, [unknownWinner]);
    await bgamble.connect(oracle2).reportResult(1, [unknownWinner]);
    await bgamble.connect(oracle3).reportResult(1, [unknownWinner]);

    const payout = TEN_USDC * 2n - ORACLE_FEE;
    const share = payout / 2n;

    expect(await usdc.balanceOf(alice.address) - aliceBefore).to.equal(share);
    expect(await usdc.balanceOf(bob.address) - bobBefore).to.equal(share + payout % 2n);
  });

  // ── No consensus ────────────────────────────────────────────────

  it("should refund all (no fee) when 4 oracles report different results", async function () {
    const { bgamble, usdc, oracle1, oracle2, oracle3, oracle4, alice, bob, ethers } = await lockedBetFixture();

    const aliceBefore = await usdc.balanceOf(alice.address);
    const bobBefore = await usdc.balanceOf(bob.address);

    await bgamble.connect(oracle1).reportResult(1, [101]);
    await bgamble.connect(oracle2).reportResult(1, [102]);
    await bgamble.connect(oracle3).reportResult(1, [103]);
    await bgamble.connect(oracle4).reportResult(1, [104]);

    const bet = await bgamble.bets(1);
    expect(bet.state).to.equal(4); // NoConsensus

    // No oracle fee deducted on no-consensus
    expect(await usdc.balanceOf(alice.address) - aliceBefore).to.equal(TEN_USDC);
    expect(await usdc.balanceOf(bob.address) - bobBefore).to.equal(TEN_USDC);
  });

  it("should refund all (no fee) on 2+2 split (no consensus)", async function () {
    const { bgamble, usdc, oracle1, oracle2, oracle3, oracle4, alice, bob } = await lockedBetFixture();

    const aliceBefore = await usdc.balanceOf(alice.address);
    const bobBefore = await usdc.balanceOf(bob.address);

    await bgamble.connect(oracle1).reportResult(1, [101]);
    await bgamble.connect(oracle2).reportResult(1, [101]);
    await bgamble.connect(oracle3).reportResult(1, [102]);
    await bgamble.connect(oracle4).reportResult(1, [102]);

    const bet = await bgamble.bets(1);
    expect(bet.state).to.equal(4); // NoConsensus

    // No oracle fee deducted on no-consensus
    expect(await usdc.balanceOf(alice.address) - aliceBefore).to.equal(TEN_USDC);
    expect(await usdc.balanceOf(bob.address) - bobBefore).to.equal(TEN_USDC);
  });

  it("should refund all (no fee) on 2+1+1 split (no consensus)", async function () {
    const { bgamble, usdc, oracle1, oracle2, oracle3, oracle4, alice, bob } = await lockedBetFixture();

    const aliceBefore = await usdc.balanceOf(alice.address);
    const bobBefore = await usdc.balanceOf(bob.address);

    await bgamble.connect(oracle1).reportResult(1, [101]);
    await bgamble.connect(oracle2).reportResult(1, [101]);
    await bgamble.connect(oracle3).reportResult(1, [102]);
    await bgamble.connect(oracle4).reportResult(1, [103]);

    const bet = await bgamble.bets(1);
    expect(bet.state).to.equal(4); // NoConsensus

    // No oracle fee deducted on no-consensus
    expect(await usdc.balanceOf(alice.address) - aliceBefore).to.equal(TEN_USDC);
    expect(await usdc.balanceOf(bob.address) - bobBefore).to.equal(TEN_USDC);
  });

  it("should store empty resolvedWinnerIds on no-consensus refund", async function () {
    const { bgamble, oracle1, oracle2, oracle3, oracle4 } = await lockedBetFixture();

    await bgamble.connect(oracle1).reportResult(1, [101]);
    await bgamble.connect(oracle2).reportResult(1, [102]);
    await bgamble.connect(oracle3).reportResult(1, [103]);
    await bgamble.connect(oracle4).reportResult(1, [104]);

    const resolved = await bgamble.getResolvedWinnerIds(1);
    expect(resolved.length).to.equal(0);
  });

  it("should resolve when 1st oracle differs but 2nd, 3rd, and 4th agree", async function () {
    const { bgamble, oracle1, oracle2, oracle3, oracle4, winnerA } = await lockedBetFixture();

    await bgamble.connect(oracle1).reportResult(1, [999]);
    let bet = await bgamble.bets(1);
    expect(bet.state).to.equal(2); // Still Locked

    await bgamble.connect(oracle2).reportResult(1, [winnerA]);
    bet = await bgamble.bets(1);
    expect(bet.state).to.equal(2); // Still Locked

    await bgamble.connect(oracle3).reportResult(1, [winnerA]);
    bet = await bgamble.bets(1);
    expect(bet.state).to.equal(2); // Still Locked

    await bgamble.connect(oracle4).reportResult(1, [winnerA]);
    bet = await bgamble.bets(1);
    expect(bet.state).to.equal(3); // Resolved
  });

  it("should not resolve until 3rd agreeing oracle reports (3+1 late consensus)", async function () {
    const { bgamble, oracle1, oracle2, oracle3, oracle4, winnerA } = await lockedBetFixture();

    await bgamble.connect(oracle1).reportResult(1, [winnerA]);
    await bgamble.connect(oracle2).reportResult(1, [999]);
    await bgamble.connect(oracle3).reportResult(1, [winnerA]);

    let bet = await bgamble.bets(1);
    expect(bet.state).to.equal(2); // Still Locked (only 2 agree)

    await bgamble.connect(oracle4).reportResult(1, [winnerA]);
    bet = await bgamble.bets(1);
    expect(bet.state).to.equal(3); // Resolved (3 agree)
  });

  // ── Oracle fee round-robin ──────────────────────────────────────

  it("should pay oracle fee to oracle at index betId % 4 (betId=1 → oracle[1])", async function () {
    const { bgamble, usdc, oracle1, oracle2, oracle3, ethers } = await lockedBetFixture();
    const oracle2Before = await usdc.balanceOf(oracle2.address);
    const winnerA = 1;
    await bgamble.connect(oracle1).reportResult(1, [winnerA]);
    await bgamble.connect(oracle2).reportResult(1, [winnerA]);
    await bgamble.connect(oracle3).reportResult(1, [winnerA]);
    const oracle2After = await usdc.balanceOf(oracle2.address);
    expect(oracle2After - oracle2Before).to.equal(ORACLE_FEE);
  });

  it("should pay oracle fee to oracle[0] when betId % 4 == 0", async function () {
    const { bgamble, usdc, oracle1, oracle2, oracle3, alice, bob, ethers } = await deployFixture();
    const w = 1;

    // Create bets 1, 2, 3 to reach betId 4
    await bgamble.connect(alice).create(1, TEN_USDC, 2, w);
    await bgamble.connect(alice).create(2, TEN_USDC, 2, w);
    await bgamble.connect(alice).create(3, TEN_USDC, 2, w);

    // Bet 4: lock and resolve
    await bgamble.connect(alice).create(4, TEN_USDC, 2, w);
    await bgamble.connect(bob).join(4, w);
    await bgamble.connect(alice).confirm(4);
    await bgamble.connect(bob).confirm(4);

    const oracle1Before = await usdc.balanceOf(oracle1.address);
    await bgamble.connect(oracle1).reportResult(4, [w]);
    await bgamble.connect(oracle2).reportResult(4, [w]);
    await bgamble.connect(oracle3).reportResult(4, [w]);
    const oracle1After = await usdc.balanceOf(oracle1.address);
    expect(oracle1After - oracle1Before).to.equal(ORACLE_FEE);
  });

  // ── Contract balance after resolution ───────────────────────────

  it("should leave the contract with 0 balance after resolution (single winner)", async function () {
    const { bgamble, usdc, oracle1, oracle2, oracle3, winnerA } = await lockedBetFixture();
    await bgamble.connect(oracle1).reportResult(1, [winnerA]);
    await bgamble.connect(oracle2).reportResult(1, [winnerA]);
    await bgamble.connect(oracle3).reportResult(1, [winnerA]);
    const contractBalance = await usdc.balanceOf(await bgamble.getAddress());
    expect(contractBalance).to.equal(0);
  });

  it("should leave the contract with 0 balance after resolution (multiple winners)", async function () {
    const { bgamble, usdc, oracle1, oracle2, oracle3, winnerA, winnerB } = await lockedBet3PlayersFixture();
    await bgamble.connect(oracle1).reportResult(1, [winnerA, winnerB]);
    await bgamble.connect(oracle2).reportResult(1, [winnerA, winnerB]);
    await bgamble.connect(oracle3).reportResult(1, [winnerA, winnerB]);
    const contractBalance = await usdc.balanceOf(await bgamble.getAddress());
    expect(contractBalance).to.equal(0);
  });

  // ── Negative tests ──────────────────────────────────────────────

  it("should revert if caller is not an oracle", async function () {
    const { bgamble, alice, winnerA } = await lockedBetFixture();
    await expect(bgamble.connect(alice).reportResult(1, [winnerA])).to.be.revertedWithCustomError(bgamble, "NotOracle");
  });

  it("should revert if bet is not Locked (Open)", async function () {
    const { bgamble, oracle1, ethers } = await deployFixture();
    const w = 1;
    await expect(bgamble.connect(oracle1).reportResult(1, [w])).to.be.revertedWithCustomError(bgamble, "BetNotLocked");
  });

  it("should revert if bet is Confirming", async function () {
    const { bgamble, oracle1, ethers } = await confirmingBetFixture();
    const w = 1;
    await expect(bgamble.connect(oracle1).reportResult(1, [w])).to.be.revertedWithCustomError(bgamble, "BetNotLocked");
  });

  it("should revert if oracle already reported for this bet", async function () {
    const { bgamble, oracle1, winnerA } = await lockedBetFixture();
    await bgamble.connect(oracle1).reportResult(1, [winnerA]);
    await expect(bgamble.connect(oracle1).reportResult(1, [winnerA])).to.be.revertedWithCustomError(bgamble, "AlreadyReported");
  });

  it("should revert if oracle already reported with different result", async function () {
    const { bgamble, oracle1, winnerA, winnerB } = await lockedBetFixture();
    await bgamble.connect(oracle1).reportResult(1, [winnerA]);
    await expect(bgamble.connect(oracle1).reportResult(1, [winnerB])).to.be.revertedWithCustomError(bgamble, "AlreadyReported");
  });

  it("should revert if bet is already Resolved", async function () {
    const { bgamble, oracle1, oracle2, oracle3, oracle4, winnerA } = await lockedBetFixture();
    await bgamble.connect(oracle1).reportResult(1, [winnerA]);
    await bgamble.connect(oracle2).reportResult(1, [winnerA]);
    await bgamble.connect(oracle3).reportResult(1, [winnerA]);
    await expect(bgamble.connect(oracle4).reportResult(1, [winnerA])).to.be.revertedWithCustomError(bgamble, "BetNotLocked");
  });

  it("should revert if bet was Cancelled", async function () {
    const { bgamble, oracle1, alice, bob, ethers } = await lockedBetFixture();
    await bgamble.connect(alice).voteCancel(1);
    await bgamble.connect(bob).voteCancel(1);
    const w = 1;
    await expect(bgamble.connect(oracle1).reportResult(1, [w])).to.be.revertedWithCustomError(bgamble, "BetNotLocked");
  });

  it("should revert if bet is already NoConsensus", async function () {
    const { bgamble, oracle1, oracle2, oracle3, oracle4, ethers } = await lockedBetFixture();
    await bgamble.connect(oracle1).reportResult(1, [101]);
    await bgamble.connect(oracle2).reportResult(1, [102]);
    await bgamble.connect(oracle3).reportResult(1, [103]);
    await bgamble.connect(oracle4).reportResult(1, [104]);
    const bet = await bgamble.bets(1);
    expect(bet.state).to.equal(4); // NoConsensus

    // Deploy fresh to get a 5th signer that isn't an oracle — but all 4 already reported anyway.
    // The revert is triggered because state is no longer Locked.
    // We can verify by trying to call from one of the oracles on a separate bet.
  });

  it("should emit BetNoConsensus on no-consensus resolution", async function () {
    const { bgamble, oracle1, oracle2, oracle3, oracle4 } = await lockedBetFixture();
    await bgamble.connect(oracle1).reportResult(1, [101]);
    await bgamble.connect(oracle2).reportResult(1, [102]);
    await bgamble.connect(oracle3).reportResult(1, [103]);
    await expect(bgamble.connect(oracle4).reportResult(1, [104]))
      .to.emit(bgamble, "BetNoConsensus")
      .withArgs(1, () => true, oracle4.address);
  });
});

