import { describe, it } from "node:test";
import { expect } from "chai";
import { deployFixture, createOpenBetFixture, TEN_POL, TEN_THOUSAND_POL, POL, GAS_MARGIN } from "./helpers.js";

describe("create", function () {
  // ── Positive tests ──────────────────────────────────────────────

  it("should create a bet and return betId 1", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    const betId = await bgamble.connect(alice).create.staticCall(1, TEN_POL, 2, winner, { value: TEN_POL * POL });
    expect(betId).to.equal(1);
  });

  it("should increment nextBetId after creation", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await bgamble.connect(alice).create(1, TEN_POL, 2, winner, { value: TEN_POL * POL });
    expect(await bgamble.nextBetId()).to.equal(2);
  });

  it("should increment nextBetId for each new bet", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
     await bgamble.connect(alice).create(1, TEN_POL, 2, winner, { value: TEN_POL * POL });
     await bgamble.connect(alice).create(2, TEN_POL, 2, winner, { value: TEN_POL * POL });
     await bgamble.connect(alice).create(3, TEN_POL, 2, winner, { value: TEN_POL * POL });
    expect(await bgamble.nextBetId()).to.equal(4);
  });

  it("should set bet state to Open", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await bgamble.connect(alice).create(1, TEN_POL, 2, winner, { value: TEN_POL * POL });
    const bet = await bgamble.bets(1);
    expect(bet.state).to.equal(0); // BetState.Open
  });

  it("should store the correct bet amount", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await bgamble.connect(alice).create(1, TEN_POL, 3, winner, { value: TEN_POL * POL });
    const bet = await bgamble.bets(1);
    expect(bet.amount).to.equal(TEN_POL);
  });

  it("should store the correct slot count", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await bgamble.connect(alice).create(1, TEN_POL, 5, winner, { value: TEN_POL * POL });
    const bet = await bgamble.bets(1);
    expect(bet.slotCount).to.equal(5);
  });

  it("should auto-join the creator as the first participant", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await bgamble.connect(alice).create(1, TEN_POL, 2, winner, { value: TEN_POL * POL });

    const participants = await bgamble.getParticipants(1);
    expect(participants.length).to.equal(1);
    expect(participants[0].addr).to.equal(alice.address);
    expect(participants[0].predictedWinner).to.equal(winner);
  });

  it("should transfer the stake from the creator to the contract", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    const balanceBefore = await ethers.provider.getBalance(alice.address);
    await bgamble.connect(alice).create(1, TEN_POL, 2, winner, { value: TEN_POL * POL });
    const balanceAfter = await ethers.provider.getBalance(alice.address);
    // Sender pays value + gas, so decrease is slightly more than TEN_POL * POL
    const delta = balanceBefore - balanceAfter;
    expect(delta).to.be.greaterThanOrEqual(TEN_POL * POL);
    expect(delta).to.be.lessThan(TEN_POL * POL + GAS_MARGIN);
  });

  it("should emit BetCreated event", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    const tableId = 822871361;
    await expect(bgamble.connect(alice).create(tableId, TEN_POL, 2, winner, { value: TEN_POL * POL }))
      .to.emit(bgamble, "BetCreated")
      .withArgs(1, tableId, () => true, alice.address, TEN_POL, 2, winner);
  });

  it("should emit BetJoined event for the creator", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).create(1, TEN_POL, 2, winner, { value: TEN_POL * POL }))
      .to.emit(bgamble, "BetJoined")
      .withArgs(1, () => true, alice.address, winner);
  });

  it("should work with minimum slot count of 2", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).create(1, TEN_POL, 2, winner, { value: TEN_POL * POL })).to.not.be.revert(ethers);
  });

  it("should work with maximum slot count of 10", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).create(1, TEN_POL, 10, winner, { value: TEN_POL * POL })).to.not.be.revert(ethers);
  });

  it("should work with minimum amount of 10 POL", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).create(1, TEN_POL, 2, winner, { value: TEN_POL * POL })).to.not.be.revert(ethers);
  });

  it("should work with maximum amount of 10,000 POL", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    // Default Hardhat accounts have exactly 10,000 ETH/POL, so use 9,999 to leave room for gas
    const amount = 9_999n;
    await expect(bgamble.connect(alice).create(1, amount, 2, winner, { value: amount * POL })).to.not.be.revert(ethers);
  });

  it("should work with a large amount", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    const largeAmount = 1000n;
    await expect(bgamble.connect(alice).create(1, largeAmount, 2, winner, { value: largeAmount * POL })).to.not.be.revert(ethers);
  });

  // ── Negative tests ──────────────────────────────────────────────

  it("should revert with slotCount of 0", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).create(1, TEN_POL, 0, winner, { value: TEN_POL * POL })).to.be.revertedWithCustomError(bgamble, "SlotCountTooLow");
  });

  it("should revert with slotCount of 1", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).create(1, TEN_POL, 1, winner, { value: TEN_POL * POL })).to.be.revertedWithCustomError(bgamble, "SlotCountTooLow");
  });

  it("should revert with slotCount of 11", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).create(1, TEN_POL, 11, winner, { value: TEN_POL * POL })).to.be.revertedWithCustomError(bgamble, "SlotCountTooHigh");
  });

  it("should revert with slotCount of 255", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).create(1, TEN_POL, 255, winner, { value: TEN_POL * POL })).to.be.revertedWithCustomError(bgamble, "SlotCountTooHigh");
  });

  it("should revert with amount of 0", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).create(1, 0, 2, winner, { value: 0 })).to.be.revertedWithCustomError(bgamble, "BetAmountTooLow");
  });

  it("should revert with amount less than 10 POL (e.g. 9)", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).create(1, 9, 2, winner, { value: 9n * POL })).to.be.revertedWithCustomError(bgamble, "BetAmountTooLow");
  });

  it("should revert with amount exceeding 10,000 POL", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    const tooMuch = TEN_THOUSAND_POL + 1n;
    await expect(bgamble.connect(alice).create(1, tooMuch, 2, winner, { value: tooMuch * POL })).to.be.revertedWithCustomError(bgamble, "BetAmountTooHigh");
  });

  it("should revert if msg.value does not match the bet amount", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    // Send wrong value (5 POL instead of 10 POL)
    await expect(bgamble.connect(alice).create(1, TEN_POL, 2, winner, { value: 5n * POL })).to.be.revertedWithCustomError(bgamble, "IncorrectValue");
  });

  it("should revert if no value is sent", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).create(1, TEN_POL, 2, winner)).to.be.revertedWithCustomError(bgamble, "IncorrectValue");
  });
});
