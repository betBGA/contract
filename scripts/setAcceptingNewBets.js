import hre from "hardhat";

async function main() {
  const contractAddress = process.env.BGAMBLE_ADDRESS;
  if (!contractAddress) throw new Error("Set BGAMBLE_ADDRESS in your .env file");

  const arg = process.env.ACCEPTING;
  if (arg !== "true" && arg !== "false") {
    console.error("Usage: ACCEPTING=<true|false> hardhat run scripts/setAcceptingNewBets.js --network <network>");
    process.exitCode = 1;
    return;
  }

  const accepting = arg === "true";

  const connection = await hre.network.connect();
  const { ethers } = connection;

  const [signer] = await ethers.getSigners();
  const bgamble = await ethers.getContractAt("BGAmble", contractAddress);

  const current = await bgamble.acceptingNewBets();
  const owner = await bgamble.owner();

  console.log("  Network  :", connection.networkName);
  console.log("  Contract :", contractAddress);
  console.log("  Owner    :", owner);
  console.log("  Signer   :", signer.address);
  console.log("  Current  :", current);
  console.log("  Setting  :", accepting);

  if (current === accepting) {
    console.log("\n⚠️  Already set to", accepting, "— nothing to do.");
    return;
  }

  const tx = await bgamble.connect(signer).setAcceptingNewBets(accepting);
  console.log("\n⏳ Transaction sent:", tx.hash);
  await tx.wait();

  console.log("✅ acceptingNewBets is now", accepting);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

