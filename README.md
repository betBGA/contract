# BGAmble

**BGAmble.sol** is a smart contract for betting on the outcome of online boardgames at Board Game Arena. 
Players can create and join bets on the outcome of a game, lock the bet once all participants confirm, and have the result resolved by independent oracle nodes.

The system is designed to be:

* **Trust-minimized** (smart contract escrow)
* **Stateless frontend friendly**
* **Oracle-driven for game results**
* **Low gas cost** for players
* **Low operational cost** for oracles

The smart contract will be deployed on Polygon because of its low gas fees. All bets are denominated in **USDT** (6 decimals). **POL** is only needed to pay Polygon gas fees.

---

# Core Concept

A **bet** represents a wager between a fixed number of participants on the outcome of a specific game.

Each participant stakes an equal amount of **USDT** (whole tokens, 5–250).

When the game ends:

* Oracle nodes report the result
* A **3-of-4 oracle consensus** determines the final outcome
* Winnings are distributed automatically

---

# Key Features

### Non-custodial betting

Funds are escrowed inside the smart contract and distributed automatically according to the result.

### Equal stake betting

All participants stake the **same amount**.

### Multi-winner support

Games may end with:

* a single winner
* multiple winners
* a tie

The prize pool is divided **equally among all winners** after deducting a fixed **0.50 USDT** oracle fee.

Example (2 players, 10 USDT stake each, prize pool = 19.50 USDT after the 0.50 USDT fee):

| Players | Winners | Result                         |
| ------- | ------- | ------------------------------ |
| 2       | 1       | winner receives 19.50 USDT    |
| 2       | 2       | each winner receives 9.75 USDT |

---

### Oracle consensus

Game results are reported by independent oracle nodes.

The contract requires:

* **4 oracle addresses**
* **3 matching reports** to finalize a result

---

### Maximum bet amount

The maximum bet amount is capped at **250 USDT** per participant. The minimum is **5 USDT**. These limits are enforced on-chain in the `create` function.

The cap exists to reduce the financial incentive for oracles to become corrupted — keeping the potential payout per bet bounded limits the reward for dishonest behavior, while still allowing relatively large bets.

---

### Oracle compensation

Oracles are compensated for their operational and transaction costs. For every resolved bet, one oracle receives a fixed fee of **0.50 USDT**, paid from the prize pool. No oracle fee is charged when a bet ends in NoConsensus, Cancelled, or Refunded state.
This is done in round-robin fashion without looking at who reported the actual result leading to consensus for this bet, to avoid wars between oracles.

---

### Bet cancellation by consensus

Participants can cancel a bet if **all participants vote to cancel**.

All stakes are refunded.

---

### Refund protection

If oracle consensus is not reached within **24 hours**, any participant can trigger a refund and all participants will have their bet refunded.

---

### Emergency halt

The contract owner (deployer) can disable new bet creation at any time by calling `setAcceptingNewBets(false)`. When disabled, `create()` reverts but all other actions on existing bets (join, confirm, leave, cancel, resolve, refund) continue to work normally. This can be re-enabled at any time by calling `setAcceptingNewBets(true)`.

---

### Stateless frontend support

The design allows a frontend to:

* read all state from the blockchain
* reconstruct open bets using events
* run without a centralized database

---

# Smart Contract Overview

The smart contract is responsible for:

* holding bet escrow funds (USDT)
* managing participant membership
* enforcing bet confirmation
* handling cancellation consensus
* receiving oracle results
* distributing winnings
* allowing the owner to halt new bet creation

The contract uses **OpenZeppelin's SafeERC20** for compatibility with non-standard ERC-20 implementations such as USDT, and **OpenZeppelin's ReentrancyGuard** to protect state-changing flows that transfer escrowed funds.

---

# Bet Lifecycle

Each bet progresses through a **state machine**.

```
            Open
              ↓↑
            Confirming
              ↓
            Locked
        ↙   ↙  ↓       ↘
Cancelled  NoConsensus  Resolved  Refunded
```

---

# Bet States

## Open

The bet is created with 2-10 participant slots and is open to join by anyone until all slots have been filled.

Characteristics:
* participants may **join**
* participants may **leave**

Transition conditions:

| Condition                        | Next State |
|----------------------------------| ---------- |
| All participant slots are filled | Confirming |

---

## Confirming

All participant slots have been filled, and all participants need to confirm that they want to go forward with the bet after seeing the other participants and their predicted winners.
Note that multiple participants can bet on the same outcome, which will influence the amount paid in case those participants end up winning.
Once all participants have confirmed, the bet becomes locked.

