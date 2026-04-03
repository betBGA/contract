import { describe, it } from "node:test";
import { expect } from "chai";
import { lockedBetFixture, lockedBet3PlayersFixture, TEN_USDT, USDT_UNIT } from "./helpers.js";

describe("Bet lifecycle - Cancelled", () => {
  it("locked bet, all participants voteCancel and get refunded", async () => {
    const { bgamble, usdt, alice, bob, betId } = await lockedBetFixture();

    const aliceBefore = await usdt.balanceOf(alice.address);
    const bobBefore = await usdt.balanceOf(bob.address);

    await bgamble.connect(alice).voteCancel(betId);
    await bgamble.connect(bob).voteCancel(betId);

    const bet = await bgamble.bets(betId);
    expect(bet.state).to.equal(5n); // Cancelled

    expect(await usdt.balanceOf(alice.address) - aliceBefore).to.equal(TEN_USDT * USDT_UNIT);
    expect(await usdt.balanceOf(bob.address) - bobBefore).to.equal(TEN_USDT * USDT_UNIT);

    const contractBalance = await usdt.balanceOf(await bgamble.getAddress());
    expect(contractBalance).to.equal(0n);
  });

  it("3-player locked bet, unanimous cancel refunds all", async () => {
    const { bgamble, usdt, alice, bob, carol, betId } = await lockedBet3PlayersFixture();

    const aliceBefore = await usdt.balanceOf(alice.address);
    const bobBefore = await usdt.balanceOf(bob.address);
    const carolBefore = await usdt.balanceOf(carol.address);

    await bgamble.connect(alice).voteCancel(betId);
    await bgamble.connect(bob).voteCancel(betId);
    await bgamble.connect(carol).voteCancel(betId);

    const bet = await bgamble.bets(betId);
    expect(bet.state).to.equal(5n);

    expect(await usdt.balanceOf(alice.address) - aliceBefore).to.equal(TEN_USDT * USDT_UNIT);
    expect(await usdt.balanceOf(bob.address) - bobBefore).to.equal(TEN_USDT * USDT_UNIT);
    expect(await usdt.balanceOf(carol.address) - carolBefore).to.equal(TEN_USDT * USDT_UNIT);

    const contractBalance = await usdt.balanceOf(await bgamble.getAddress());
    expect(contractBalance).to.equal(0n);
  });
});
