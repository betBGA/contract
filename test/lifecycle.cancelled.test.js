import { describe, it } from "node:test";
import { expect } from "chai";
import { lockedBetFixture, lockedBet3PlayersFixture, TEN_USDC } from "./helpers.js";

function asBigInt(v) {
  return BigInt(v.toString());
}

describe("Bet lifecycle - Cancelled", () => {
  it("locked bet, all participants voteCancel and get refunded", async () => {
    const { bgamble, usdc, alice, bob, betId } = await lockedBetFixture();

    const aliceBefore = asBigInt(await usdc.balanceOf(alice.address));
    const bobBefore = asBigInt(await usdc.balanceOf(bob.address));

    await bgamble.connect(alice).voteCancel(betId);
    await bgamble.connect(bob).voteCancel(betId);

    const bet = await bgamble.bets(betId);
    expect(bet.state).to.equal(5n); // Cancelled

    const aliceAfter = asBigInt(await usdc.balanceOf(alice.address));
    const bobAfter = asBigInt(await usdc.balanceOf(bob.address));

    expect(aliceAfter - aliceBefore).to.equal(TEN_USDC);
    expect(bobAfter - bobBefore).to.equal(TEN_USDC);

    const contractBalance = asBigInt(await usdc.balanceOf(await bgamble.getAddress()));
    expect(contractBalance).to.equal(0n);
  });

  it("3-player locked bet, unanimous cancel refunds all", async () => {
    const { bgamble, usdc, alice, bob, carol, betId } = await lockedBet3PlayersFixture();

    const aliceBefore = asBigInt(await usdc.balanceOf(alice.address));
    const bobBefore = asBigInt(await usdc.balanceOf(bob.address));
    const carolBefore = asBigInt(await usdc.balanceOf(carol.address));

    await bgamble.connect(alice).voteCancel(betId);
    await bgamble.connect(bob).voteCancel(betId);
    await bgamble.connect(carol).voteCancel(betId);

    const bet = await bgamble.bets(betId);
    expect(bet.state).to.equal(5n);

    const aliceAfter = asBigInt(await usdc.balanceOf(alice.address));
    const bobAfter = asBigInt(await usdc.balanceOf(bob.address));
    const carolAfter = asBigInt(await usdc.balanceOf(carol.address));

    expect(aliceAfter - aliceBefore).to.equal(TEN_USDC);
    expect(bobAfter - bobBefore).to.equal(TEN_USDC);
    expect(carolAfter - carolBefore).to.equal(TEN_USDC);

    const contractBalance = asBigInt(await usdc.balanceOf(await bgamble.getAddress()));
    expect(contractBalance).to.equal(0n);
  });
});
