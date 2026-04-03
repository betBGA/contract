import { describe, it } from "node:test";
import { expect } from "chai";
import {
  deployFixture,
  lockedBetFixture,
  confirmingBetFixture,
  createOpenBetFixture,
  TEN_USDT,
  USDT_UNIT,
  ONE_DAY,
  timeTravel,
} from "./helpers.js";

describe("refund", function () {
  // ── Positive tests ──────────────────────────────────────────────

  it("should allow refund after 24h + 1s", async function () {
    const { bgamble, alice, networkHelpers } = await lockedBetFixture();
    await timeTravel(networkHelpers, ONE_DAY + 1);
    await bgamble.connect(alice).refund(1);
  });

  it("should set state to Refunded", async function () {
    const { bgamble, alice, networkHelpers } = await lockedBetFixture();
    await timeTravel(networkHelpers, ONE_DAY + 1);
    await bgamble.connect(alice).refund(1);
    const bet = await bgamble.bets(1);
    expect(bet.state).to.equal(6); // Refunded
  });

  it("should refund all participants their stakes (2 players)", async function () {
    const { bgamble, usdt, alice, bob, networkHelpers } = await lockedBetFixture();
    const aliceBefore = await usdt.balanceOf(alice.address);
    const bobBefore = await usdt.balanceOf(bob.address);

    await timeTravel(networkHelpers, ONE_DAY + 1);
    await bgamble.connect(alice).refund(1);

    expect(await usdt.balanceOf(alice.address) - aliceBefore).to.equal(TEN_USDT * USDT_UNIT);
    expect(await usdt.balanceOf(bob.address) - bobBefore).to.equal(TEN_USDT * USDT_UNIT);
  });

  it("should refund all participants their stakes (3 players)", async function () {
    const { bgamble, usdt, alice, bob, carol, networkHelpers } = await deployFixture();
    const w = 1;
    await bgamble.connect(alice).create(1, TEN_USDT, 3, w);
    await bgamble.connect(bob).join(1, w);
    await bgamble.connect(carol).join(1, w);
    await bgamble.connect(alice).confirm(1);
    await bgamble.connect(bob).confirm(1);
    await bgamble.connect(carol).confirm(1);

    const aliceBefore = await usdt.balanceOf(alice.address);
    const bobBefore = await usdt.balanceOf(bob.address);
    const carolBefore = await usdt.balanceOf(carol.address);

    await timeTravel(networkHelpers, ONE_DAY + 1);
    await bgamble.connect(alice).refund(1);

    expect(await usdt.balanceOf(alice.address) - aliceBefore).to.equal(TEN_USDT * USDT_UNIT);
    expect(await usdt.balanceOf(bob.address) - bobBefore).to.equal(TEN_USDT * USDT_UNIT);
    expect(await usdt.balanceOf(carol.address) - carolBefore).to.equal(TEN_USDT * USDT_UNIT);
  });

  it("should emit BetRefunded event", async function () {
    const { bgamble, alice, networkHelpers } = await lockedBetFixture();
    await timeTravel(networkHelpers, ONE_DAY + 1);
    await expect(bgamble.connect(alice).refund(1))
      .to.emit(bgamble, "BetRefunded")
      .withArgs(1, () => true, alice.address);
  });

  it("should leave the contract with 0 balance after refund", async function () {
    const { bgamble, usdt, alice, networkHelpers } = await lockedBetFixture();
    await timeTravel(networkHelpers, ONE_DAY + 1);
    await bgamble.connect(alice).refund(1);
    const contractBalance = await usdt.balanceOf(await bgamble.getAddress());
    expect(contractBalance).to.equal(0);
  });

  it("should allow any participant to trigger the refund (not just creator)", async function () {
    const { bgamble, bob, networkHelpers } = await lockedBetFixture();
    await timeTravel(networkHelpers, ONE_DAY + 1);
    await bgamble.connect(bob).refund(1);
  });

  it("should not charge oracle fee on refund", async function () {
    const { bgamble, usdt, alice, oracle1, oracle2, oracle3, oracle4, networkHelpers } = await lockedBetFixture();
    const o1Before = await usdt.balanceOf(oracle1.address);
    const o2Before = await usdt.balanceOf(oracle2.address);
    const o3Before = await usdt.balanceOf(oracle3.address);
    const o4Before = await usdt.balanceOf(oracle4.address);

    await timeTravel(networkHelpers, ONE_DAY + 1);
    await bgamble.connect(alice).refund(1);

    expect(await usdt.balanceOf(oracle1.address)).to.equal(o1Before);
    expect(await usdt.balanceOf(oracle2.address)).to.equal(o2Before);
    expect(await usdt.balanceOf(oracle3.address)).to.equal(o3Before);
    expect(await usdt.balanceOf(oracle4.address)).to.equal(o4Before);
  });

  it("should allow refund well after 24h (e.g. 7 days)", async function () {
    const { bgamble, alice, networkHelpers } = await lockedBetFixture();
    await timeTravel(networkHelpers, 7 * ONE_DAY);
    await bgamble.connect(alice).refund(1);
  });

  // ── Negative tests ──────────────────────────────────────────────

  it("should revert if less than 24h since lock", async function () {
    const { bgamble, alice, networkHelpers } = await lockedBetFixture();
    await timeTravel(networkHelpers, ONE_DAY - 60);
    await expect(bgamble.connect(alice).refund(1)).to.be.revertedWithCustomError(bgamble, "RefundTooEarly");
  });

  it("should revert at exactly 24h (boundary: must be strictly greater)", async function () {
    const { bgamble, alice, networkHelpers } = await lockedBetFixture();
    await timeTravel(networkHelpers, ONE_DAY - 1);
    await expect(bgamble.connect(alice).refund(1)).to.be.revertedWithCustomError(bgamble, "RefundTooEarly");
  });

  it("should revert if bet is not Locked (Open)", async function () {
    const { bgamble, alice, networkHelpers } = await createOpenBetFixture();
    await timeTravel(networkHelpers, ONE_DAY + 1);
    await expect(bgamble.connect(alice).refund(1)).to.be.revertedWithCustomError(bgamble, "BetNotLocked");
  });

  it("should revert if bet is Confirming", async function () {
    const { bgamble, alice, networkHelpers } = await confirmingBetFixture();
    await timeTravel(networkHelpers, ONE_DAY + 1);
    await expect(bgamble.connect(alice).refund(1)).to.be.revertedWithCustomError(bgamble, "BetNotLocked");
  });

  it("should revert if bet is already Resolved", async function () {
    const { bgamble, oracle1, oracle2, oracle3, alice, winnerA, networkHelpers } = await lockedBetFixture();
    await bgamble.connect(oracle1).reportResult(1, [winnerA]);
    await bgamble.connect(oracle2).reportResult(1, [winnerA]);
    await bgamble.connect(oracle3).reportResult(1, [winnerA]);

    await timeTravel(networkHelpers, ONE_DAY + 1);
    await expect(bgamble.connect(alice).refund(1)).to.be.revertedWithCustomError(bgamble, "BetNotLocked");
  });

  it("should revert if bet is already Cancelled", async function () {
    const { bgamble, alice, bob, networkHelpers } = await lockedBetFixture();
    await bgamble.connect(alice).voteCancel(1);
    await bgamble.connect(bob).voteCancel(1);

    await timeTravel(networkHelpers, ONE_DAY + 1);
    await expect(bgamble.connect(alice).refund(1)).to.be.revertedWithCustomError(bgamble, "BetNotLocked");
  });

  it("should revert if bet is already Refunded", async function () {
    const { bgamble, alice, bob, networkHelpers } = await lockedBetFixture();
    await timeTravel(networkHelpers, ONE_DAY + 1);
    await bgamble.connect(alice).refund(1);
    await expect(bgamble.connect(bob).refund(1)).to.be.revertedWithCustomError(bgamble, "BetNotLocked");
  });

  it("should revert if caller is not a participant", async function () {
    const { bgamble, carol, networkHelpers } = await lockedBetFixture();
    await timeTravel(networkHelpers, ONE_DAY + 1);
    await expect(bgamble.connect(carol).refund(1)).to.be.revertedWithCustomError(bgamble, "NotParticipant");
  });
});
