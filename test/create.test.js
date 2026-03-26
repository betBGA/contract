import { describe, it } from "node:test";
import { expect } from "chai";
import { deployFixture, createOpenBetFixture, ONE_USDC, TEN_USDC, FIVE_THOUSAND_USDC } from "./helpers.js";

describe("create", function () {
  // ── Positive tests ──────────────────────────────────────────────

  it("should create a bet and return betId 1", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    const betId = await bgamble.connect(alice).create.staticCall(1, TEN_USDC, 2, winner);
    expect(betId).to.equal(1);
  });

  it("should increment nextBetId after creation", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await bgamble.connect(alice).create(1, TEN_USDC, 2, winner);
    expect(await bgamble.nextBetId()).to.equal(2);
  });

  it("should increment nextBetId for each new bet", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
     await bgamble.connect(alice).create(1, TEN_USDC, 2, winner);
     await bgamble.connect(alice).create(2, TEN_USDC, 2, winner);
     await bgamble.connect(alice).create(3, TEN_USDC, 2, winner);
    expect(await bgamble.nextBetId()).to.equal(4);
  });

  it("should set bet state to Open", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await bgamble.connect(alice).create(1, TEN_USDC, 2, winner);
    const bet = await bgamble.bets(1);
    expect(bet.state).to.equal(0); // BetState.Open
  });

  it("should store the correct bet amount", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await bgamble.connect(alice).create(1, TEN_USDC, 3, winner);
    const bet = await bgamble.bets(1);
    expect(bet.amount).to.equal(TEN_USDC);
  });

  it("should store the correct slot count", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await bgamble.connect(alice).create(1, TEN_USDC, 5, winner);
    const bet = await bgamble.bets(1);
    expect(bet.slotCount).to.equal(5);
  });

  it("should auto-join the creator as the first participant", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await bgamble.connect(alice).create(1, TEN_USDC, 2, winner);

    const participants = await bgamble.getParticipants(1);
    expect(participants.length).to.equal(1);
    expect(participants[0].addr).to.equal(alice.address);
    expect(participants[0].predictedWinner).to.equal(winner);
  });

  it("should transfer the stake from the creator to the contract", async function () {
    const { bgamble, usdc, alice, ethers } = await deployFixture();
    const winner = 1;
    const balanceBefore = await usdc.balanceOf(alice.address);
    await bgamble.connect(alice).create(1, TEN_USDC, 2, winner);
    const balanceAfter = await usdc.balanceOf(alice.address);
    expect(balanceBefore - balanceAfter).to.equal(TEN_USDC);
  });

  it("should emit BetCreated event", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    const tableId = 822871361;
    await expect(bgamble.connect(alice).create(tableId, TEN_USDC, 2, winner))
      .to.emit(bgamble, "BetCreated")
      .withArgs(1, tableId, () => true, alice.address, TEN_USDC, 2, winner);
  });

  it("should emit BetJoined event for the creator", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).create(1, TEN_USDC, 2, winner))
      .to.emit(bgamble, "BetJoined")
      .withArgs(1, () => true, alice.address, winner);
  });

  it("should work with minimum slot count of 2", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).create(1, TEN_USDC, 2, winner)).to.not.be.revert(ethers);
  });

  it("should work with maximum slot count of 10", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).create(1, TEN_USDC, 10, winner)).to.not.be.revert(ethers);
  });

  it("should work with minimum amount of USDC 1.00", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).create(1, ONE_USDC, 2, winner)).to.not.be.revert(ethers);
  });

  it("should work with maximum amount of USDC 5000.00", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).create(1, FIVE_THOUSAND_USDC, 2, winner)).to.not.be.revert(ethers);
  });

  it("should work with a large amount", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    const largeAmount = 1000n * ONE_USDC;
    await expect(bgamble.connect(alice).create(1, largeAmount, 2, winner)).to.not.be.revert(ethers);
  });

  // ── Negative tests ──────────────────────────────────────────────

  it("should revert with slotCount of 0", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).create(1, TEN_USDC, 0, winner)).to.be.revertedWithCustomError(bgamble, "SlotCountTooLow");
  });

  it("should revert with slotCount of 1", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).create(1, TEN_USDC, 1, winner)).to.be.revertedWithCustomError(bgamble, "SlotCountTooLow");
  });

  it("should revert with slotCount of 11", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).create(1, TEN_USDC, 11, winner)).to.be.revertedWithCustomError(bgamble, "SlotCountTooHigh");
  });

  it("should revert with slotCount of 255", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).create(1, TEN_USDC, 255, winner)).to.be.revertedWithCustomError(bgamble, "SlotCountTooHigh");
  });

  it("should revert with amount of 0", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).create(1, 0, 2, winner)).to.be.revertedWithCustomError(bgamble, "BetAmountTooLow");
  });

  it("should revert with amount less than USDC 1.00 (e.g. 999999)", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).create(1, 999_999, 2, winner)).to.be.revertedWithCustomError(bgamble, "BetAmountTooLow");
  });

  it("should revert with amount exceeding USDC 5000.00", async function () {
    const { bgamble, alice, ethers } = await deployFixture();
    const winner = 1;
    await expect(bgamble.connect(alice).create(1, FIVE_THOUSAND_USDC + ONE_USDC, 2, winner)).to.be.revertedWithCustomError(bgamble, "BetAmountTooHigh");
  });

  it("should revert if caller has no token balance", async function () {
    const { bgamble, usdc, deployer, ethers } = await deployFixture();
    const winner = 1;
    const bgambleAddress = await bgamble.getAddress();
    await usdc.connect(deployer).approve(bgambleAddress, ethers.MaxUint256);
    await expect(bgamble.connect(deployer).create(1, TEN_USDC, 2, winner)).to.be.revert(ethers);
  });

  it("should revert if caller has not approved the contract", async function () {
    const { bgamble, unapproved, ethers } = await deployFixture();
    const winner = 1;
    await expect(bgamble.connect(unapproved).create(1, TEN_USDC, 2, winner)).to.be.revert(ethers);
  });
});
