import "dotenv/config";
import { defineConfig, configVariable } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatNetworkHelpers from "@nomicfoundation/hardhat-network-helpers";
import hardhatChaiMatchers from "@nomicfoundation/hardhat-ethers-chai-matchers";
import hardhatNodeTestRunner from "@nomicfoundation/hardhat-node-test-runner";
import hardhatVerify from "@nomicfoundation/hardhat-verify";

export default defineConfig({
  plugins: [
    hardhatEthers,
    hardhatNetworkHelpers,
    hardhatChaiMatchers,
    hardhatNodeTestRunner,
    hardhatVerify,
  ],

  solidity: {
    version: "0.8.34",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },

  networks: {
    amoy: {
      type: "http",
      url: process.env.AMOY_RPC_URL ?? "https://rpc-amoy.polygon.technology",
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
      chainId: 80002,
    },

    polygon: {
      type: "http",
      url: process.env.POLYGON_RPC_URL ?? "https://polygon-rpc.com",
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
      chainId: 137,
    },
  },

  verify: {
    etherscan: {
      apiKey: configVariable("POLYGONSCAN_API_KEY"),
    },
  },
});