Characteristics:
* participants may **confirm**
* participants may **leave**

Transition conditions:

| Condition                  | Next State |
| -------------------------- | ---------- |
| All participants confirmed | Locked     |
| Participant leaves         | Open       |

---

## Locked

The bet is locked in and the game is assumed to be in progress. 
The bet stays locked until:
- 3 oracles have reported the same winner.
- all 4 oracles have reported without reaching consensus.
- all players vote to cancel the bet.
- a participant triggers a refund after 24 hours have passed since the bet was locked.

Characteristics:
* oracles may **report results**
* participants may vote to **cancel**

Transition conditions:

| Condition                                                                                 | Next State  |
|-------------------------------------------------------------------------------------------|-------------|
| 3 oracles report the same winner(s) (including a tie / no winners)                        | Resolved    |
| all 4 oracles reported but no 3 agree (no consensus)                                      | NoConsensus |
| a participant triggers a refund 24h after the bet was locked                               | Refunded    |
| all participants agree to cancel the bet                                                  | Cancelled   |

---

## Resolved

The bet outcome has been finalized.

Actions performed:
1. Calculate prize pool (amount × participantCount × 1e6)
2. Deduct the fixed 0.50 USDT oracle fee
3. Send oracle fee to the round-robin oracle for this bet (based on betId, not based on who reported results)
4. Distribute winnings

This is a permanent/final state.

---

## NoConsensus

All 4 oracles have reported but no 3 agreed on the same result.

Actions performed:
1. Refund all participants in full (no oracle fee is deducted, as the oracles did not function as intended)

This is a permanent/final state.

---

## Cancelled

Participants unanimously voted to cancel.

Actions:
* all stakes refunded
* no oracle fee

This is a permanent/final state.

---

## Refunded

No oracle consensus was reached within the 24h window since the bet was locked in, and a participant triggered a refund.

Actions:
* all stakes refunded to all participants
* no oracle fee

This is a permanent/final state.
---

# Oracle System

4 independent oracles periodically try to collect results for all locked bets off-chain, and report them to the contract.
Their addresses are configured when deploying the contract.
Multiple winners or even no winners can be reported by the oracles, depending on the game outcome.

## Winner ID ordering
**Important:** Oracle consensus is based on the keccak256 hash of the `winnerIds` array. This means all oracles **must report winner IDs in the exact same order** for their reports to match. Oracles must sort `winnerIds` in ascending order before submitting. If two oracles report the same winners in a different order, the hashes will differ and consensus will not be reached.

## Oracle fee
Oracles are compensated for their operational and transaction costs with a fixed fee of **0.50 USDT** per resolved bet.
For simplicity, oracles are paid in round-robin fashion without looking at who reported the actual result leading to consensus for this bet, to avoid wars between oracles.

## Oracle trust mode
The 3/4 consensus is a balance between avoiding a single point of failure (1 oracle) and avoiding excessive complexity and cost of more advanced oracle systems.
Participants inherently will have to trust that at least 3 of the 4 oracles will report honestly. Reputation over time will play a role here.

If three oracles were to become fraudulent, it will be easy for participants to identify the fraud since game results can be verified by anyone on BGA, even without an account.
This should result in the community replacing the dishonest oracles.

Additionally, the maximum bet amount of 250 USDT per participant caps the potential profit from oracle corruption, further reducing the incentive for dishonest behavior.

---

# Prize Distribution

The prize pool is calculated dynamically:

```
prizePool = betAmount × participantCount × 1e6 (USDT base units)
oracleFee = 0.50 USDT
payout    = prizePool − oracleFee
```

Example:

| Players | Stake   | Fee       | Prize Pool |
| ------- | ------- | --------- | ---------- |
| 2       | 10 USDT | 0.50 USDT | 19.50 USDT |


Remaining funds are distributed to winners:

| Scenario  | Payout      |
| --------- | ----------- |
| 1 winner  | 19.50 USDT  |
| 2 winners | 9.75 USDT each |

If an equal split leaves a 0.000001 USDT remainder, the contract assigns that dust to the last winner.


---

# Participant Actions

## Create Bet

```
create(bgaTableId, amount, slotCount, predictedWinner)
```

`bgaTableId`: the numeric table ID of the corresponding game on Board Game Arena.
`amount`: the amount of whole USDT tokens to be staked by each participant (e.g. 10 = 10 USDT). Minimum 5, maximum 250.
`slotCount`: the total number of participant slots for this bet (between 2 and 10).
`predictedWinner`: the numeric BGA player ID that is being predicted as winner.
Before calling `create`, the caller must approve the contract to spend `amount × 1e6` USDT on their behalf.

