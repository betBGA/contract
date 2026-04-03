import { describe, it } from "node:test";
import { expect } from "chai";
import hre from "hardhat";
import { deployFixture } from "./helpers.js";

describe("constructor", function () {
  it("should deploy with 4 unique oracles", async function () {
    const { bgamble, oracle1, oracle2, oracle3, oracle4 } = await deployFixture();

    expect(await bgamble.oracles(0)).to.equal(oracle1.address);
    expect(await bgamble.oracles(1)).to.equal(oracle2.address);
    expect(await bgamble.oracles(2)).to.equal(oracle3.address);
    expect(await bgamble.oracles(3)).to.equal(oracle4.address);
  });

  it("should initialise nextBetId to 1", async function () {
    const { bgamble } = await deployFixture();
    expect(await bgamble.nextBetId()).to.equal(1);
  });

  it("should store the USDT token address", async function () {
    const { bgamble, usdt } = await deployFixture();
    expect(await bgamble.usdt()).to.equal(await usdt.getAddress());
  });

  it("should revert if oracle 1 is address(0)", async function () {
    const { ethers, usdt } = await deployFixture();
    const [, , o2, o3, o4] = await ethers.getSigners();
    const usdtAddr = await usdt.getAddress();

    const BGAmble = await ethers.getContractFactory("BGAmble");
    await expect(
      BGAmble.deploy([ethers.ZeroAddress, o2.address, o3.address, o4.address], usdtAddr)
    ).to.be.revertedWithCustomError(BGAmble, "InvalidOracleAddress");
  });

  it("should revert if oracle 2 is address(0)", async function () {
    const { ethers, usdt } = await deployFixture();
    const [, o1, , o3, o4] = await ethers.getSigners();
    const usdtAddr = await usdt.getAddress();

    const BGAmble = await ethers.getContractFactory("BGAmble");
    await expect(
      BGAmble.deploy([o1.address, ethers.ZeroAddress, o3.address, o4.address], usdtAddr)
    ).to.be.revertedWithCustomError(BGAmble, "InvalidOracleAddress");
  });

  it("should revert if oracle 3 is address(0)", async function () {
    const { ethers, usdt } = await deployFixture();
    const [, o1, o2, , o4] = await ethers.getSigners();
    const usdtAddr = await usdt.getAddress();

    const BGAmble = await ethers.getContractFactory("BGAmble");
    await expect(
      BGAmble.deploy([o1.address, o2.address, ethers.ZeroAddress, o4.address], usdtAddr)
    ).to.be.revertedWithCustomError(BGAmble, "InvalidOracleAddress");
  });

  it("should revert if oracle 4 is address(0)", async function () {
    const { ethers, usdt } = await deployFixture();
    const [, o1, o2, o3] = await ethers.getSigners();
    const usdtAddr = await usdt.getAddress();

    const BGAmble = await ethers.getContractFactory("BGAmble");
    await expect(
      BGAmble.deploy([o1.address, o2.address, o3.address, ethers.ZeroAddress], usdtAddr)
    ).to.be.revertedWithCustomError(BGAmble, "InvalidOracleAddress");
  });

  it("should revert if oracle 1 and 2 are the same", async function () {
    const { ethers, usdt } = await deployFixture();
    const [, o1, , o3, o4] = await ethers.getSigners();
    const usdtAddr = await usdt.getAddress();

    const BGAmble = await ethers.getContractFactory("BGAmble");
    await expect(
      BGAmble.deploy([o1.address, o1.address, o3.address, o4.address], usdtAddr)
    ).to.be.revertedWithCustomError(BGAmble, "DuplicateOracleAddress");
  });

  it("should revert if oracle 1 and 3 are the same", async function () {
    const { ethers, usdt } = await deployFixture();
    const [, o1, o2, , o4] = await ethers.getSigners();
    const usdtAddr = await usdt.getAddress();

    const BGAmble = await ethers.getContractFactory("BGAmble");
    await expect(
      BGAmble.deploy([o1.address, o2.address, o1.address, o4.address], usdtAddr)
    ).to.be.revertedWithCustomError(BGAmble, "DuplicateOracleAddress");
  });

  it("should revert if oracle 1 and 4 are the same", async function () {
    const { ethers, usdt } = await deployFixture();
    const [, o1, o2, o3] = await ethers.getSigners();
    const usdtAddr = await usdt.getAddress();

    const BGAmble = await ethers.getContractFactory("BGAmble");
    await expect(
      BGAmble.deploy([o1.address, o2.address, o3.address, o1.address], usdtAddr)
    ).to.be.revertedWithCustomError(BGAmble, "DuplicateOracleAddress");
  });

  it("should revert if oracle 2 and 3 are the same", async function () {
    const { ethers, usdt } = await deployFixture();
    const [, o1, o2, , o4] = await ethers.getSigners();
    const usdtAddr = await usdt.getAddress();

    const BGAmble = await ethers.getContractFactory("BGAmble");
    await expect(
      BGAmble.deploy([o1.address, o2.address, o2.address, o4.address], usdtAddr)
    ).to.be.revertedWithCustomError(BGAmble, "DuplicateOracleAddress");
  });

  it("should revert if oracle 2 and 4 are the same", async function () {
    const { ethers, usdt } = await deployFixture();
    const [, o1, o2, o3] = await ethers.getSigners();
    const usdtAddr = await usdt.getAddress();

    const BGAmble = await ethers.getContractFactory("BGAmble");
    await expect(
      BGAmble.deploy([o1.address, o2.address, o3.address, o2.address], usdtAddr)
    ).to.be.revertedWithCustomError(BGAmble, "DuplicateOracleAddress");
  });

  it("should revert if oracle 3 and 4 are the same", async function () {
    const { ethers, usdt } = await deployFixture();
    const [, o1, o2, o3] = await ethers.getSigners();
    const usdtAddr = await usdt.getAddress();

    const BGAmble = await ethers.getContractFactory("BGAmble");
    await expect(
      BGAmble.deploy([o1.address, o2.address, o3.address, o3.address], usdtAddr)
    ).to.be.revertedWithCustomError(BGAmble, "DuplicateOracleAddress");
  });

  it("should revert if all 4 oracles are the same", async function () {
    const { ethers, usdt } = await deployFixture();
    const [, o1] = await ethers.getSigners();
    const usdtAddr = await usdt.getAddress();

    const BGAmble = await ethers.getContractFactory("BGAmble");
    await expect(
      BGAmble.deploy([o1.address, o1.address, o1.address, o1.address], usdtAddr)
    ).to.be.revertedWithCustomError(BGAmble, "DuplicateOracleAddress");
  });

  it("should revert if USDT address is address(0)", async function () {
    const { ethers } = await deployFixture();
    const [, o1, o2, o3, o4] = await ethers.getSigners();

    const BGAmble = await ethers.getContractFactory("BGAmble");
    await expect(
      BGAmble.deploy([o1.address, o2.address, o3.address, o4.address], ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(BGAmble, "InvalidTokenAddress");
  });
});
