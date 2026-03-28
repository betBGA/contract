import { describe, it } from "node:test";
import { expect } from "chai";
import { deployFixture, createOpenBetFixture, TEN_POL, POL, GAS_MARGIN } from "./helpers.js";

describe("join", function () {
  // ── Positive tests ──────────────────────────────────────────────

  it("should allow a second player to join an Open bet", async function () {
    const { bgamble, bob, ethers } = await createOpenBetFixture();
    const winnerB = 2;
    await expect(bgamble.connect(bob).join(1, winnerB, { value: TEN_POL * POL })).to.not.be.revert(ethers);
  });

  it("should register the joining player as a participant", async function () {
    const { bgamble, bob, ethers } = await createOpenBetFixture();
    const winnerB = 2;
    await bgamble.connect(bob).join(1, winnerB, { value: TEN_POL * POL });

    const participants = await bgamble.getParticipants(1);
    expect(participants.length).to.equal(2);
    expect(participants[1].addr).to.equal(bob.address);
    expect(participants[1].predictedWinner).to.equal(winnerB);
  });

  it("should transfer the stake from the joiner to the contract", async function () {
    const { bgamble, bob, ethers } = await createOpenBetFixture();
    const winnerB = 2;
    const balanceBefore = await ethers.provider.getBalance(bob.address);
    await bgamble.connect(bob).join(1, winnerB, { value: TEN_POL * POL });
    const balanceAfter = await ethers.provider.getBalance(bob.address);
    // Sender pays value + gas
    const delta = balanceBefore - balanceAfter;
    expect(delta).to.be.greaterThanOrEqual(TEN_POL * POL);
    expect(delta).to.be.lessThan(TEN_POL * POL + GAS_MARGIN);
  });

  it("should emit BetJoined event", async function () {
    const { bgamble, bob, ethers } = await createOpenBetFixture();
    const winnerB = 2;
    await expect(bgamble.connect(bob).join(1, winnerB, { value: TEN_POL * POL }))
      .to.emit(bgamble, "BetJoined")
      .withArgs(1, () => true, bob.address, winnerB);
  });

  it("should transition to Confirming when last slot is filled", async function () {
    const { bgamble, bob, ethers } = await createOpenBetFixture();
    const winnerB = 2;
    await bgamble.connect(bob).join(1, winnerB, { value: TEN_POL * POL });

    const bet = await bgamble.bets(1);
    expect(bet.state).to.equal(1); // Confirming
  });

  it("should stay Open when slots remain after join", async function () {
    const { bgamble, alice, bob, ethers } = await deployFixture();
    const winner = 1;
    await bgamble.connect(alice).create(1, TEN_POL, 3, winner, { value: TEN_POL * POL });
    await bgamble.connect(bob).join(1, 2, { value: TEN_POL * POL });

    const bet = await bgamble.bets(1);
    expect(bet.state).to.equal(0); // Open
  });

  it("should allow multiple participants to predict the same winner", async function () {
    const { bgamble, alice, bob, ethers } = await deployFixture();
    const sameWinner = 1;
    await bgamble.connect(alice).create(1, TEN_POL, 2, sameWinner, { value: TEN_POL * POL });
    await bgamble.connect(bob).join(1, sameWinner, { value: TEN_POL * POL });

    const participants = await bgamble.getParticipants(1);
    expect(participants[0].predictedWinner).to.equal(sameWinner);
    expect(participants[1].predictedWinner).to.equal(sameWinner);
  });

  it("should allow joining a bet with many slots (up to 10)", async function () {
    const { bgamble, alice, bob, carol, dave, eve, ethers } = await deployFixture();
    const winner = 1;
    await bgamble.connect(alice).create(1, TEN_POL, 5, winner, { value: TEN_POL * POL });
    await bgamble.connect(bob).join(1, winner, { value: TEN_POL * POL });
    await bgamble.connect(carol).join(1, winner, { value: TEN_POL * POL });
    await bgamble.connect(dave).join(1, winner, { value: TEN_POL * POL });
    await bgamble.connect(eve).join(1, winner, { value: TEN_POL * POL });

    const participants = await bgamble.getParticipants(1);
    expect(participants.length).to.equal(5);
    const bet = await bgamble.bets(1);
    expect(bet.state).to.equal(1); // Confirming
  });

  // ── Negative tests ──────────────────────────────────────────────

  it("should revert if bet is in Confirming state", async function () {
    const { bgamble, alice, bob, carol, ethers } = await deployFixture();
    const winner = 1;
    await bgamble.connect(alice).create(1, TEN_POL, 2, winner, { value: TEN_POL * POL });
    await bgamble.connect(bob).join(1, winner, { value: TEN_POL * POL });
    await expect(bgamble.connect(carol).join(1, winner, { value: TEN_POL * POL })).to.be.revertedWithCustomError(bgamble, "BetNotOpen");
  });

  it("should revert if bet is already full", async function () {
    const { bgamble, alice, bob, carol, ethers } = await deployFixture();
    const winner = 1;
    await bgamble.connect(alice).create(1, TEN_POL, 2, winner, { value: TEN_POL * POL });
    await bgamble.connect(bob).join(1, winner, { value: TEN_POL * POL });
    await expect(bgamble.connect(carol).join(1, winner, { value: TEN_POL * POL })).to.be.revertedWithCustomError(bgamble, "BetNotOpen");
  });

  it("should revert if caller already joined", async function () {
    const { bgamble, alice, bob, ethers } = await deployFixture();
    const winner = 1;
    await bgamble.connect(alice).create(1, TEN_POL, 3, winner, { value: TEN_POL * POL });
    await bgamble.connect(bob).join(1, winner, { value: TEN_POL * POL });
    await expect(bgamble.connect(bob).join(1, winner, { value: TEN_POL * POL })).to.be.revertedWithCustomError(bgamble, "AlreadyParticipant");
  });

  it("should revert if the creator tries to join their own bet again", async function () {
    const { bgamble, alice, ethers } = await createOpenBetFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).join(1, winner, { value: TEN_POL * POL })).to.be.revertedWithCustomError(bgamble, "AlreadyParticipant");
  });

  it("should revert if msg.value does not match bet amount", async function () {
    const { bgamble, bob, ethers } = await createOpenBetFixture();
    const winner = 2;
    await expect(bgamble.connect(bob).join(1, winner, { value: 5n * POL })).to.be.revertedWithCustomError(bgamble, "IncorrectValue");
  });

  it("should revert if no value is sent", async function () {
    const { bgamble, bob, ethers } = await createOpenBetFixture();
    const winner = 2;
    await expect(bgamble.connect(bob).join(1, winner)).to.be.revertedWithCustomError(bgamble, "IncorrectValue");
  });

  it("should revert for a non-existent betId", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).join(99, winner, { value: TEN_POL * POL })).to.be.revert(ethers);
  });

  it("should revert if bet is Locked", async function () {
    const { bgamble, alice, bob, carol, ethers } = await deployFixture();
    const w = 1;
    await bgamble.connect(alice).create(1, TEN_POL, 2, w, { value: TEN_POL * POL });
    await bgamble.connect(bob).join(1, w, { value: TEN_POL * POL });
    await bgamble.connect(alice).confirm(1);
    await bgamble.connect(bob).confirm(1);
    await expect(bgamble.connect(carol).join(1, w, { value: TEN_POL * POL })).to.be.revertedWithCustomError(bgamble, "BetNotOpen");
  });
});
