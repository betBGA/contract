import { describe, it } from "node:test";
import { expect } from "chai";
import { deployFixture, createOpenBetFixture, confirmingBetFixture, lockedBetFixture, lockedBet3PlayersFixture, TEN_POL, POL, ONE_DAY } from "./helpers.js";

describe("view functions", function () {
  // ── getParticipants ─────────────────────────────────────────────

  describe("getParticipants", function () {
    it("should return an empty array for a non-existent bet", async function () {
      const { bgamble } = await deployFixture();
      const participants = await bgamble.getParticipants(99);
      expect(participants.length).to.equal(0);
    });

    it("should return 1 participant after create", async function () {
      const { bgamble, alice, winner } = await createOpenBetFixture();
      const participants = await bgamble.getParticipants(1);
      expect(participants.length).to.equal(1);
      expect(participants[0].addr).to.equal(alice.address);
      expect(participants[0].predictedWinner).to.equal(winner);
      expect(participants[0].confirmed).to.equal(false);
      expect(participants[0].cancelVote).to.equal(false);
    });

    it("should return 2 participants after join", async function () {
      const { bgamble, alice, bob, ethers } = await createOpenBetFixture();
      const winnerB = 2;
      await bgamble.connect(bob).join(1, winnerB, { value: TEN_POL * POL });
      const participants = await bgamble.getParticipants(1);
      expect(participants.length).to.equal(2);
      expect(participants[0].addr).to.equal(alice.address);
      expect(participants[1].addr).to.equal(bob.address);
    });

    it("should reflect confirmation status", async function () {
      const { bgamble, alice, bob, ethers } = await createOpenBetFixture();
      const winnerB = 2;
      await bgamble.connect(bob).join(1, winnerB, { value: TEN_POL * POL });
      await bgamble.connect(alice).confirm(1);

      const participants = await bgamble.getParticipants(1);
      expect(participants[0].confirmed).to.equal(true);
      expect(participants[1].confirmed).to.equal(false);
    });

    it("should reflect cancel vote status", async function () {
      const { bgamble, alice, bob } = await lockedBetFixture();
      await bgamble.connect(alice).voteCancel(1);

      const participants = await bgamble.getParticipants(1);
      expect(participants[0].cancelVote).to.equal(true);
      expect(participants[1].cancelVote).to.equal(false);
    });

    it("should return correct array after a participant leaves", async function () {
      const { bgamble, alice, bob, ethers } = await deployFixture();
      await bgamble.connect(alice).create(1, TEN_POL, 3, 1, { value: TEN_POL * POL });
      await bgamble.connect(bob).join(1, 2, { value: TEN_POL * POL });
      await bgamble.connect(alice).leave(1);

      const participants = await bgamble.getParticipants(1);
      expect(participants.length).to.equal(1);
      expect(participants[0].addr).to.equal(bob.address);
    });
  });

  // ── getOracleResultHash ─────────────────────────────────────────

  describe("getOracleResultHash", function () {
    it("should return bytes32(0) before oracle reports", async function () {
      const { bgamble, oracle1, ethers } = await lockedBetFixture();
      const hash = await bgamble.getOracleResultHash(1, oracle1.address);
      expect(hash).to.equal(ethers.ZeroHash);
    });

    it("should return the correct hash after oracle reports", async function () {
      const { bgamble, oracle1, winnerA, ethers } = await lockedBetFixture();
      await bgamble.connect(oracle1).reportResult(1, [winnerA]);

      const expectedHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(["uint64[]"], [[winnerA]])
      );
      const hash = await bgamble.getOracleResultHash(1, oracle1.address);
      expect(hash).to.equal(expectedHash);
    });

    it("should return bytes32(0) for an oracle that has not reported", async function () {
      const { bgamble, oracle1, oracle2, winnerA, ethers } = await lockedBetFixture();
      await bgamble.connect(oracle1).reportResult(1, [winnerA]);

      const hash = await bgamble.getOracleResultHash(1, oracle2.address);
      expect(hash).to.equal(ethers.ZeroHash);
    });

    it("should return bytes32(0) for a non-existent bet", async function () {
      const { bgamble, oracle1, ethers } = await deployFixture();
      const hash = await bgamble.getOracleResultHash(99, oracle1.address);
      expect(hash).to.equal(ethers.ZeroHash);
    });

    it("should return different hashes for different results", async function () {
      const { bgamble, oracle1, oracle2, winnerA, winnerB } = await lockedBetFixture();
      await bgamble.connect(oracle1).reportResult(1, [winnerA]);
      await bgamble.connect(oracle2).reportResult(1, [winnerB]);

      const hash1 = await bgamble.getOracleResultHash(1, oracle1.address);
      const hash2 = await bgamble.getOracleResultHash(1, oracle2.address);
      expect(hash1).to.not.equal(hash2);
    });
  });

  // ── getResultVotes ──────────────────────────────────────────────

  describe("getResultVotes", function () {
    it("should return 0 for an unknown hash", async function () {
      const { bgamble, ethers } = await lockedBetFixture();
      const randomHash = ethers.keccak256(ethers.toUtf8Bytes("random"));
      expect(await bgamble.getResultVotes(1, randomHash)).to.equal(0);
    });

    it("should return 1 after one oracle reports", async function () {
      const { bgamble, oracle1, winnerA, ethers } = await lockedBetFixture();
      await bgamble.connect(oracle1).reportResult(1, [winnerA]);

      const resultHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(["uint64[]"], [[winnerA]])
      );
      expect(await bgamble.getResultVotes(1, resultHash)).to.equal(1);
    });

    it("should return 2 after two oracles report the same result", async function () {
      const { bgamble, oracle1, oracle2, winnerA, ethers } = await lockedBetFixture();
      await bgamble.connect(oracle1).reportResult(1, [winnerA]);
      await bgamble.connect(oracle2).reportResult(1, [winnerA]);

      const resultHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(["uint64[]"], [[winnerA]])
      );
      expect(await bgamble.getResultVotes(1, resultHash)).to.equal(2);
    });

    it("should return 3 after three oracles report the same result", async function () {
      const { bgamble, oracle1, oracle2, oracle3, winnerA, ethers } = await lockedBetFixture();
      await bgamble.connect(oracle1).reportResult(1, [winnerA]);
      await bgamble.connect(oracle2).reportResult(1, [winnerA]);
      await bgamble.connect(oracle3).reportResult(1, [winnerA]);

      const resultHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(["uint64[]"], [[winnerA]])
      );
      expect(await bgamble.getResultVotes(1, resultHash)).to.equal(3);
    });

    it("should track separate vote counts for different hashes", async function () {
      const { bgamble, oracle1, oracle2, winnerA, winnerB, ethers } = await lockedBetFixture();
      await bgamble.connect(oracle1).reportResult(1, [winnerA]);
      await bgamble.connect(oracle2).reportResult(1, [winnerB]);

      const hashA = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["uint64[]"], [[winnerA]]));
      const hashB = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["uint64[]"], [[winnerB]]));
      expect(await bgamble.getResultVotes(1, hashA)).to.equal(1);
      expect(await bgamble.getResultVotes(1, hashB)).to.equal(1);
    });

    it("should return 0 for a non-existent bet", async function () {
      const { bgamble, ethers } = await deployFixture();
      const randomHash = ethers.keccak256(ethers.toUtf8Bytes("x"));
      expect(await bgamble.getResultVotes(99, randomHash)).to.equal(0);
    });
  });

  // ── getResolvedWinnerIds ────────────────────────────────────────

  describe("getResolvedWinnerIds", function () {
    it("should return empty array before resolution", async function () {
      const { bgamble } = await lockedBetFixture();
      const resolved = await bgamble.getResolvedWinnerIds(1);
      expect(resolved.length).to.equal(0);
    });

    it("should return empty array for a non-existent bet", async function () {
      const { bgamble } = await deployFixture();
      const resolved = await bgamble.getResolvedWinnerIds(99);
      expect(resolved.length).to.equal(0);
    });

    it("should return correct single winner after resolution", async function () {
      const { bgamble, oracle1, oracle2, oracle3, winnerA } = await lockedBetFixture();
      await bgamble.connect(oracle1).reportResult(1, [winnerA]);
      await bgamble.connect(oracle2).reportResult(1, [winnerA]);
      await bgamble.connect(oracle3).reportResult(1, [winnerA]);

      const resolved = await bgamble.getResolvedWinnerIds(1);
      expect(resolved.length).to.equal(1);
      expect(resolved[0]).to.equal(winnerA);
    });

    it("should return correct multiple winners after resolution", async function () {
      const { bgamble, oracle1, oracle2, oracle3, winnerA, winnerB } = await lockedBet3PlayersFixture();
      await bgamble.connect(oracle1).reportResult(1, [winnerA, winnerB]);
      await bgamble.connect(oracle2).reportResult(1, [winnerA, winnerB]);
      await bgamble.connect(oracle3).reportResult(1, [winnerA, winnerB]);

      const resolved = await bgamble.getResolvedWinnerIds(1);
      expect(resolved.length).to.equal(2);
      expect(resolved[0]).to.equal(winnerA);
      expect(resolved[1]).to.equal(winnerB);
    });

    it("should return empty array after no-consensus refund", async function () {
      const { bgamble, oracle1, oracle2, oracle3, oracle4 } = await lockedBetFixture();
      await bgamble.connect(oracle1).reportResult(1, [101]);
      await bgamble.connect(oracle2).reportResult(1, [102]);
      await bgamble.connect(oracle3).reportResult(1, [103]);
      await bgamble.connect(oracle4).reportResult(1, [104]);

      const resolved = await bgamble.getResolvedWinnerIds(1);
      expect(resolved.length).to.equal(0);
    });

    it("should be included in getBetSummary after resolution", async function () {
      const { bgamble, oracle1, oracle2, oracle3, winnerA } = await lockedBetFixture();
      await bgamble.connect(oracle1).reportResult(1, [winnerA]);
      await bgamble.connect(oracle2).reportResult(1, [winnerA]);
      await bgamble.connect(oracle3).reportResult(1, [winnerA]);

      const summary = await bgamble.getBetSummary(1);
      expect(summary.resolvedWinnerIds.length).to.equal(1);
      expect(summary.resolvedWinnerIds[0]).to.equal(winnerA);
    });

    it("should be empty in getBetSummary before resolution", async function () {
      const { bgamble } = await lockedBetFixture();
      const summary = await bgamble.getBetSummary(1);
      expect(summary.resolvedWinnerIds.length).to.equal(0);
    });
  });

  // ── getBetSummary ───────────────────────────────────────────────

  describe("getBetSummary", function () {
    it("should return a zeroed struct for a non-existent bet", async function () {
      const { bgamble } = await deployFixture();
      const s = await bgamble.getBetSummary(99);
      expect(s.betId).to.equal(0);
      expect(s.bgaTableId).to.equal(0);
      expect(s.slotCount).to.equal(0);
      expect(s.amount).to.equal(0);
      expect(s.createdAtBlock).to.equal(0);
      expect(s.participants.length).to.equal(0);
    });

    it("should return correct data for an Open bet", async function () {
      const { bgamble, alice, winner } = await createOpenBetFixture();
      const s = await bgamble.getBetSummary(1);
      expect(s.betId).to.equal(1);
      expect(s.bgaTableId).to.equal(1);
      expect(s.slotCount).to.equal(2);
      expect(s.confirmCount).to.equal(0);
      expect(s.cancelVoteCount).to.equal(0);
      expect(s.state).to.equal(0); // Open
      expect(s.amount).to.equal(TEN_POL);
      expect(s.lockedAt).to.equal(0);
      expect(s.createdAtBlock).to.be.greaterThan(0);
      expect(s.participants.length).to.equal(1);
      expect(s.participants[0].addr).to.equal(alice.address);
      expect(s.participants[0].predictedWinner).to.equal(winner);
    });

    it("should return correct data for a Confirming bet", async function () {
      const { bgamble } = await confirmingBetFixture();
      const s = await bgamble.getBetSummary(1);
      expect(s.state).to.equal(1); // Confirming
      expect(s.participants.length).to.equal(2);
    });

    it("should return correct data for a Locked bet", async function () {
      const { bgamble } = await lockedBetFixture();
      const s = await bgamble.getBetSummary(1);
      expect(s.state).to.equal(2); // Locked
      expect(s.confirmCount).to.equal(2);
      expect(s.lockedAt).to.be.greaterThan(0);
    });
  });

  // ── getBetsByState ──────────────────────────────────────────────

  describe("getBetsByState", function () {
    it("should return empty array when no bets exist", async function () {
      const { bgamble } = await deployFixture();
      const results = await bgamble.getBetsByState(0, 0, 20, false);
      expect(results.length).to.equal(0);
    });

    it("should return empty array for a state with no matching bets", async function () {
      const { bgamble } = await createOpenBetFixture();
      const results = await bgamble.getBetsByState(2, 0, 20, false);
      expect(results.length).to.equal(0);
    });

    it("should return Open bets (descending)", async function () {
      const { bgamble, alice } = await deployFixture();
      const w = 1;
      await bgamble.connect(alice).create(1, TEN_POL, 3, w, { value: TEN_POL * POL });
      await bgamble.connect(alice).create(2, TEN_POL, 3, w, { value: TEN_POL * POL });
      await bgamble.connect(alice).create(3, TEN_POL, 3, w, { value: TEN_POL * POL });

      const results = await bgamble.getBetsByState(0, 0, 20, false);
      expect(results.length).to.equal(3);
      expect(results[0].betId).to.equal(3);
      expect(results[1].betId).to.equal(2);
      expect(results[2].betId).to.equal(1);
    });

    it("should return Open bets (ascending)", async function () {
      const { bgamble, alice } = await deployFixture();
      const w = 1;
      await bgamble.connect(alice).create(1, TEN_POL, 3, w, { value: TEN_POL * POL });
      await bgamble.connect(alice).create(2, TEN_POL, 3, w, { value: TEN_POL * POL });
      await bgamble.connect(alice).create(3, TEN_POL, 3, w, { value: TEN_POL * POL });

      const results = await bgamble.getBetsByState(0, 0, 20, true);
      expect(results.length).to.equal(3);
      expect(results[0].betId).to.equal(1);
      expect(results[1].betId).to.equal(2);
      expect(results[2].betId).to.equal(3);
    });

    it("should filter by state when bets have mixed states", async function () {
      const { bgamble, alice, bob } = await deployFixture();
      const wA = 1;
      const wB = 2;

      await bgamble.connect(alice).create(1, TEN_POL, 3, wA, { value: TEN_POL * POL });
      await bgamble.connect(alice).create(2, TEN_POL, 2, wA, { value: TEN_POL * POL });
      await bgamble.connect(bob).join(2, wB, { value: TEN_POL * POL });
      await bgamble.connect(alice).create(3, TEN_POL, 3, wA, { value: TEN_POL * POL });

      const openBets = await bgamble.getBetsByState(0, 0, 20, false);
      expect(openBets.length).to.equal(2);
      expect(openBets[0].betId).to.equal(3);
      expect(openBets[1].betId).to.equal(1);

      const confirmingBets = await bgamble.getBetsByState(1, 0, 20, false);
      expect(confirmingBets.length).to.equal(1);
      expect(confirmingBets[0].betId).to.equal(2);
    });

    it("should respect the limit parameter", async function () {
      const { bgamble, alice } = await deployFixture();
      const w = 1;
      await bgamble.connect(alice).create(1, TEN_POL, 3, w, { value: TEN_POL * POL });
      await bgamble.connect(alice).create(2, TEN_POL, 3, w, { value: TEN_POL * POL });
      await bgamble.connect(alice).create(3, TEN_POL, 3, w, { value: TEN_POL * POL });

      const results = await bgamble.getBetsByState(0, 0, 2, false);
      expect(results.length).to.equal(2);
      expect(results[0].betId).to.equal(3);
      expect(results[1].betId).to.equal(2);
    });

    it("should paginate with cursor (descending)", async function () {
      const { bgamble, alice } = await deployFixture();
      const w = 1;
      await bgamble.connect(alice).create(1, TEN_POL, 3, w, { value: TEN_POL * POL });
      await bgamble.connect(alice).create(2, TEN_POL, 3, w, { value: TEN_POL * POL });
      await bgamble.connect(alice).create(3, TEN_POL, 3, w, { value: TEN_POL * POL });
      await bgamble.connect(alice).create(4, TEN_POL, 3, w, { value: TEN_POL * POL });
      await bgamble.connect(alice).create(5, TEN_POL, 3, w, { value: TEN_POL * POL });

      const page1 = await bgamble.getBetsByState(0, 0, 2, false);
      expect(page1.length).to.equal(2);
      expect(page1[0].betId).to.equal(5);
      expect(page1[1].betId).to.equal(4);

      const page2 = await bgamble.getBetsByState(0, page1[1].betId, 2, false);
      expect(page2.length).to.equal(2);
      expect(page2[0].betId).to.equal(3);
      expect(page2[1].betId).to.equal(2);

      const page3 = await bgamble.getBetsByState(0, page2[1].betId, 2, false);
      expect(page3.length).to.equal(1);
      expect(page3[0].betId).to.equal(1);

      const page4 = await bgamble.getBetsByState(0, page3[0].betId, 2, false);
      expect(page4.length).to.equal(0);
    });

    it("should paginate with cursor (ascending)", async function () {
      const { bgamble, alice } = await deployFixture();
      const w = 1;
      await bgamble.connect(alice).create(1, TEN_POL, 3, w, { value: TEN_POL * POL });
      await bgamble.connect(alice).create(2, TEN_POL, 3, w, { value: TEN_POL * POL });
      await bgamble.connect(alice).create(3, TEN_POL, 3, w, { value: TEN_POL * POL });

      const page1 = await bgamble.getBetsByState(0, 0, 2, true);
      expect(page1.length).to.equal(2);
      expect(page1[0].betId).to.equal(1);
      expect(page1[1].betId).to.equal(2);

      const page2 = await bgamble.getBetsByState(0, page1[1].betId, 2, true);
      expect(page2.length).to.equal(1);
      expect(page2[0].betId).to.equal(3);

      const page3 = await bgamble.getBetsByState(0, page2[0].betId, 2, true);
      expect(page3.length).to.equal(0);
    });

    it("should skip non-matching bets during pagination", async function () {
      const { bgamble, alice, bob } = await deployFixture();
      const wA = 1;
      const wB = 2;

      await bgamble.connect(alice).create(1, TEN_POL, 3, wA, { value: TEN_POL * POL });
      await bgamble.connect(alice).create(2, TEN_POL, 2, wA, { value: TEN_POL * POL });
      await bgamble.connect(bob).join(2, wB, { value: TEN_POL * POL });
      await bgamble.connect(alice).create(3, TEN_POL, 3, wA, { value: TEN_POL * POL });
      await bgamble.connect(alice).create(4, TEN_POL, 3, wA, { value: TEN_POL * POL });

      const page1 = await bgamble.getBetsByState(0, 0, 2, false);
      expect(page1.length).to.equal(2);
      expect(page1[0].betId).to.equal(4);
      expect(page1[1].betId).to.equal(3);

      const page2 = await bgamble.getBetsByState(0, page1[1].betId, 2, false);
      expect(page2.length).to.equal(1);
      expect(page2[0].betId).to.equal(1);
    });

    it("should return Locked bets for the oracle", async function () {
      const { bgamble, alice, bob } = await deployFixture();
      const wA = 1;
      const wB = 2;

      await bgamble.connect(alice).create(1, TEN_POL, 2, wA, { value: TEN_POL * POL });
      await bgamble.connect(bob).join(1, wB, { value: TEN_POL * POL });
      await bgamble.connect(alice).confirm(1);
      await bgamble.connect(bob).confirm(1);

      await bgamble.connect(alice).create(2, TEN_POL, 3, wA, { value: TEN_POL * POL });

      const locked = await bgamble.getBetsByState(2, 0, 20, false);
      expect(locked.length).to.equal(1);
      expect(locked[0].betId).to.equal(1);
      expect(locked[0].state).to.equal(2);
      expect(locked[0].participants.length).to.equal(2);
    });

    it("should return Resolved bets", async function () {
      const { bgamble, oracle1, oracle2, oracle3, alice, bob } = await deployFixture();
      const wA = 1;
      const wB = 2;

      await bgamble.connect(alice).create(1, TEN_POL, 2, wA, { value: TEN_POL * POL });
      await bgamble.connect(bob).join(1, wB, { value: TEN_POL * POL });
      await bgamble.connect(alice).confirm(1);
      await bgamble.connect(bob).confirm(1);

      await bgamble.connect(oracle1).reportResult(1, [wA]);
      await bgamble.connect(oracle2).reportResult(1, [wA]);
      await bgamble.connect(oracle3).reportResult(1, [wA]);

      const resolved = await bgamble.getBetsByState(3, 0, 20, false);
      expect(resolved.length).to.equal(1);
      expect(resolved[0].betId).to.equal(1);
      expect(resolved[0].state).to.equal(3);
    });

    it("should return NoConsensus bets", async function () {
      const { bgamble, oracle1, oracle2, oracle3, oracle4, alice, bob } = await deployFixture();
      const wA = 1;
      const wB = 2;

      await bgamble.connect(alice).create(1, TEN_POL, 2, wA, { value: TEN_POL * POL });
      await bgamble.connect(bob).join(1, wB, { value: TEN_POL * POL });
      await bgamble.connect(alice).confirm(1);
      await bgamble.connect(bob).confirm(1);

      await bgamble.connect(oracle1).reportResult(1, [101]);
      await bgamble.connect(oracle2).reportResult(1, [102]);
      await bgamble.connect(oracle3).reportResult(1, [103]);
      await bgamble.connect(oracle4).reportResult(1, [104]);

      const noConsensus = await bgamble.getBetsByState(4, 0, 20, false);
      expect(noConsensus.length).to.equal(1);
      expect(noConsensus[0].betId).to.equal(1);
      expect(noConsensus[0].state).to.equal(4);
    });

    it("should return Cancelled bets", async function () {
      const { bgamble, alice, bob } = await deployFixture();
      const wA = 1;
      const wB = 2;

      await bgamble.connect(alice).create(1, TEN_POL, 2, wA, { value: TEN_POL * POL });
      await bgamble.connect(bob).join(1, wB, { value: TEN_POL * POL });
      await bgamble.connect(alice).confirm(1);
      await bgamble.connect(bob).confirm(1);
      await bgamble.connect(alice).voteCancel(1);
      await bgamble.connect(bob).voteCancel(1);

      const cancelled = await bgamble.getBetsByState(5, 0, 20, false);
      expect(cancelled.length).to.equal(1);
      expect(cancelled[0].betId).to.equal(1);
      expect(cancelled[0].state).to.equal(5);
    });

    it("should return Refunded bets", async function () {
      const { bgamble, alice, bob, networkHelpers } = await deployFixture();
      const wA = 1;
      const wB = 2;

      await bgamble.connect(alice).create(1, TEN_POL, 2, wA, { value: TEN_POL * POL });
      await bgamble.connect(bob).join(1, wB, { value: TEN_POL * POL });
      await bgamble.connect(alice).confirm(1);
      await bgamble.connect(bob).confirm(1);

      await networkHelpers.time.increase(ONE_DAY + 1);
      await bgamble.connect(alice).refund(1);

      const refunded = await bgamble.getBetsByState(6, 0, 20, false);
      expect(refunded.length).to.equal(1);
      expect(refunded[0].betId).to.equal(1);
      expect(refunded[0].state).to.equal(6);
    });

    it("should include participants in each returned summary", async function () {
      const { bgamble, alice, bob } = await deployFixture();
      const wA = 1;
      const wB = 2;

      await bgamble.connect(alice).create(1, TEN_POL, 2, wA, { value: TEN_POL * POL });
      await bgamble.connect(bob).join(1, wB, { value: TEN_POL * POL });

      const results = await bgamble.getBetsByState(1, 0, 20, false);
      expect(results.length).to.equal(1);
      expect(results[0].participants.length).to.equal(2);
      expect(results[0].participants[0].addr).to.equal(alice.address);
      expect(results[0].participants[1].addr).to.equal(bob.address);
    });

    it("should revert when limit is 0", async function () {
      const { bgamble } = await deployFixture();
      await expect(bgamble.getBetsByState(0, 0, 0, false)).to.be.revertedWithCustomError(bgamble, "LimitMustBePositive");
    });
  });
});
