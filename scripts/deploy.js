import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import hre from "hardhat";

async function main() {
  const connection = await hre.network.connect();
  const { ethers } = connection;

  // ── Token addresses ─────────────────────────────────────────────
  // Amoy testnet USDC (Circle):  0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582
  // Polygon mainnet USDC:        0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
  // ────────────────────────────────────────────────────────────────

  const TOKEN_ADDRESS = process.env.USDC_ADDRESS;
  if (!TOKEN_ADDRESS) throw new Error("Set USDC_ADDRESS in your .env file");

  const oracle1 = process.env.ORACLE_1;
  const oracle2 = process.env.ORACLE_2;
  const oracle3 = process.env.ORACLE_3;
  const oracle4 = process.env.ORACLE_4;
  if (!oracle1 || !oracle2 || !oracle3 || !oracle4)
    throw new Error("Set ORACLE_1, ORACLE_2, ORACLE_3, ORACLE_4 in your .env file");

  const networkName = connection.networkName;

  console.log("Deploying BGAmble...");
  console.log("  Network :", networkName);
  console.log("  Token   :", TOKEN_ADDRESS);
  console.log("  Oracles :", oracle1, oracle2, oracle3, oracle4);

  const BGAmble = await ethers.getContractFactory("BGAmble");
  const constructorArgs = [TOKEN_ADDRESS, [oracle1, oracle2, oracle3, oracle4]];
  const contract = await BGAmble.deploy(...constructorArgs);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("\n✅ BGAmble deployed to:", address);

  // Verify on Polygonscan (optional — will skip if API key is missing)
  if (networkName !== "hardhat" && networkName !== "localhost" && networkName !== "default") {
    console.log("\nWaiting 30 seconds before verification...");
    await new Promise((r) => setTimeout(r, 30_000));

    // Write constructor args to a temp module (needed for complex types like address[])
    const argsPath = join(process.cwd(), ".verify-args.js");
    writeFileSync(argsPath, `export default ${JSON.stringify(constructorArgs)};\n`);

    try {
      await hre.tasks.getTask("verify").run({
        address,
        constructorArgsPath: argsPath,
      });
      console.log("✅ Contract verified on Polygonscan");
    } catch (err) {
      console.log("⚠️  Verification failed (you can retry later):", err.message);
    } finally {
      try { unlinkSync(argsPath); } catch {}
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