The creator automatically joins the bet with their predicted winner.

Reverts with `NewBetsDisabled` if the owner has disabled new bet creation.

---

## Join Bet

```
join(betId, predictedWinner)
```

Before calling `join`, the caller must approve the contract to spend the bet's stake amount in USDT (`amount × 1e6`). Registers the participant's predicted winner.

---

## Confirm Bet

```
confirm(betId)
```

Signals that the participant agrees to start the game.

All participants must confirm before the bet becomes **Locked**.

---

## Leave Bet

```
leave(betId)
```

Allowed while bet is:

```
Open
Confirming
```

Leaving:

* refunds the participant's stake in USDT
* resets confirmations for all remaining participants

---

## Cancel Bet

```
voteCancel(betId)
```

All participants must vote to cancel for the cancel to go through.

---

## Request Refund

```
refund(betId)
```

Allowed when:

24 hours elapsed AND bet still unresolved


---

# Oracle Actions

## Report Result

```
reportResult(betId, winnerIds)
```

Rules:

* only authorized oracles may report
* each oracle may report only once per bet
* 3 matching reports resolve the bet
* 4 reports with no 3 agreeing trigger no-consensus (all participants are refunded in full)


---

# Owner Actions

The contract owner is the address that deployed the contract. This is stored as an `immutable` value and cannot be transferred.

## Set Accepting New Bets

```
setAcceptingNewBets(accepting)
```

`accepting`: `true` to allow new bets, `false` to block them.

When set to `false`, `create()` will revert with `NewBetsDisabled`. All other actions on existing bets (join, confirm, leave, cancel, resolve, refund) remain unaffected. Defaults to `true`.

Emits `AcceptingNewBetsChanged(bool accepting)`.

---

# View Functions

## Get Participants

```
getParticipants(betId) → Participant[]
```

Returns all participants for a bet, including their address, predicted winner, confirmation status, and cancel vote.

## Get Oracle Result Hash

```
getOracleResultHash(betId, oracle) → bytes32
```

Returns the result hash submitted by a specific oracle for a bet. Returns `bytes32(0)` if the oracle has not yet reported.

## Get Result Votes

```
getResultVotes(betId, resultHash) → uint8
```

Returns how many oracles submitted a given result hash for a bet.

## Get Resolved Winner IDs

```
getResolvedWinnerIds(betId) → uint64[]
```

Returns the winner IDs that were stored when the bet was resolved. Returns an empty array if the bet has not been resolved yet, or if it was resolved via no-consensus (refund to all). This allows frontends to display the actual resolved outcome on-chain without parsing events.

## Get Bet Summary

```
getBetSummary(betId) → BetSummary
```

Returns a single bet's data as a `BetSummary` struct containing: `betId`, `bgaTableId`, `slotCount`, `confirmCount`, `cancelVoteCount`, `state`, `amount`, `lockedAt`, `createdAtBlock`, `participants[]`, and `resolvedWinnerIds[]`. Returns a zeroed struct for non-existent bets.

## Get Bets By State

```
getBetsByState(state, cursor, limit, asc) → BetSummary[]
```

Returns a paginated list of bets matching the given `BetState`, ordered by bet ID.

**Parameters:**

| Parameter | Type       | Description                                                                                  |
|-----------|------------|----------------------------------------------------------------------------------------------|
| `state`   | `BetState` | The state to filter by (`Open`, `Confirming`, `Locked`, `Resolved`, `NoConsensus`, `Cancelled`, `Refunded`) |
| `cursor`  | `uint32`   | The bet ID to start scanning from. Use `0` for the first page.                               |
| `limit`   | `uint8`    | Maximum number of results to return (1–255).                                                 |
| `asc`     | `bool`     | `true` for oldest-first, `false` for newest-first.                                           |

**Pagination:**

* **First page (newest):** `getBetsByState(Locked, 0, 20, false)`
* **Next page:** pass the last `betId` from the previous page as `cursor`
* **No more results:** indicated by an empty array

`cursor = 0` means "start from the edge" — newest for descending, oldest for ascending. Each subsequent page uses the last returned `betId` as the cursor to continue scanning.

---

# Future Improvements

Potential future upgrades include:

* permissionless oracle network
* automatic bet discovery via events
* multi-game support
* gasless meta-transactions
* decentralized oracle staking and slashing

---

# Summary

BGAmble provides a **trust-minimized betting layer for multiplayer games**, combining:

* smart contract escrow (USDT)
* oracle-verified results
* participant consensus controls
* gas-optimized storage

The architecture enables decentralized, community-run betting without requiring custody of user funds.
