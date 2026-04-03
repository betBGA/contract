import { describe, it } from "node:test";
import { expect } from "chai";
import { lockedBetFixture, lockedBet3PlayersFixture, TEN_USDT, USDT_UNIT, ONE_DAY, timeTravel } from "./helpers.js";

describe("Bet lifecycle - Refunded", () => {
  it("locked bet, refund after 24h+1s returns all stakes", async () => {
    const { bgamble, usdt, networkHelpers, alice, bob, carol, betId } =
      await lockedBet3PlayersFixture();

    const aliceBefore = await usdt.balanceOf(alice.address);
    const bobBefore = await usdt.balanceOf(bob.address);
    const carolBefore = await usdt.balanceOf(carol.address);

    await timeTravel(networkHelpers, ONE_DAY + 1);

    await bgamble.connect(alice).refund(betId);

    const bet = await bgamble.bets(betId);
    expect(bet.state).to.equal(6n); // Refunded

    expect(await usdt.balanceOf(alice.address) - aliceBefore).to.equal(TEN_USDT * USDT_UNIT);
    expect(await usdt.balanceOf(bob.address) - bobBefore).to.equal(TEN_USDT * USDT_UNIT);
    expect(await usdt.balanceOf(carol.address) - carolBefore).to.equal(TEN_USDT * USDT_UNIT);

    const contractBalance = await usdt.balanceOf(await bgamble.getAddress());
    expect(contractBalance).to.equal(0n);
  });

  it("2-player locked bet, refund well after 24h returns both stakes", async () => {
    const { bgamble, usdt, networkHelpers, alice, bob, betId } = await lockedBetFixture();

    const aliceBefore = await usdt.balanceOf(alice.address);
    const bobBefore = await usdt.balanceOf(bob.address);

    await timeTravel(networkHelpers, ONE_DAY * 7 + 1);

    await bgamble.connect(bob).refund(betId);

    const bet = await bgamble.bets(betId);
    expect(bet.state).to.equal(6n);

    expect(await usdt.balanceOf(alice.address) - aliceBefore).to.equal(TEN_USDT * USDT_UNIT);
    expect(await usdt.balanceOf(bob.address) - bobBefore).to.equal(TEN_USDT * USDT_UNIT);

    const contractBalance = await usdt.balanceOf(await bgamble.getAddress());
    expect(contractBalance).to.equal(0n);
  });
});
