import { describe, it } from "node:test";
import { expect } from "chai";
import { deployFixture, TEN_USDC, ORACLE_FEE } from "./helpers.js";

function asBigInt(v) {
  return BigInt(v.toString());
}

describe("Bet lifecycle - Resolved", () => {
  it("4 players, everyone picks own id, oracles resolve in favour of player 1", async () => {
    const { ethers, bgamble, usdc, oracle1, oracle2, oracle3, alice, bob, carol, dave } =
      await deployFixture();

    const wA = 1;
    const wB = 2;
    const wC = 3;
    const wD = 4;

    const betId = 1;

    await bgamble.connect(alice).create(1, TEN_USDC, 4, wA);
    await bgamble.connect(bob).join(betId, wB);
    await bgamble.connect(carol).join(betId, wC);
    await bgamble.connect(dave).join(betId, wD);

    await bgamble.connect(alice).confirm(betId);
    await bgamble.connect(bob).confirm(betId);
    await bgamble.connect(carol).confirm(betId);
    await bgamble.connect(dave).confirm(betId);

    const aliceBefore = asBigInt(await usdc.balanceOf(alice.address));
    const bobBefore = asBigInt(await usdc.balanceOf(bob.address));
    const carolBefore = asBigInt(await usdc.balanceOf(carol.address));
    const daveBefore = asBigInt(await usdc.balanceOf(dave.address));

    const oracleIndex = betId % 4; // same logic as contract
    const oracleList = [oracle1, oracle2, oracle3]; // oracle4 unused for reporting here
    const feeRecipient = [oracle1, oracle2, oracle3, oracle1][oracleIndex]; // betId=1 → oracle[1]
    const oracleBefore = asBigInt(await usdc.balanceOf(feeRecipient.address));

    await bgamble.connect(oracle1).reportResult(betId, [wA]);
    await bgamble.connect(oracle2).reportResult(betId, [wA]);
    await bgamble.connect(oracle3).reportResult(betId, [wA]);

    const bet = await bgamble.bets(betId);
    expect(bet.state).to.equal(3n); // Resolved

    const aliceAfter = asBigInt(await usdc.balanceOf(alice.address));
    const bobAfter = asBigInt(await usdc.balanceOf(bob.address));
    const carolAfter = asBigInt(await usdc.balanceOf(carol.address));
    const daveAfter = asBigInt(await usdc.balanceOf(dave.address));
    const oracleAfter = asBigInt(await usdc.balanceOf(feeRecipient.address));

    const prizePool = TEN_USDC * 4n;
    const payout = prizePool - ORACLE_FEE;

    expect(aliceAfter - aliceBefore).to.equal(payout);
    expect(bobAfter).to.equal(bobBefore);
    expect(carolAfter).to.equal(carolBefore);
    expect(daveAfter).to.equal(daveBefore);

    expect(oracleAfter - oracleBefore).to.equal(ORACLE_FEE);

    const contractBalance = asBigInt(await usdc.balanceOf(await bgamble.getAddress()));
    expect(contractBalance).to.equal(0n);
  });

  it("4 players, two winners share payout and dust", async () => {
    const { ethers, bgamble, usdc, oracle1, oracle2, oracle3, alice, bob, carol, dave } =
      await deployFixture();

    const wA = 1;
    const wB = 2;
    const wC = 3;
    const wD = 4;

    const betId = 1;

    await bgamble.connect(alice).create(1, TEN_USDC, 4, wA);
    await bgamble.connect(bob).join(betId, wB);
    await bgamble.connect(carol).join(betId, wC);
    await bgamble.connect(dave).join(betId, wD);

    await bgamble.connect(alice).confirm(betId);
    await bgamble.connect(bob).confirm(betId);
    await bgamble.connect(carol).confirm(betId);
    await bgamble.connect(dave).confirm(betId);

    const aliceBefore = asBigInt(await usdc.balanceOf(alice.address));
    const bobBefore = asBigInt(await usdc.balanceOf(bob.address));
    const carolBefore = asBigInt(await usdc.balanceOf(carol.address));
    const daveBefore = asBigInt(await usdc.balanceOf(dave.address));

    const oracleIndex = betId % 4;
    const feeRecipient = [oracle1, oracle2, oracle3, oracle1][oracleIndex];
    const oracleBefore = asBigInt(await usdc.balanceOf(feeRecipient.address));

    await bgamble.connect(oracle1).reportResult(betId, [wA, wC]);
    await bgamble.connect(oracle2).reportResult(betId, [wA, wC]);
    await bgamble.connect(oracle3).reportResult(betId, [wA, wC]);

    const bet = await bgamble.bets(betId);
    expect(bet.state).to.equal(3n);

    const aliceAfter = asBigInt(await usdc.balanceOf(alice.address));
    const bobAfter = asBigInt(await usdc.balanceOf(bob.address));
    const carolAfter = asBigInt(await usdc.balanceOf(carol.address));
    const daveAfter = asBigInt(await usdc.balanceOf(dave.address));
    const oracleAfter = asBigInt(await usdc.balanceOf(feeRecipient.address));

    const prizePool = TEN_USDC * 4n;
    const payout = prizePool - ORACLE_FEE;
    const share = payout / 2n;
    const remainder = payout % 2n;

    const totalIncreaseAlice = aliceAfter - aliceBefore;
    const totalIncreaseCarol = carolAfter - carolBefore;

    // Alice is first winner, Carol is second and should get the dust
    expect(totalIncreaseAlice).to.equal(share);
    expect(totalIncreaseCarol).to.equal(share + remainder);

    expect(bobAfter).to.equal(bobBefore);
    expect(daveAfter).to.equal(daveBefore);
    expect(oracleAfter - oracleBefore).to.equal(ORACLE_FEE);

    const contractBalance = asBigInt(await usdc.balanceOf(await bgamble.getAddress()));
    expect(contractBalance).to.equal(0n);
  });

  it("4 players, no one predicted winner so everyone shares payout", async () => {
    const { ethers, bgamble, usdc, oracle1, oracle2, oracle3, alice, bob, carol, dave } =
      await deployFixture();

    const wA = 1;
    const wB = 2;
    const wC = 3;
    const wD = 4;

    const betId = 1;

    await bgamble.connect(alice).create(1, TEN_USDC, 4, wA);
    await bgamble.connect(bob).join(betId, wB);
    await bgamble.connect(carol).join(betId, wC);
    await bgamble.connect(dave).join(betId, wD);

    await bgamble.connect(alice).confirm(betId);
    await bgamble.connect(bob).confirm(betId);
    await bgamble.connect(carol).confirm(betId);
    await bgamble.connect(dave).confirm(betId);

    const aliceBefore = asBigInt(await usdc.balanceOf(alice.address));
    const bobBefore = asBigInt(await usdc.balanceOf(bob.address));
    const carolBefore = asBigInt(await usdc.balanceOf(carol.address));
    const daveBefore = asBigInt(await usdc.balanceOf(dave.address));

    const oracleIndex = betId % 4;
    const feeRecipient = [oracle1, oracle2, oracle3, oracle1][oracleIndex];
    const oracleBefore = asBigInt(await usdc.balanceOf(feeRecipient.address));

    const unknownWinner = 999;

    await bgamble.connect(oracle1).reportResult(betId, [unknownWinner]);
    await bgamble.connect(oracle2).reportResult(betId, [unknownWinner]);
    await bgamble.connect(oracle3).reportResult(betId, [unknownWinner]);

    const bet = await bgamble.bets(betId);
    expect(bet.state).to.equal(3n);

    const aliceAfter = asBigInt(await usdc.balanceOf(alice.address));
    const bobAfter = asBigInt(await usdc.balanceOf(bob.address));
    const carolAfter = asBigInt(await usdc.balanceOf(carol.address));
    const daveAfter = asBigInt(await usdc.balanceOf(dave.address));
    const oracleAfter = asBigInt(await usdc.balanceOf(feeRecipient.address));

    const prizePool = TEN_USDC * 4n;
    const payout = prizePool - ORACLE_FEE;
    const share = payout / 4n;
    const remainder = payout % 4n;

    const incA = aliceAfter - aliceBefore;
    const incB = bobAfter - bobBefore;
    const incC = carolAfter - carolBefore;
    const incD = daveAfter - daveBefore;

    // Everyone is a winner; last winner in order gets the dust
    expect(incA).to.equal(share);
    expect(incB).to.equal(share);
    expect(incC).to.equal(share);
    expect(incD).to.equal(share + remainder);

    expect(oracleAfter - oracleBefore).to.equal(ORACLE_FEE);

    const contractBalance = asBigInt(await usdc.balanceOf(await bgamble.getAddress()));
    expect(contractBalance).to.equal(0n);
  });
});

