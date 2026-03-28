import { describe, it } from "node:test";
import { expect } from "chai";
import { lockedBetFixture, lockedBet3PlayersFixture, TEN_POL, POL, GAS_MARGIN } from "./helpers.js";

describe("Bet lifecycle - Cancelled", () => {
  it("locked bet, all participants voteCancel and get refunded", async () => {
    const { bgamble, ethers, alice, bob, betId } = await lockedBetFixture();

    const aliceBefore = await ethers.provider.getBalance(alice.address);
    const bobBefore = await ethers.provider.getBalance(bob.address);

    await bgamble.connect(alice).voteCancel(betId);
    await bgamble.connect(bob).voteCancel(betId);

    const bet = await bgamble.bets(betId);
    expect(bet.state).to.equal(5n); // Cancelled

    const aliceDelta = await ethers.provider.getBalance(alice.address) - aliceBefore;
    const bobDelta = await ethers.provider.getBalance(bob.address) - bobBefore;

    // Both paid gas but received refund
    expect(aliceDelta).to.be.greaterThan(TEN_POL * POL - GAS_MARGIN);
    expect(bobDelta).to.be.greaterThan(TEN_POL * POL - GAS_MARGIN);

    const contractBalance = await ethers.provider.getBalance(await bgamble.getAddress());
    expect(contractBalance).to.equal(0n);
  });

  it("3-player locked bet, unanimous cancel refunds all", async () => {
    const { bgamble, ethers, alice, bob, carol, betId } = await lockedBet3PlayersFixture();

    const aliceBefore = await ethers.provider.getBalance(alice.address);
    const bobBefore = await ethers.provider.getBalance(bob.address);
    const carolBefore = await ethers.provider.getBalance(carol.address);

    await bgamble.connect(alice).voteCancel(betId);
    await bgamble.connect(bob).voteCancel(betId);
    await bgamble.connect(carol).voteCancel(betId);

    const bet = await bgamble.bets(betId);
    expect(bet.state).to.equal(5n);

    const aDelta = await ethers.provider.getBalance(alice.address) - aliceBefore;
    const bDelta = await ethers.provider.getBalance(bob.address) - bobBefore;
    const cDelta = await ethers.provider.getBalance(carol.address) - carolBefore;

    expect(aDelta).to.be.greaterThan(TEN_POL * POL - GAS_MARGIN);
    expect(bDelta).to.be.greaterThan(TEN_POL * POL - GAS_MARGIN);
    expect(cDelta).to.be.greaterThan(TEN_POL * POL - GAS_MARGIN);

    const contractBalance = await ethers.provider.getBalance(await bgamble.getAddress());
    expect(contractBalance).to.equal(0n);
  });
});
