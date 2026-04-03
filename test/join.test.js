import { describe, it } from "node:test";
import { expect } from "chai";
import { deployFixture, createOpenBetFixture, TEN_USDT, USDT_UNIT } from "./helpers.js";

describe("join", function () {
  // ── Positive tests ──────────────────────────────────────────────

  it("should allow a second player to join an Open bet", async function () {
    const { bgamble, bob } = await createOpenBetFixture();
    const winnerB = 2;
    await bgamble.connect(bob).join(1, winnerB);
  });

  it("should register the joining player as a participant", async function () {
    const { bgamble, bob } = await createOpenBetFixture();
    const winnerB = 2;
    await bgamble.connect(bob).join(1, winnerB);

    const participants = await bgamble.getParticipants(1);
    expect(participants.length).to.equal(2);
    expect(participants[1].addr).to.equal(bob.address);
    expect(participants[1].predictedWinner).to.equal(winnerB);
  });

  it("should transfer the stake from the joiner to the contract", async function () {
    const { bgamble, usdt, bob } = await createOpenBetFixture();
    const winnerB = 2;
    const balanceBefore = await usdt.balanceOf(bob.address);
    await bgamble.connect(bob).join(1, winnerB);
    const balanceAfter = await usdt.balanceOf(bob.address);
    expect(balanceBefore - balanceAfter).to.equal(TEN_USDT * USDT_UNIT);
  });

  it("should emit BetJoined event", async function () {
    const { bgamble, bob } = await createOpenBetFixture();
    const winnerB = 2;
    await expect(bgamble.connect(bob).join(1, winnerB))
      .to.emit(bgamble, "BetJoined")
      .withArgs(1, () => true, bob.address, winnerB);
  });

  it("should transition to Confirming when last slot is filled", async function () {
    const { bgamble, bob } = await createOpenBetFixture();
    const winnerB = 2;
    await bgamble.connect(bob).join(1, winnerB);

    const bet = await bgamble.bets(1);
    expect(bet.state).to.equal(1); // Confirming
  });

  it("should stay Open when slots remain after join", async function () {
    const { bgamble, alice, bob } = await deployFixture();
    const winner = 1;
    await bgamble.connect(alice).create(1, TEN_USDT, 3, winner);
    await bgamble.connect(bob).join(1, 2);

    const bet = await bgamble.bets(1);
    expect(bet.state).to.equal(0); // Open
  });

  it("should allow multiple participants to predict the same winner", async function () {
    const { bgamble, alice, bob } = await deployFixture();
    const sameWinner = 1;
    await bgamble.connect(alice).create(1, TEN_USDT, 2, sameWinner);
    await bgamble.connect(bob).join(1, sameWinner);

    const participants = await bgamble.getParticipants(1);
    expect(participants[0].predictedWinner).to.equal(sameWinner);
    expect(participants[1].predictedWinner).to.equal(sameWinner);
  });

  it("should allow joining a bet with many slots (up to 10)", async function () {
    const { bgamble, alice, bob, carol, dave, eve } = await deployFixture();
    const winner = 1;
    await bgamble.connect(alice).create(1, TEN_USDT, 5, winner);
    await bgamble.connect(bob).join(1, winner);
    await bgamble.connect(carol).join(1, winner);
    await bgamble.connect(dave).join(1, winner);
    await bgamble.connect(eve).join(1, winner);

    const participants = await bgamble.getParticipants(1);
    expect(participants.length).to.equal(5);
    const bet = await bgamble.bets(1);
    expect(bet.state).to.equal(1); // Confirming
  });

  // ── Negative tests ──────────────────────────────────────────────

  it("should revert if bet is in Confirming state", async function () {
    const { bgamble, alice, bob, carol } = await deployFixture();
    const winner = 1;
    await bgamble.connect(alice).create(1, TEN_USDT, 2, winner);
    await bgamble.connect(bob).join(1, winner);
    await expect(bgamble.connect(carol).join(1, winner)).to.be.revertedWithCustomError(bgamble, "BetNotOpen");
  });

  it("should revert if bet is already full", async function () {
    const { bgamble, alice, bob, carol } = await deployFixture();
    const winner = 1;
    await bgamble.connect(alice).create(1, TEN_USDT, 2, winner);
    await bgamble.connect(bob).join(1, winner);
    await expect(bgamble.connect(carol).join(1, winner)).to.be.revertedWithCustomError(bgamble, "BetNotOpen");
  });

  it("should revert if caller already joined", async function () {
    const { bgamble, alice, bob } = await deployFixture();
    const winner = 1;
    await bgamble.connect(alice).create(1, TEN_USDT, 3, winner);
    await bgamble.connect(bob).join(1, winner);
    await expect(bgamble.connect(bob).join(1, winner)).to.be.revertedWithCustomError(bgamble, "AlreadyParticipant");
  });

  it("should revert if the creator tries to join their own bet again", async function () {
    const { bgamble, alice } = await createOpenBetFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).join(1, winner)).to.be.revertedWithCustomError(bgamble, "AlreadyParticipant");
  });

  it("should revert if caller has not approved enough USDT", async function () {
    const { bgamble, usdt, bob } = await createOpenBetFixture();
    const winner = 2;
    await usdt.connect(bob).approve(await bgamble.getAddress(), 0);
    await expect(bgamble.connect(bob).join(1, winner))
      .to.be.revertedWithCustomError(usdt, "ERC20InsufficientAllowance");
  });

  it("should revert for a non-existent betId", async function () {
    const { bgamble, alice } = await deployFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).join(99, winner)).to.be.revertedWithCustomError(bgamble, "BetFull");
  });

  it("should revert if bet is Locked", async function () {
    const { bgamble, alice, bob, carol } = await deployFixture();
    const w = 1;
    await bgamble.connect(alice).create(1, TEN_USDT, 2, w);
    await bgamble.connect(bob).join(1, w);
    await bgamble.connect(alice).confirm(1);
    await bgamble.connect(bob).confirm(1);
    await expect(bgamble.connect(carol).join(1, w)).to.be.revertedWithCustomError(bgamble, "BetNotOpen");
  });
});
