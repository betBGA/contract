import { describe, it } from "node:test";
import { expect } from "chai";
import { deployFixture, TEN_POL, POL, GAS_MARGIN, oracleFee } from "./helpers.js";

describe("Bet lifecycle - Resolved", () => {
  it("4 players, everyone picks own id, oracles resolve in favour of player 1", async () => {
    const { ethers, bgamble, oracle1, oracle2, oracle3, alice, bob, carol, dave } =
      await deployFixture();

    const wA = 1;
    const wB = 2;
    const wC = 3;
    const wD = 4;

    const betId = 1;

    await bgamble.connect(alice).create(1, TEN_POL, 4, wA, { value: TEN_POL * POL });
    await bgamble.connect(bob).join(betId, wB, { value: TEN_POL * POL });
    await bgamble.connect(carol).join(betId, wC, { value: TEN_POL * POL });
    await bgamble.connect(dave).join(betId, wD, { value: TEN_POL * POL });

    await bgamble.connect(alice).confirm(betId);
    await bgamble.connect(bob).confirm(betId);
    await bgamble.connect(carol).confirm(betId);
    await bgamble.connect(dave).confirm(betId);

    const aliceBefore = await ethers.provider.getBalance(alice.address);
    const bobBefore = await ethers.provider.getBalance(bob.address);
    const carolBefore = await ethers.provider.getBalance(carol.address);
    const daveBefore = await ethers.provider.getBalance(dave.address);

    const oracleIndex = betId % 4; // same logic as contract
    const feeRecipient = [oracle1, oracle2, oracle3, oracle1][oracleIndex]; // betId=1 → oracle[1]
    const oracleBefore = await ethers.provider.getBalance(feeRecipient.address);

    await bgamble.connect(oracle1).reportResult(betId, [wA]);
    await bgamble.connect(oracle2).reportResult(betId, [wA]);
    await bgamble.connect(oracle3).reportResult(betId, [wA]);

    const bet = await bgamble.bets(betId);
    expect(bet.state).to.equal(3n); // Resolved

    const aliceAfter = await ethers.provider.getBalance(alice.address);
    const bobAfter = await ethers.provider.getBalance(bob.address);
    const carolAfter = await ethers.provider.getBalance(carol.address);
    const daveAfter = await ethers.provider.getBalance(dave.address);
    const oracleAfter = await ethers.provider.getBalance(feeRecipient.address);

    const prizePool = TEN_POL * POL * 4n;
    const fee = oracleFee(prizePool);
    const payout = prizePool - fee;

    // Alice is the sole winner (non-transacting, exact check)
    expect(aliceAfter - aliceBefore).to.equal(payout);
    expect(bobAfter).to.equal(bobBefore);
    expect(carolAfter).to.equal(carolBefore);
    expect(daveAfter).to.equal(daveBefore);

    // Oracle2 (fee recipient) also sent a reportResult tx, so use margin
    const oracleDelta = oracleAfter - oracleBefore;
    expect(oracleDelta).to.be.greaterThan(fee - GAS_MARGIN);
    expect(oracleDelta).to.be.lessThanOrEqual(fee);

    const contractBalance = await ethers.provider.getBalance(await bgamble.getAddress());
    expect(contractBalance).to.equal(0n);
  });

  it("4 players, two winners share payout and dust", async () => {
    const { ethers, bgamble, oracle1, oracle2, oracle3, alice, bob, carol, dave } =
      await deployFixture();

    const wA = 1;
    const wB = 2;
    const wC = 3;
    const wD = 4;

    const betId = 1;

    await bgamble.connect(alice).create(1, TEN_POL, 4, wA, { value: TEN_POL * POL });
    await bgamble.connect(bob).join(betId, wB, { value: TEN_POL * POL });
    await bgamble.connect(carol).join(betId, wC, { value: TEN_POL * POL });
    await bgamble.connect(dave).join(betId, wD, { value: TEN_POL * POL });

    await bgamble.connect(alice).confirm(betId);
    await bgamble.connect(bob).confirm(betId);
    await bgamble.connect(carol).confirm(betId);
    await bgamble.connect(dave).confirm(betId);

    const aliceBefore = await ethers.provider.getBalance(alice.address);
    const bobBefore = await ethers.provider.getBalance(bob.address);
    const carolBefore = await ethers.provider.getBalance(carol.address);
    const daveBefore = await ethers.provider.getBalance(dave.address);

    const oracleIndex = betId % 4;
    const feeRecipient = [oracle1, oracle2, oracle3, oracle1][oracleIndex];
    const oracleBefore = await ethers.provider.getBalance(feeRecipient.address);

    await bgamble.connect(oracle1).reportResult(betId, [wA, wC]);
    await bgamble.connect(oracle2).reportResult(betId, [wA, wC]);
    await bgamble.connect(oracle3).reportResult(betId, [wA, wC]);

    const bet = await bgamble.bets(betId);
    expect(bet.state).to.equal(3n);

    const aliceAfter = await ethers.provider.getBalance(alice.address);
    const bobAfter = await ethers.provider.getBalance(bob.address);
    const carolAfter = await ethers.provider.getBalance(carol.address);
    const daveAfter = await ethers.provider.getBalance(dave.address);
    const oracleAfter = await ethers.provider.getBalance(feeRecipient.address);

    const prizePool = TEN_POL * POL * 4n;
    const fee = oracleFee(prizePool);
    const payout = prizePool - fee;
    const share = payout / 2n;
    const remainder = payout % 2n;

    // Alice is first winner, Carol is second and should get the dust
    expect(aliceAfter - aliceBefore).to.equal(share);
    expect(carolAfter - carolBefore).to.equal(share + remainder);

    expect(bobAfter).to.equal(bobBefore);
    expect(daveAfter).to.equal(daveBefore);

    const oracleDelta = oracleAfter - oracleBefore;
    expect(oracleDelta).to.be.greaterThan(fee - GAS_MARGIN);
    expect(oracleDelta).to.be.lessThanOrEqual(fee);

    const contractBalance = await ethers.provider.getBalance(await bgamble.getAddress());
    expect(contractBalance).to.equal(0n);
  });

  it("4 players, no one predicted winner so everyone shares payout", async () => {
    const { ethers, bgamble, oracle1, oracle2, oracle3, alice, bob, carol, dave } =
      await deployFixture();

    const wA = 1;
    const wB = 2;
    const wC = 3;
    const wD = 4;

    const betId = 1;

    await bgamble.connect(alice).create(1, TEN_POL, 4, wA, { value: TEN_POL * POL });
    await bgamble.connect(bob).join(betId, wB, { value: TEN_POL * POL });
    await bgamble.connect(carol).join(betId, wC, { value: TEN_POL * POL });
    await bgamble.connect(dave).join(betId, wD, { value: TEN_POL * POL });

    await bgamble.connect(alice).confirm(betId);
    await bgamble.connect(bob).confirm(betId);
    await bgamble.connect(carol).confirm(betId);
    await bgamble.connect(dave).confirm(betId);

    const aliceBefore = await ethers.provider.getBalance(alice.address);
    const bobBefore = await ethers.provider.getBalance(bob.address);
    const carolBefore = await ethers.provider.getBalance(carol.address);
    const daveBefore = await ethers.provider.getBalance(dave.address);

    const oracleIndex = betId % 4;
    const feeRecipient = [oracle1, oracle2, oracle3, oracle1][oracleIndex];
    const oracleBefore = await ethers.provider.getBalance(feeRecipient.address);

    const unknownWinner = 999;

    await bgamble.connect(oracle1).reportResult(betId, [unknownWinner]);
    await bgamble.connect(oracle2).reportResult(betId, [unknownWinner]);
    await bgamble.connect(oracle3).reportResult(betId, [unknownWinner]);

    const bet = await bgamble.bets(betId);
    expect(bet.state).to.equal(3n);

    const aliceAfter = await ethers.provider.getBalance(alice.address);
    const bobAfter = await ethers.provider.getBalance(bob.address);
    const carolAfter = await ethers.provider.getBalance(carol.address);
    const daveAfter = await ethers.provider.getBalance(dave.address);
    const oracleAfter = await ethers.provider.getBalance(feeRecipient.address);

    const prizePool = TEN_POL * POL * 4n;
    const fee = oracleFee(prizePool);
    const payout = prizePool - fee;
    const share = payout / 4n;
    const remainder = payout % 4n;

    // Everyone is a winner; last winner in order gets the dust
    expect(aliceAfter - aliceBefore).to.equal(share);
    expect(bobAfter - bobBefore).to.equal(share);
    expect(carolAfter - carolBefore).to.equal(share);
    expect(daveAfter - daveBefore).to.equal(share + remainder);

    const oracleDelta = oracleAfter - oracleBefore;
    expect(oracleDelta).to.be.greaterThan(fee - GAS_MARGIN);
    expect(oracleDelta).to.be.lessThanOrEqual(fee);

    const contractBalance = await ethers.provider.getBalance(await bgamble.getAddress());
    expect(contractBalance).to.equal(0n);
  });
});

