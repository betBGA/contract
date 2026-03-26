import { describe, it } from "node:test";
import { expect } from "chai";
import { deployFixture, createOpenBetFixture, confirmingBetFixture, lockedBetFixture, TEN_USDC } from "./helpers.js";

describe("leave", function () {
  // ── Positive tests ──────────────────────────────────────────────

  it("should allow a participant to leave an Open bet", async function () {
    const { bgamble, alice, ethers } = await createOpenBetFixture();
    await expect(bgamble.connect(alice).leave(1)).to.not.be.revert(ethers);
  });

  it("should refund the stake to the leaving player", async function () {
    const { bgamble, usdc, alice } = await createOpenBetFixture();
    const balanceBefore = await usdc.balanceOf(alice.address);
    await bgamble.connect(alice).leave(1);
    const balanceAfter = await usdc.balanceOf(alice.address);
    expect(balanceAfter - balanceBefore).to.equal(TEN_USDC);
  });

  it("should emit BetLeft event", async function () {
    const { bgamble, alice } = await createOpenBetFixture();
    await expect(bgamble.connect(alice).leave(1))
      .to.emit(bgamble, "BetLeft")
      .withArgs(1, () => true, alice.address);
  });

  it("should remove the participant from the array", async function () {
    const { bgamble, alice } = await createOpenBetFixture();
    await bgamble.connect(alice).leave(1);
    const participants = await bgamble.getParticipants(1);
    expect(participants.length).to.equal(0);
  });

  it("should allow leaving a Confirming bet", async function () {
    const { bgamble, alice, ethers } = await confirmingBetFixture();
    await expect(bgamble.connect(alice).leave(1)).to.not.be.revert(ethers);
  });

  it("should reset state to Open when leaving a Confirming bet", async function () {
    const { bgamble, alice } = await confirmingBetFixture();
    await bgamble.connect(alice).leave(1);
    const bet = await bgamble.bets(1);
    expect(bet.state).to.equal(0); // Open
  });

  it("should reset confirmCount to 0 when leaving a Confirming bet", async function () {
    const { bgamble, alice, bob } = await confirmingBetFixture();
    await bgamble.connect(alice).confirm(1);
    await bgamble.connect(bob).leave(1);
    const bet = await bgamble.bets(1);
    expect(bet.confirmCount).to.equal(0);
  });

  it("should reset all confirmation flags when leaving a Confirming bet", async function () {
    const { bgamble, alice, bob } = await confirmingBetFixture();
    await bgamble.connect(alice).confirm(1);
    await bgamble.connect(bob).leave(1);

    const participants = await bgamble.getParticipants(1);
    expect(participants.length).to.equal(1);
    expect(participants[0].confirmed).to.equal(false);
  });

  it("should allow another player to join after someone leaves", async function () {
    const { bgamble, alice, bob, carol, ethers } = await confirmingBetFixture();
    await bgamble.connect(bob).leave(1);
    const w = 3;
    await expect(bgamble.connect(carol).join(1, w)).to.not.be.revert(ethers);
  });

  it("should handle swap-and-pop correctly when first participant leaves", async function () {
    const { bgamble, alice, bob, ethers } = await deployFixture();
    const w = 1;
    await bgamble.connect(alice).create(1, TEN_USDC, 3, w);
    await bgamble.connect(bob).join(1, 2);
    await bgamble.connect(alice).leave(1);
    const participants = await bgamble.getParticipants(1);
    expect(participants.length).to.equal(1);
    expect(participants[0].addr).to.equal(bob.address);
  });

  it("should handle swap-and-pop correctly when middle participant leaves (3 players)", async function () {
    const { bgamble, alice, bob, carol, ethers } = await deployFixture();
    await bgamble.connect(alice).create(1, TEN_USDC, 3, 1);
    await bgamble.connect(bob).join(1, 2);
    await bgamble.connect(carol).join(1, 3);
    await bgamble.connect(bob).leave(1);
    const participants = await bgamble.getParticipants(1);
    expect(participants.length).to.equal(2);
    expect(participants[0].addr).to.equal(alice.address);
    expect(participants[1].addr).to.equal(carol.address);
  });

  it("should handle the last participant leaving (3 players)", async function () {
    const { bgamble, alice, bob, carol, ethers } = await deployFixture();
    await bgamble.connect(alice).create(1, TEN_USDC, 3, 1);
    await bgamble.connect(bob).join(1, 2);
    await bgamble.connect(carol).join(1, 3);
    await bgamble.connect(carol).leave(1);
    const participants = await bgamble.getParticipants(1);
    expect(participants.length).to.equal(2);
    expect(participants[0].addr).to.equal(alice.address);
    expect(participants[1].addr).to.equal(bob.address);
  });

  // ── Negative tests ──────────────────────────────────────────────

  it("should revert if bet is Locked", async function () {
    const { bgamble, alice } = await lockedBetFixture();
    await expect(bgamble.connect(alice).leave(1)).to.be.revertedWithCustomError(bgamble, "CannotLeaveBet");
  });

  it("should revert if bet is Resolved", async function () {
    const { bgamble, alice, oracle1, oracle2, ethers } = await lockedBetFixture();
    const winners = [1];
    await bgamble.connect(oracle1).reportResult(1, winners);
    await bgamble.connect(oracle2).reportResult(1, winners);
    await expect(bgamble.connect(alice).leave(1)).to.be.revertedWithCustomError(bgamble, "CannotLeaveBet");
  });

  it("should revert if caller is not a participant", async function () {
    const { bgamble, carol } = await createOpenBetFixture();
    await expect(bgamble.connect(carol).leave(1)).to.be.revertedWithCustomError(bgamble, "NotParticipant");
  });

  it("should revert if caller is an oracle but not a participant", async function () {
    const { bgamble, oracle1 } = await createOpenBetFixture();
    await expect(bgamble.connect(oracle1).leave(1)).to.be.revertedWithCustomError(bgamble, "NotParticipant");
  });
});
