import { describe, it } from "node:test";
import { expect } from "chai";
import { deployFixture, confirmingBetFixture, TEN_USDC } from "./helpers.js";

describe("confirm", function () {
  // ── Positive tests ──────────────────────────────────────────────

  it("should allow a participant to confirm", async function () {
    const { bgamble, alice, ethers } = await confirmingBetFixture();
    await expect(bgamble.connect(alice).confirm(1)).to.not.be.revert(ethers);
  });

  it("should increment confirmCount on confirmation", async function () {
    const { bgamble, alice } = await confirmingBetFixture();
    await bgamble.connect(alice).confirm(1);
    const bet = await bgamble.bets(1);
    expect(bet.confirmCount).to.equal(1);
  });

  it("should emit BetConfirmed event", async function () {
    const { bgamble, alice } = await confirmingBetFixture();
    await expect(bgamble.connect(alice).confirm(1))
      .to.emit(bgamble, "BetConfirmed")
      .withArgs(1, () => true, alice.address);
  });

  it("should keep state as Confirming when not all have confirmed", async function () {
    const { bgamble, alice } = await confirmingBetFixture();
    await bgamble.connect(alice).confirm(1);
    const bet = await bgamble.bets(1);
    expect(bet.state).to.equal(1); // Confirming
  });

  it("should transition to Locked when all participants confirm", async function () {
    const { bgamble, alice, bob } = await confirmingBetFixture();
    await bgamble.connect(alice).confirm(1);
    await bgamble.connect(bob).confirm(1);
    const bet = await bgamble.bets(1);
    expect(bet.state).to.equal(2); // Locked
  });

  it("should emit BetLocked when last participant confirms", async function () {
    const { bgamble, alice, bob } = await confirmingBetFixture();
    await bgamble.connect(alice).confirm(1);
    await expect(bgamble.connect(bob).confirm(1)).to.emit(bgamble, "BetLocked").withArgs(1, () => true, bob.address);
  });

  it("should set lockedAt timestamp when transitioning to Locked", async function () {
    const { bgamble, alice, bob } = await confirmingBetFixture();
    await bgamble.connect(alice).confirm(1);
    await bgamble.connect(bob).confirm(1);
    const bet = await bgamble.bets(1);
    expect(bet.lockedAt).to.be.greaterThan(0);
  });

  it("should work with a 3-player bet", async function () {
    const { bgamble, alice, bob, carol, ethers } = await deployFixture();
    const w = 1;
    await bgamble.connect(alice).create(1, TEN_USDC, 3, w);
    await bgamble.connect(bob).join(1, w);
    await bgamble.connect(carol).join(1, w);

    await bgamble.connect(alice).confirm(1);
    await bgamble.connect(bob).confirm(1);
    let bet = await bgamble.bets(1);
    expect(bet.state).to.equal(1);

    await bgamble.connect(carol).confirm(1);
    bet = await bgamble.bets(1);
    expect(bet.state).to.equal(2); // Locked
  });

  // ── Negative tests ──────────────────────────────────────────────

  it("should revert if bet is in Open state", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const w = 1;
    await bgamble.connect(alice).create(1, TEN_USDC, 3, w);
    await expect(bgamble.connect(alice).confirm(1)).to.be.revertedWithCustomError(bgamble, "BetNotConfirming");
  });

  it("should revert if bet is Locked", async function () {
    const { bgamble, alice, bob } = await confirmingBetFixture();
    await bgamble.connect(alice).confirm(1);
    await bgamble.connect(bob).confirm(1);
    await expect(bgamble.connect(alice).confirm(1)).to.be.revertedWithCustomError(bgamble, "BetNotConfirming");
  });

  it("should revert if caller is not a participant", async function () {
    const { bgamble, carol } = await confirmingBetFixture();
    await expect(bgamble.connect(carol).confirm(1)).to.be.revertedWithCustomError(bgamble, "NotParticipant");
  });

  it("should revert if caller already confirmed", async function () {
    const { bgamble, alice } = await confirmingBetFixture();
    await bgamble.connect(alice).confirm(1);
    await expect(bgamble.connect(alice).confirm(1)).to.be.revertedWithCustomError(bgamble, "AlreadyConfirmed");
  });

  it("should revert for non-existent betId", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    await expect(bgamble.connect(alice).confirm(99)).to.be.revert(ethers);
  });
});
