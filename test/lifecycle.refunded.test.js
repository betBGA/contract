import { describe, it } from "node:test";
import { expect } from "chai";
import { lockedBetFixture, lockedBet3PlayersFixture, TEN_USDC, ONE_DAY, timeTravel } from "./helpers.js";

function asBigInt(v) {
  return BigInt(v.toString());
}

describe("Bet lifecycle - Refunded", () => {
  it("locked bet, refund after 24h+1s returns all stakes", async () => {
    const { bgamble, usdc, networkHelpers, alice, bob, carol, betId } =
      await lockedBet3PlayersFixture();

    const aliceBefore = asBigInt(await usdc.balanceOf(alice.address));
    const bobBefore = asBigInt(await usdc.balanceOf(bob.address));
    const carolBefore = asBigInt(await usdc.balanceOf(carol.address));

    await timeTravel(networkHelpers, ONE_DAY + 1);

    await bgamble.connect(alice).refund(betId);

    const bet = await bgamble.bets(betId);
    expect(bet.state).to.equal(6n); // Refunded

    const aliceAfter = asBigInt(await usdc.balanceOf(alice.address));
    const bobAfter = asBigInt(await usdc.balanceOf(bob.address));
    const carolAfter = asBigInt(await usdc.balanceOf(carol.address));

    expect(aliceAfter - aliceBefore).to.equal(TEN_USDC);
    expect(bobAfter - bobBefore).to.equal(TEN_USDC);
    expect(carolAfter - carolBefore).to.equal(TEN_USDC);

    const contractBalance = asBigInt(await usdc.balanceOf(await bgamble.getAddress()));
    expect(contractBalance).to.equal(0n);
  });

  it("2-player locked bet, refund well after 24h returns both stakes", async () => {
    const { bgamble, usdc, networkHelpers, alice, bob, betId } = await lockedBetFixture();

    const aliceBefore = asBigInt(await usdc.balanceOf(alice.address));
    const bobBefore = asBigInt(await usdc.balanceOf(bob.address));

    await timeTravel(networkHelpers, ONE_DAY * 7 + 1);

    await bgamble.connect(bob).refund(betId);

    const bet = await bgamble.bets(betId);
    expect(bet.state).to.equal(6n);

    const aliceAfter = asBigInt(await usdc.balanceOf(alice.address));
    const bobAfter = asBigInt(await usdc.balanceOf(bob.address));

    expect(aliceAfter - aliceBefore).to.equal(TEN_USDC);
    expect(bobAfter - bobBefore).to.equal(TEN_USDC);

    const contractBalance = asBigInt(await usdc.balanceOf(await bgamble.getAddress()));
    expect(contractBalance).to.equal(0n);
  });
});
