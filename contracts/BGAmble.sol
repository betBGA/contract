// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// BGAmble is a smart contract for betting on the outcome of online boardgames
// at Board Game Arena (BGA). Players create/join bets, lock them once everyone
// confirms, and have the result resolved by 4 independent oracle nodes that
// need 3-of-4 consensus. Funds are held in escrow and distributed automatically.
contract BGAmble is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Custom Errors (cheaper than string reverts) ---
    error InvalidTokenAddress();
    error InvalidOracleAddress(uint8 index);
    error DuplicateOracleAddress();
    error NotOracle();
    error NotParticipant();
    error SlotCountTooLow();
    error SlotCountTooHigh();
    error BetAmountTooLow();
    error BetAmountTooHigh();
    error InvalidTableId();
    error BetNotOpen();
    error BetFull();
    error InvalidPlayerId();
    error AlreadyParticipant();
    error BetNotConfirming();
    error AlreadyConfirmed();
    error CannotLeaveBet();
    error BetNotLocked();
    error AlreadyVotedCancel();
    error AlreadyReported();
    error RefundTooEarly();
    error LimitMustBePositive();

    // The ERC-20 token used for all bets (USDC on Polygon).
    IERC20 public immutable token;

    // Fixed fee (USDC 0.50) deducted from the prize pool on every resolved bet
    // and paid to one oracle in round-robin fashion. Compensates oracles for
    // hosting and gas costs. No fee is charged on NoConsensus/Cancelled/Refunded.
    uint256 public constant ORACLE_FEE = 500_000; // USDC 0.50

    // Upper bound on the per-participant stake. Caps the financial incentive
    // for oracle corruption while still allowing relatively large bets.
    uint96 public constant MAX_BET_AMOUNT = 5_000_000_000; // USDC 5000.00

    // Auto-incrementing bet ID counter. Starts at 1 so that betId 0 is never used,
    // which lets us treat betId == 0 as "does not exist" in storage checks.
    uint32 public nextBetId = 1;

    // The 4 oracle addresses, set once at deploy time. These are the only
    // addresses allowed to call reportResult.
    address[4] public oracles;

    // Bet state machine:
    //
    //             Open          — accepting participants
    //              ↓↑
    //           Confirming      — full, waiting for all participants to confirm
    //              ↓
    //            Locked         — game in progress, waiting for oracle reports
    //        ↙     ↓       ↘       ↘
    // Cancelled NoConsensus Resolved Refunded
    //
    // The last four states are permanent/final — no further transitions.
    enum BetState {
        Open,         // Bet was created and is waiting for participants to fill all slots.
                      // Participants may join or leave freely.

        Confirming,   // All slots are filled. Every participant must now confirm they
                      // still want to proceed (after seeing the other players and their
                      // predictions). If anyone leaves, the bet goes back to Open and
                      // all confirmations are reset.

        Locked,       // All participants confirmed. The game is assumed to be in progress.
                      // Oracles may now report results; participants may vote to cancel
                      // or trigger a refund after 24 hours.

        Resolved,     // Final. 3 of 4 oracles agreed on the result. Winnings have been
                      // distributed and the oracle fee has been deducted from the pool.
                      // If nobody predicted the winner, the pool is split equally among
                      // all participants (minus the oracle fee).

        NoConsensus,  // Final. All 4 oracles reported but no 3 agreed on the same result.
                      // All stakes are refunded in full (no oracle fee is charged, since
                      // the oracle system did not function as intended).

        Cancelled,    // Final. All participants unanimously voted to cancel while the bet
                      // was locked. All stakes are refunded in full, no oracle fee.

        Refunded      // Final. The bet stayed Locked for more than 24 hours without being
                      // resolved, and a participant triggered a manual refund. All stakes
                      // are returned, no oracle fee.
    }

    struct Participant {
        address addr;              // wallet address
        uint64 predictedWinner;    // BGA player ID this participant is betting on
        bool confirmed;            // true once the participant confirmed in the Confirming phase
        bool cancelVote;           // true if this participant voted to cancel while Locked
    }

    struct Bet {
        uint32 betId;
        uint64 bgaTableId;         // numeric table ID on Board Game Arena
        uint8 slotCount;           // total participant slots (2–10)
        uint8 confirmCount;        // how many participants have confirmed so far
        uint8 cancelVoteCount;     // how many participants voted to cancel so far
        BetState state;
        uint96 amount;             // stake per participant (USDC with 6 decimals)
        uint32 lockedAt;           // block.timestamp when the bet became Locked

        Participant[] participants;
        uint64[] resolvedWinnerIds;                   // set when Resolved, empty otherwise
        mapping(address => bytes32) oracleResultHash; // each oracle's submitted result hash
        mapping(bytes32 => uint8) resultVotes;        // how many oracles submitted each hash
    }

    // Read-friendly copy of Bet without the mappings (for the view functions).
    struct BetSummary {
        uint32 betId;
        uint64 bgaTableId;
        uint8 slotCount;
        uint8 confirmCount;
        uint8 cancelVoteCount;
        BetState state;
        uint96 amount;
        uint32 lockedAt;
        Participant[] participants;
        uint64[] resolvedWinnerIds;
    }

    mapping(uint32 => Bet) public bets;

    // --- Events ---
    event BetCreated(uint32 indexed betId, uint64 indexed bgaTableId, uint32 timestamp, address indexed triggeredBy, uint96 amount, uint8 slotCount, uint64 predictedWinner);
    event BetJoined(uint32 indexed betId, uint32 timestamp, address indexed triggeredBy, uint64 predictedWinner);
    event BetConfirming(uint32 indexed betId, uint32 timestamp, address indexed triggeredBy);
    event BetLeft(uint32 indexed betId, uint32 timestamp, address indexed triggeredBy);
    event BetReopened(uint32 indexed betId, uint32 timestamp, address indexed triggeredBy);
    event BetConfirmed(uint32 indexed betId, uint32 timestamp, address indexed triggeredBy);
    event BetLocked(uint32 indexed betId, uint32 timestamp, address indexed triggeredBy);
    event BetResolved(uint32 indexed betId, uint32 timestamp, address indexed triggeredBy, uint64[] winners);
    event BetNoConsensus(uint32 indexed betId, uint32 timestamp, address indexed triggeredBy);
    event BetCancelVoted(uint32 indexed betId, uint32 timestamp, address indexed triggeredBy);
    event BetCancelled(uint32 indexed betId, uint32 timestamp, address indexed triggeredBy);
    event BetRefunded(uint32 indexed betId, uint32 timestamp, address indexed triggeredBy);
    event OracleReported(uint32 indexed betId, uint32 timestamp, address indexed triggeredBy, bytes32 resultHash, uint64[] winnerIds);

    // Initialises the contract with the USDC token address and exactly 4 unique
    // oracle addresses. These cannot be changed after deployment.
    constructor(IERC20 _token, address[4] memory _oracles) {
        if (address(_token) == address(0)) revert InvalidTokenAddress();
        if (_oracles[0] == address(0)) revert InvalidOracleAddress(1);
        if (_oracles[1] == address(0)) revert InvalidOracleAddress(2);
        if (_oracles[2] == address(0)) revert InvalidOracleAddress(3);
        if (_oracles[3] == address(0)) revert InvalidOracleAddress(4);
        if (
            _oracles[0] == _oracles[1] ||
            _oracles[0] == _oracles[2] ||
            _oracles[0] == _oracles[3] ||
            _oracles[1] == _oracles[2] ||
            _oracles[1] == _oracles[3] ||
            _oracles[2] == _oracles[3]
        ) revert DuplicateOracleAddress();

        token = _token;
        oracles = _oracles;
    }

    // --- Modifiers ---

    // Restricts a function to the 4 registered oracle addresses.
    modifier onlyOracle() {
        bool allowed = false;
        uint256 oracleCount = oracles.length;
        for (uint i = 0; i < oracleCount; i++) {
            if (msg.sender == oracles[i]) {
                allowed = true;
                break;
            }
        }
        if (!allowed) revert NotOracle();
        _;
    }

    // Restricts a function to addresses that are currently a participant in the given bet.
    modifier onlyParticipant(uint32 betId) {
        Bet storage b = bets[betId];
        bool allowed = false;
        uint256 participantCount = b.participants.length;
        for (uint i = 0; i < participantCount; i++) {
            if (b.participants[i].addr == msg.sender) {
                allowed = true;
                break;
            }
        }
        if (!allowed) revert NotParticipant();
        _;
    }

    // --- Participant Actions ---

    // Creates a new bet for a Board Game Arena table.
    // The caller specifies the BGA table ID, the per-participant stake (USDC 1–5000),
    // the number of participant slots (2–10), and their own predicted winner.
    // The creator is automatically joined as the first participant and their stake
    // is transferred to the contract. Returns the new bet ID.
    function create(
        uint64 bgaTableId,
        uint96 amount,
        uint8 slotCount,
        uint64 predictedWinner
    ) external nonReentrant returns (uint32) {
        if (slotCount < 2) revert SlotCountTooLow();
        if (slotCount > 10) revert SlotCountTooHigh();
        if (amount < 1_000_000) revert BetAmountTooLow();
        if (amount > MAX_BET_AMOUNT) revert BetAmountTooHigh();
        if (bgaTableId == 0) revert InvalidTableId();

        uint32 betId = nextBetId;
        nextBetId++;

        Bet storage b = bets[betId];

        b.betId = betId;
        b.bgaTableId = bgaTableId;
        b.slotCount = slotCount;
        b.amount = amount;
        b.state = BetState.Open;

        emit BetCreated(betId, bgaTableId, uint32(block.timestamp), msg.sender, amount, slotCount, predictedWinner);

        _join(betId, predictedWinner);

        return betId;
    }

    // Joins an existing bet that is still Open (has available slots).
    // The caller's stake (equal to the bet amount) is transferred to the contract.
    function join(uint32 betId, uint64 predictedWinner) external nonReentrant {
        _join(betId, predictedWinner);
    }

    // Internal implementation of join, also called by create() for the bet creator.
    // Validates the bet is Open and not full, ensures the caller isn't already in,
    // pushes a new Participant, transfers the stake, and automatically transitions
    // the bet to Confirming once all slots are filled.
    function _join(uint32 betId, uint64 predictedWinner) internal {
        Bet storage b = bets[betId];
        if (b.state != BetState.Open) revert BetNotOpen();
        if (b.participants.length >= b.slotCount) revert BetFull();
        if (predictedWinner == 0) revert InvalidPlayerId();

        uint256 participantCount = b.participants.length;
        for (uint i = 0; i < participantCount; i++) {
            if (b.participants[i].addr == msg.sender) revert AlreadyParticipant();
        }

        b.participants.push(Participant({
            addr: msg.sender,
            predictedWinner: predictedWinner,
            confirmed: false,
            cancelVote: false
        }));

        emit BetJoined(betId, uint32(block.timestamp), msg.sender, predictedWinner);

        // Finalize state transition before external call (checks-effects-interactions)
        if (b.participants.length == b.slotCount) {
            b.state = BetState.Confirming;
            emit BetConfirming(betId, uint32(block.timestamp), msg.sender);
        }

        token.safeTransferFrom(msg.sender, address(this), b.amount);
    }

    // Confirms participation in a bet that is in the Confirming state.
    // This step exists so participants can review who else joined and what they
    // predicted before committing. Once every participant has confirmed, the bet
    // transitions to Locked and the game can begin.
    function confirm(uint32 betId) external onlyParticipant(betId) {
        Bet storage b = bets[betId];
        if (b.state != BetState.Confirming) revert BetNotConfirming();

        uint256 participantCount = b.participants.length;
        for (uint i = 0; i < participantCount; i++) {
            Participant storage p = b.participants[i];
            if (p.addr == msg.sender) {
                if (p.confirmed) revert AlreadyConfirmed();
                p.confirmed = true;
                b.confirmCount++;
                break;
            }
        }

        emit BetConfirmed(betId, uint32(block.timestamp), msg.sender);

        if (b.confirmCount == b.participants.length) {
            b.state = BetState.Locked;
            b.lockedAt = uint32(block.timestamp);
            emit BetLocked(betId, uint32(block.timestamp), msg.sender);
        }
    }

    // Leaves a bet that is still Open or Confirming. The caller's stake is refunded.
    // If the bet was Confirming, it moves back to Open and all existing confirmations
    // are reset — everyone must re-confirm after the roster changes.
    function leave(uint32 betId) external onlyParticipant(betId) nonReentrant {
        Bet storage b = bets[betId];
        if (b.state != BetState.Open && b.state != BetState.Confirming) revert CannotLeaveBet();

        uint index;

        uint256 participantCount = b.participants.length;
        for (uint i = 0; i < participantCount; i++) {
            if (b.participants[i].addr == msg.sender) {
                index = i;
                break;
            }
        }

        // Swap and pop to remove the current participant
        b.participants[index] = b.participants[b.participants.length - 1];
        b.participants.pop();

        // Reset confirmations only if we were confirming
        if (b.state == BetState.Confirming) {
            b.confirmCount = 0;
            b.state = BetState.Open;

            participantCount = b.participants.length;
            for (uint i = 0; i < participantCount; i++) {
                b.participants[i].confirmed = false;
            }

            emit BetReopened(betId, uint32(block.timestamp), msg.sender);
        }

        emit BetLeft(betId, uint32(block.timestamp), msg.sender);

        token.safeTransfer(msg.sender, b.amount);
    }

    // Casts a vote to cancel a Locked bet. If ALL participants vote to cancel,
    // the bet transitions to Cancelled and every participant's stake is refunded
    // in full (no oracle fee). This exists as a safety valve for situations like
    // a game being abandoned or started by mistake.
    function voteCancel(uint32 betId) external onlyParticipant(betId) nonReentrant {
        Bet storage b = bets[betId];
        if (b.state != BetState.Locked) revert BetNotLocked();

        uint256 participantCount = b.participants.length;
        for (uint i = 0; i < participantCount; i++) {
            Participant storage p = b.participants[i];
            if (p.addr == msg.sender) {
                if (p.cancelVote) revert AlreadyVotedCancel();
                p.cancelVote = true;
                b.cancelVoteCount++;
                break;
            }
        }

        emit BetCancelVoted(betId, uint32(block.timestamp), msg.sender);

        if (b.cancelVoteCount == b.participants.length) {
            b.state = BetState.Cancelled;

            emit BetCancelled(betId, uint32(block.timestamp), msg.sender);

            for (uint i = 0; i < participantCount; i++) {
                token.safeTransfer(b.participants[i].addr, b.amount);
            }
        }
    }

    // --- Oracle Actions ---

    // Called by an oracle to report the result of a locked bet.
    // The oracle submits an array of BGA player IDs that won the game (sorted
    // ascending — order matters because consensus is based on keccak256 of the array).
    //
    // Each oracle may only report once per bet. When 3 oracles submit the same
    // hash, the bet is resolved immediately. If all 4 have reported without 3
    // agreeing, the bet enters NoConsensus and everyone is refunded.
    function reportResult(uint32 betId, uint64[] calldata winnerIds) external onlyOracle nonReentrant {
        Bet storage b = bets[betId];
        if (b.state != BetState.Locked) revert BetNotLocked();
        if (b.oracleResultHash[msg.sender] != bytes32(0)) revert AlreadyReported();

        bytes32 resultHash = keccak256(abi.encode(winnerIds));

        b.oracleResultHash[msg.sender] = resultHash;
        b.resultVotes[resultHash]++;

        emit OracleReported(betId, uint32(block.timestamp), msg.sender, resultHash, winnerIds);

        if (b.resultVotes[resultHash] >= 3) {
            resolve(betId, winnerIds);
        } else {
            // Check if all 4 oracles reported (which means no consensus was reached)
            uint reportedCount = 0;
            uint256 oracleCount = oracles.length;
            for (uint i = 0; i < oracleCount; i++) {
                if (b.oracleResultHash[oracles[i]] != bytes32(0)) {
                    reportedCount++;
                }
            }
            if (reportedCount == 4) {
                resolveNoConsensus(betId);
            }
        }
    }

    // Distributes the prize pool after 3 oracles reach consensus.
    //
    // 1. Calculates the total prize pool (amount × participant count).
    // 2. Sends the fixed oracle fee (USDC 0.50) to one oracle, chosen by
    //    round-robin (betId % 4) — deliberately not based on who reported,
    //    to avoid competition between oracles.
    // 3. Matches each participant's predicted winner against the reported winners.
    // 4. If nobody predicted correctly, everyone is treated as a winner (the pool
    //    minus the fee is split equally — nobody loses more than the fee).
    // 5. Distributes equal shares to winners; any dust from integer division goes
    //    to the last winner.
    function resolve(uint32 betId, uint64[] memory winnerIds) internal {
        Bet storage b = bets[betId];
        if (b.state != BetState.Locked) revert BetNotLocked();

        // Finalize all state changes before any external calls (checks-effects-interactions)
        b.state = BetState.Resolved;
        b.resolvedWinnerIds = winnerIds;

        uint256 prizePool = uint256(b.amount) * b.participants.length;
        uint256 payout = prizePool - ORACLE_FEE;

        // Determine winners
        uint winnerCount;
        bool[] memory winners = new bool[](b.participants.length);

        uint256 participantCount = b.participants.length;
        for (uint i = 0; i < participantCount; i++) {
            for (uint j = 0; j < winnerIds.length; j++) {
                if (b.participants[i].predictedWinner == winnerIds[j]) {
                    winners[i] = true;
                    winnerCount++;
                    break;
                }
            }
        }

        // If no winners, everyone is treated as a winner
        if (winnerCount == 0) {
            winnerCount = participantCount;
            for (uint i = 0; i < participantCount; i++) {
                winners[i] = true;
            }
        }

        emit BetResolved(betId, uint32(block.timestamp), msg.sender, winnerIds);

        // Pay oracle fee (round-robin by betId, not by who reported)
        uint256 oracleIndex = betId % oracles.length;
        token.safeTransfer(oracles[oracleIndex], ORACLE_FEE);

        uint256 share = payout / winnerCount;
        uint256 remainder = payout % winnerCount; // dust

        uint256 distributed = 0;

        for (uint i = 0; i < participantCount; i++) {
            if (winners[i]) {
                uint256 amount = share;
                // Give the remainder to the last winner
                if (distributed == winnerCount - 1) {
                    amount += remainder;
                }
                token.safeTransfer(b.participants[i].addr, amount);
                distributed++;
            }
        }
    }

    // Handles the case where all 4 oracles reported but no 3 agreed on the same
    // result. Since the oracle system failed to reach consensus, no fee is charged
    // and every participant is refunded their original stake in full.
    function resolveNoConsensus(uint32 betId) internal {
        Bet storage b = bets[betId];
        if (b.state != BetState.Locked) revert BetNotLocked();

        b.state = BetState.NoConsensus;

        emit BetNoConsensus(betId, uint32(block.timestamp), msg.sender);

        uint256 participantCount = b.participants.length;
        for (uint i = 0; i < participantCount; i++) {
            token.safeTransfer(b.participants[i].addr, b.amount);
        }
    }

    // Allows any participant to trigger a full refund if the bet has been Locked
    // for more than 24 hours without being resolved. This protects participants
    // against oracle downtime or a game that never finishes. No oracle fee is charged.
    function refund(uint32 betId) external onlyParticipant(betId) nonReentrant {
        Bet storage b = bets[betId];

        if (b.state != BetState.Locked) revert BetNotLocked();
        if (block.timestamp <= b.lockedAt + 1 days) revert RefundTooEarly();

        b.state = BetState.Refunded;

        emit BetRefunded(betId, uint32(block.timestamp), msg.sender);

        uint256 participantCount = b.participants.length;
        for (uint i = 0; i < participantCount; i++) {
            token.safeTransfer(b.participants[i].addr, b.amount);
        }
    }

    // --- View Functions ---

    // Returns all participants for a bet, including their address, predicted winner,
    // confirmation status, and cancel vote.
    function getParticipants(uint32 betId) external view returns (Participant[] memory) {
        return bets[betId].participants;
    }

    // Returns the result hash submitted by a specific oracle for a bet.
    // Returns bytes32(0) if the oracle has not yet reported.
    function getOracleResultHash(uint32 betId, address oracle) external view returns (bytes32) {
        return bets[betId].oracleResultHash[oracle];
    }

    // Returns how many oracles submitted a given result hash for a bet.
    function getResultVotes(uint32 betId, bytes32 resultHash) external view returns (uint8) {
        return bets[betId].resultVotes[resultHash];
    }

    // Returns the winner IDs stored when the bet was resolved.
    // Empty if the bet hasn't been resolved or ended via NoConsensus/Cancelled/Refunded.
    function getResolvedWinnerIds(uint32 betId) external view returns (uint64[] memory) {
        return bets[betId].resolvedWinnerIds;
    }

    // Returns a single bet's data as a BetSummary struct (everything except the
    // internal mappings which can't be returned from view functions).
    function getBetSummary(uint32 betId) public view returns (BetSummary memory) {
        Bet storage b = bets[betId];
        BetSummary memory s;
        s.betId = b.betId;
        s.bgaTableId = b.bgaTableId;
        s.slotCount = b.slotCount;
        s.confirmCount = b.confirmCount;
        s.cancelVoteCount = b.cancelVoteCount;
        s.state = b.state;
        s.amount = b.amount;
        s.lockedAt = b.lockedAt;
        s.participants = b.participants;
        s.resolvedWinnerIds = b.resolvedWinnerIds;
        return s;
    }

    // Returns a paginated list of bets matching a given state, ordered by bet ID.
    //
    // cursor = 0 means "start from the edge" (newest for desc, oldest for asc).
    // For subsequent pages, pass the last betId from the previous result as cursor.
    // An empty array means there are no more results.
    //
    // Uses two passes internally: one to count matches (up to limit), then one
    // to populate the result array — this avoids over-allocating memory.
    function getBetsByState(
        BetState state,
        uint32 cursor,
        uint8 limit,
        bool asc
    ) external view returns (BetSummary[] memory) {
        if (limit == 0) revert LimitMustBePositive();

        uint32 maxId = nextBetId - 1; // highest existing betId
        if (maxId == 0) return new BetSummary[](0);

        // Determine start position
        uint32 start;
        if (asc) {
            start = cursor == 0 ? 1 : cursor + 1;
            if (start > maxId) return new BetSummary[](0);
        } else {
            start = cursor == 0 ? maxId : (cursor <= 1 ? 0 : cursor - 1);
            if (start == 0) return new BetSummary[](0);
        }

        // Pass 1: count matches (up to limit)
        uint8 count = 0;
        {
            uint32 pos = start;
            while (count < limit) {
                if (bets[pos].state == state && bets[pos].betId != 0) {
                    count++;
                }
                // Advance
                if (asc) {
                    if (pos >= maxId) break;
                    pos++;
                } else {
                    if (pos <= 1) break;
                    pos--;
                }
            }
        }

        if (count == 0) return new BetSummary[](0);

        // Pass 2: populate array
        BetSummary[] memory results = new BetSummary[](count);
        uint8 idx = 0;
        {
            uint32 pos = start;
            while (idx < count) {
                if (bets[pos].state == state && bets[pos].betId != 0) {
                    results[idx] = getBetSummary(pos);
                    idx++;
                }
                if (asc) {
                    if (pos >= maxId) break;
                    pos++;
                } else {
                    if (pos <= 1) break;
                    pos--;
                }
            }
        }

        return results;
    }
}
