import { describe, it } from "node:test";
import { expect } from "chai";
import { deployFixture, lockedBetFixture, lockedBet3PlayersFixture, confirmingBetFixture, TEN_POL, POL, GAS_MARGIN } from "./helpers.js";

describe("voteCancel", function () {
  // ── Positive tests ──────────────────────────────────────────────

  it("should allow a participant to vote to cancel a Locked bet", async function () {
    const { bgamble, alice, ethers } = await lockedBetFixture();
    await expect(bgamble.connect(alice).voteCancel(1)).to.not.be.revert(ethers);
  });

  it("should increment cancelVoteCount", async function () {
    const { bgamble, alice } = await lockedBetFixture();
    await bgamble.connect(alice).voteCancel(1);
    const bet = await bgamble.bets(1);
    expect(bet.cancelVoteCount).to.equal(1);
  });

  it("should not change state with partial votes (2-player bet, 1 vote)", async function () {
    const { bgamble, alice } = await lockedBetFixture();
    await bgamble.connect(alice).voteCancel(1);
    const bet = await bgamble.bets(1);
    expect(bet.state).to.equal(2); // Still Locked
  });

  it("should not refund with partial votes", async function () {
    const { bgamble, ethers, alice } = await lockedBetFixture();
    const balanceBefore = await ethers.provider.getBalance(alice.address);
    await bgamble.connect(alice).voteCancel(1);
    const balanceAfter = await ethers.provider.getBalance(alice.address);
    // Only gas was spent, no refund — balance decreased slightly
    expect(balanceBefore - balanceAfter).to.be.lessThan(GAS_MARGIN);
  });

  it("should cancel and refund all stakes when all participants vote (2 players)", async function () {
    const { bgamble, ethers, alice, bob } = await lockedBetFixture();
    const aliceBefore = await ethers.provider.getBalance(alice.address);
    const bobBefore = await ethers.provider.getBalance(bob.address);

    await bgamble.connect(alice).voteCancel(1);
    await bgamble.connect(bob).voteCancel(1);

    const aliceAfter = await ethers.provider.getBalance(alice.address);
    const bobAfter = await ethers.provider.getBalance(bob.address);
    // Both paid gas for voteCancel but received refund
    const aliceDelta = aliceAfter - aliceBefore;
    const bobDelta = bobAfter - bobBefore;
    expect(aliceDelta).to.be.greaterThan(TEN_POL * POL - GAS_MARGIN);
    expect(aliceDelta).to.be.lessThanOrEqual(TEN_POL * POL);
    expect(bobDelta).to.be.greaterThan(TEN_POL * POL - GAS_MARGIN);
    expect(bobDelta).to.be.lessThanOrEqual(TEN_POL * POL);
  });

  it("should set state to Cancelled after unanimous vote", async function () {
    const { bgamble, alice, bob } = await lockedBetFixture();
    await bgamble.connect(alice).voteCancel(1);
    await bgamble.connect(bob).voteCancel(1);
    const bet = await bgamble.bets(1);
    expect(bet.state).to.equal(5); // Cancelled
  });

  it("should emit BetCancelVoted on partial vote", async function () {
    const { bgamble, alice } = await lockedBetFixture();
    await expect(bgamble.connect(alice).voteCancel(1))
      .to.emit(bgamble, "BetCancelVoted")
      .withArgs(1, () => true, alice.address);
  });

  it("should emit BetCancelVoted on the final vote (before BetCancelled)", async function () {
    const { bgamble, alice, bob } = await lockedBetFixture();
    await bgamble.connect(alice).voteCancel(1);
    await expect(bgamble.connect(bob).voteCancel(1))
      .to.emit(bgamble, "BetCancelVoted")
      .withArgs(1, () => true, bob.address);
  });

  it("should emit BetCancelled on unanimous vote", async function () {
    const { bgamble, alice, bob } = await lockedBetFixture();
    await bgamble.connect(alice).voteCancel(1);
    await expect(bgamble.connect(bob).voteCancel(1))
      .to.emit(bgamble, "BetCancelled")
      .withArgs(1, () => true, bob.address);
  });

  it("should cancel and refund all stakes when all 3 participants vote", async function () {
    const { bgamble, ethers, alice, bob, carol } = await lockedBet3PlayersFixture();
    const aliceBefore = await ethers.provider.getBalance(alice.address);
    const bobBefore = await ethers.provider.getBalance(bob.address);
    const carolBefore = await ethers.provider.getBalance(carol.address);

    await bgamble.connect(alice).voteCancel(1);
    await bgamble.connect(bob).voteCancel(1);
    // Not yet cancelled after 2 of 3
    let bet = await bgamble.bets(1);
    expect(bet.state).to.equal(2); // Locked

    await bgamble.connect(carol).voteCancel(1);
    bet = await bgamble.bets(1);
    expect(bet.state).to.equal(5); // Cancelled

    // All paid gas for voteCancel but received refund
    const aDelta = await ethers.provider.getBalance(alice.address) - aliceBefore;
    const bDelta = await ethers.provider.getBalance(bob.address) - bobBefore;
    const cDelta = await ethers.provider.getBalance(carol.address) - carolBefore;
    expect(aDelta).to.be.greaterThan(TEN_POL * POL - GAS_MARGIN);
    expect(bDelta).to.be.greaterThan(TEN_POL * POL - GAS_MARGIN);
    expect(cDelta).to.be.greaterThan(TEN_POL * POL - GAS_MARGIN);
  });

  it("should leave the contract with 0 balance after full cancellation", async function () {
    const { bgamble, ethers, alice, bob } = await lockedBetFixture();
    await bgamble.connect(alice).voteCancel(1);
    await bgamble.connect(bob).voteCancel(1);
    const contractBalance = await ethers.provider.getBalance(await bgamble.getAddress());
    expect(contractBalance).to.equal(0);
  });

  // ── Negative tests ──────────────────────────────────────────────

  it("should revert if bet is Open", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const w = 1;
    await bgamble.connect(alice).create(1, TEN_POL, 3, w, { value: TEN_POL * POL });
    await expect(bgamble.connect(alice).voteCancel(1)).to.be.revertedWithCustomError(bgamble, "BetNotLocked");
  });

  it("should revert if bet is Confirming", async function () {
    const { bgamble, alice } = await confirmingBetFixture();
    await expect(bgamble.connect(alice).voteCancel(1)).to.be.revertedWithCustomError(bgamble, "BetNotLocked");
  });

  it("should revert if caller is not a participant", async function () {
    const { bgamble, carol } = await lockedBetFixture();
    await expect(bgamble.connect(carol).voteCancel(1)).to.be.revertedWithCustomError(bgamble, "NotParticipant");
  });

  it("should revert if caller already voted", async function () {
    const { bgamble, alice } = await lockedBetFixture();
    await bgamble.connect(alice).voteCancel(1);
    await expect(bgamble.connect(alice).voteCancel(1)).to.be.revertedWithCustomError(bgamble, "AlreadyVotedCancel");
  });

  it("should revert if bet is already Cancelled", async function () {
    const { bgamble, alice, bob } = await lockedBetFixture();
    await bgamble.connect(alice).voteCancel(1);
    await bgamble.connect(bob).voteCancel(1);
    // Bet is now Cancelled
    await expect(bgamble.connect(alice).voteCancel(1)).to.be.revertedWithCustomError(bgamble, "BetNotLocked");
  });
});
