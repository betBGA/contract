import { describe, it } from "node:test";
import { expect } from "chai";
import { lockedBetFixture, lockedBet3PlayersFixture, TEN_POL, POL, GAS_MARGIN, ONE_DAY, timeTravel } from "./helpers.js";

describe("Bet lifecycle - Refunded", () => {
  it("locked bet, refund after 24h+1s returns all stakes", async () => {
    const { bgamble, ethers, networkHelpers, alice, bob, carol, betId } =
      await lockedBet3PlayersFixture();

    const aliceBefore = await ethers.provider.getBalance(alice.address);
    const bobBefore = await ethers.provider.getBalance(bob.address);
    const carolBefore = await ethers.provider.getBalance(carol.address);

    await timeTravel(networkHelpers, ONE_DAY + 1);

    await bgamble.connect(alice).refund(betId);

    const bet = await bgamble.bets(betId);
    expect(bet.state).to.equal(6n); // Refunded

    // Alice triggered tx (pays gas), Bob and Carol are passive receivers
    const aliceDelta = await ethers.provider.getBalance(alice.address) - aliceBefore;
    expect(aliceDelta).to.be.greaterThan(TEN_POL * POL - GAS_MARGIN);
    expect(await ethers.provider.getBalance(bob.address) - bobBefore).to.equal(TEN_POL * POL);
    expect(await ethers.provider.getBalance(carol.address) - carolBefore).to.equal(TEN_POL * POL);

    const contractBalance = await ethers.provider.getBalance(await bgamble.getAddress());
    expect(contractBalance).to.equal(0n);
  });

  it("2-player locked bet, refund well after 24h returns both stakes", async () => {
    const { bgamble, ethers, networkHelpers, alice, bob, betId } = await lockedBetFixture();

    const aliceBefore = await ethers.provider.getBalance(alice.address);
    const bobBefore = await ethers.provider.getBalance(bob.address);

    await timeTravel(networkHelpers, ONE_DAY * 7 + 1);

    await bgamble.connect(bob).refund(betId);

    const bet = await bgamble.bets(betId);
    expect(bet.state).to.equal(6n);

    // Bob triggered tx (pays gas), Alice is passive receiver
    expect(await ethers.provider.getBalance(alice.address) - aliceBefore).to.equal(TEN_POL * POL);
    const bobDelta = await ethers.provider.getBalance(bob.address) - bobBefore;
    expect(bobDelta).to.be.greaterThan(TEN_POL * POL - GAS_MARGIN);

    const contractBalance = await ethers.provider.getBalance(await bgamble.getAddress());
    expect(contractBalance).to.equal(0n);
  });
});
