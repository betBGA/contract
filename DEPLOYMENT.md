# BGAmble — Deployment Guide

---

## Step-by-step: Deploy to Polygon Amoy Testnet

### 1. Create a deployer wallet

Use MetaMask or any wallet to create a **dedicated deployer wallet**. Export its private key.

### 2. Get test POL (gas token)

You need testnet POL to pay for gas on Amoy:
- Go to the [Polygon Amoy Faucet](https://faucet.polygon.technology/) and request test POL for your deployer address.

### 3. Fill in your `.env` file

```bash
cp .env.example .env
```

Then edit `.env`:

```env
# Private key of your deployer wallet (with or without 0x prefix)
DEPLOYER_PRIVATE_KEY=your_private_key_here

# Your 4 oracle wallet addresses
ORACLE_1=0x...
ORACLE_2=0x...
ORACLE_3=0x...
ORACLE_4=0x...

# USDT token contract address for the target network
USDT_ADDRESS=0x...

# Deployed contract address (needed for halt/resume scripts)
BGAMBLE_ADDRESS=0x...

# Optional: for contract verification on Polygonscan
POLYGONSCAN_API_KEY=your_key_here
```

### 4. Deploy

```bash
npm run deploy:testnet
```

This runs `hardhat run scripts/deploy.js --network amoy`, which will:
1. Compile the contract
2. Deploy it to Amoy using the constructor arguments `[oracle1, oracle2, oracle3, oracle4]` and `USDT_ADDRESS`
3. Wait 30 seconds, then attempt to verify it on Polygonscan

The deployer wallet becomes the **contract owner** — the only address that can call `setAcceptingNewBets()` to halt or resume new bet creation. This is stored as an immutable value and cannot be transferred, so make sure to use the correct wallet.

You'll see output like:
```
Deploying BGAmble...
  Network : amoy
  Oracles : 0x... 0x... 0x... 0x...
  USDT    : 0x...

✅ BGAmble deployed to: 0xYOUR_CONTRACT_ADDRESS
```

---

## Step-by-step: Deploy to Polygon Mainnet (later)

### 1. Fund deployer with real POL

Buy POL and send it to your deployer wallet address. A few dollars worth is enough for deployment gas.

### 2. Update `.env` for mainnet

```env
# Use your real oracle addresses (can be the same or different)
ORACLE_1=0x...
ORACLE_2=0x...
ORACLE_3=0x...
ORACLE_4=0x...

# USDT token contract address on Polygon mainnet
USDT_ADDRESS=0x...
```

### 3. Deploy

```bash
npm run deploy:mainnet
```

---

## Contract Verification (Polygonscan)

The deploy script auto-verifies if `POLYGONSCAN_API_KEY` is set. To get a key:

1. Create a free account at [polygonscan.com/register](https://polygonscan.com/register)
2. Generate an API key at [polygonscan.com/myapikey](https://polygonscan.com/myapikey)

If auto-verification fails, you can retry manually:

```bash
npx hardhat verify --network amoy CONTRACT_ADDRESS \
  "[0xORACLE1,0xORACLE2,0xORACLE3,0xORACLE4]" \
  "0xUSDT_ADDRESS"
```

---

## Halt / Resume New Bet Creation

After deployment, set `BGAMBLE_ADDRESS` in your `.env` to the deployed contract address, then use the convenience scripts to halt or resume new bet creation. The scripts use the `DEPLOYER_PRIVATE_KEY` from `.env` to sign the transaction.

```bash
# Stop new bets from being created
npm run halt:testnet    # or halt:mainnet

# Allow new bets again
npm run resume:testnet  # or resume:mainnet
```

Existing bets (join, confirm, leave, cancel, resolve, refund) are unaffected by halting.

---

## Quick Reference

| Command | What it does |
|---|---|
| `npm run compile` | Compile the contract |
| `npm run test` | Run tests |
| `npm run deploy:testnet` | Deploy to Polygon Amoy |
| `npm run deploy:mainnet` | Deploy to Polygon mainnet |
| `npm run halt:testnet` | Disable new bet creation on Amoy |
| `npm run halt:mainnet` | Disable new bet creation on mainnet |
| `npm run resume:testnet` | Re-enable new bet creation on Amoy |
| `npm run resume:mainnet` | Re-enable new bet creation on mainnet |

| Network | Chain ID | Native Token |
|---|---|---|
| Amoy (testnet) | 80002 | test POL |
| Polygon (mainnet) | 137 | POL |
