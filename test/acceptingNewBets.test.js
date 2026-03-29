import { describe, it } from "node:test";
import { expect } from "chai";
import { deployFixture, createOpenBetFixture, TEN_POL, POL } from "./helpers.js";

describe("acceptingNewBets", function () {
  // ── Positive tests ──────────────────────────────────────────────

  it("should default to true", async function () {
    const { bgamble } = await deployFixture();
    expect(await bgamble.acceptingNewBets()).to.equal(true);
  });

  it("should allow the owner to disable new bets", async function () {
    const { bgamble, deployer } = await deployFixture();
    await bgamble.connect(deployer).setAcceptingNewBets(false);
    expect(await bgamble.acceptingNewBets()).to.equal(false);
  });

  it("should allow the owner to re-enable new bets", async function () {
    const { bgamble, deployer } = await deployFixture();
    await bgamble.connect(deployer).setAcceptingNewBets(false);
    await bgamble.connect(deployer).setAcceptingNewBets(true);
    expect(await bgamble.acceptingNewBets()).to.equal(true);
  });

  it("should emit AcceptingNewBetsChanged when toggled", async function () {
    const { bgamble, deployer, ethers } = await deployFixture();
    await expect(bgamble.connect(deployer).setAcceptingNewBets(false))
      .to.emit(bgamble, "AcceptingNewBetsChanged")
      .withArgs(false);
    await expect(bgamble.connect(deployer).setAcceptingNewBets(true))
      .to.emit(bgamble, "AcceptingNewBetsChanged")
      .withArgs(true);
  });

  it("should set the deployer as the owner", async function () {
    const { bgamble, deployer } = await deployFixture();
    expect(await bgamble.owner()).to.equal(deployer.address);
  });

  it("should block create() when disabled", async function () {
    const { bgamble, deployer, alice, ethers } = await deployFixture();
    await bgamble.connect(deployer).setAcceptingNewBets(false);
    await expect(
      bgamble.connect(alice).create(1, TEN_POL, 2, 1, { value: TEN_POL * POL })
    ).to.be.revertedWithCustomError(bgamble, "NewBetsDisabled");
  });

  it("should allow create() again after re-enabling", async function () {
    const { bgamble, deployer, alice, ethers } = await deployFixture();
    await bgamble.connect(deployer).setAcceptingNewBets(false);
    await bgamble.connect(deployer).setAcceptingNewBets(true);
    await expect(
      bgamble.connect(alice).create(1, TEN_POL, 2, 1, { value: TEN_POL * POL })
    ).to.not.be.revert(ethers);
  });

  it("should still allow join() on existing bets when disabled", async function () {
    const { bgamble, deployer, bob, ethers } = await createOpenBetFixture();
    await bgamble.connect(deployer).setAcceptingNewBets(false);
    await expect(
      bgamble.connect(bob).join(1, 2, { value: TEN_POL * POL })
    ).to.not.be.revert(ethers);
  });

  // ── Negative tests ──────────────────────────────────────────────

  it("should revert when a non-owner tries to disable", async function () {
    const { bgamble, alice } = await deployFixture();
    await expect(
      bgamble.connect(alice).setAcceptingNewBets(false)
    ).to.be.revertedWithCustomError(bgamble, "NotOwner");
  });

  it("should revert when a non-owner tries to enable", async function () {
    const { bgamble, deployer, alice } = await deployFixture();
    await bgamble.connect(deployer).setAcceptingNewBets(false);
    await expect(
      bgamble.connect(alice).setAcceptingNewBets(true)
    ).to.be.revertedWithCustomError(bgamble, "NotOwner");
  });

  it("should revert when an oracle tries to toggle", async function () {
    const { bgamble, oracle1 } = await deployFixture();
    await expect(
      bgamble.connect(oracle1).setAcceptingNewBets(false)
    ).to.be.revertedWithCustomError(bgamble, "NotOwner");
  });
});

