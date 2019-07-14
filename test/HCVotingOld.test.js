/* global artifacts contract before beforeEach it assert */
const { assertRevert } = require('@aragon/test-helpers/assertThrow');
const { encodeCallScript, EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript');
const timeUtil = require('../scripts/timeUtil.js');

const HolographicConsensus = artifacts.require('HCVoting.sol');
const MiniMeToken = artifacts.require('@aragon/apps-shared-minime/contracts/MiniMeToken')
const DAOFactory = artifacts.require('@aragon/core/contracts/factory/DAOFactory');
const EVMScriptRegistryFactory = artifacts.require('@aragon/core/contracts/factory/EVMScriptRegistryFactory');
const ACL = artifacts.require('@aragon/core/contracts/acl/ACL');
const Kernel = artifacts.require('@aragon/core/contracts/kernel/Kernel');

const getContract = name => artifacts.require(name);

const ANY_ADDRESS = '0xffffffffffffffffffffffffffffffffffffffff';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/*
 * TODO: Split this test file into multiple files!
 * It has become quite unreadable.
 * */

contract.skip('HCVoting (DEPRECATED)', accounts => {

  let APP_MANAGER_ROLE;
  let CREATE_PROPOSALS_ROLE;
  let MODIFY_SUPPORT_PERCENT_ROLE;
  let MODIFY_PERIODS_ROLE;
  let MODIFY_COMPENSATION_FEES_ROLE;
  let MODIFY_CONFIDENCE_THRESHOLD_ROLE;

  let daoFact, appBase, app;
  let voteTokenContract;
  let stakeTokenContract;
  let elapsedTime = 0;

  const firstAccount = accounts[0];
  const secondAccount = accounts[1];

  const HOURS = 60 * 60;
  const SUPPORT_PERCENT = 51;
  const QUEUE_PERIOD_SECS = 24 * HOURS;
  const PENDED_BOOST_PERIOD_SECS = 1 * HOURS;
  const BOOST_PERIOD_SECS = 6 * HOURS;
  const QUIET_ENDING_PERIOD_SECS = 1 * HOURS;
  const COMPENSATION_FEE_PERCENT = 10;
  const CONFIDENCE_THRESHOLD_BASE = 4;
  const PRECISION_MULTIPLIER = 10 ** 16;
  const INITIAL_VOTING_STAKE_TOKEN_BALANCE = 100000000000;

  before(async () => {
    const kernelBase = await getContract('Kernel').new(true); // petrify immediately
    const aclBase = await getContract('ACL').new();
    const regFact = await EVMScriptRegistryFactory.new();
    daoFact = await DAOFactory.new(
      kernelBase.address,
      aclBase.address,
      regFact.address
    );
    appBase = await HolographicConsensus.new();

    // Get roles.
    APP_MANAGER_ROLE = await kernelBase.APP_MANAGER_ROLE();
    CREATE_PROPOSALS_ROLE = await appBase.CREATE_PROPOSALS_ROLE();
    MODIFY_SUPPORT_PERCENT_ROLE = await appBase.MODIFY_SUPPORT_PERCENT_ROLE();
    MODIFY_PERIODS_ROLE = await appBase.MODIFY_PERIODS_ROLE();
    MODIFY_COMPENSATION_FEES_ROLE = await appBase.MODIFY_COMPENSATION_FEES_ROLE();
    MODIFY_CONFIDENCE_THRESHOLD_ROLE = await appBase.MODIFY_CONFIDENCE_THRESHOLD_ROLE();
  })

  beforeEach(async () => {
    const daoReceipt = await daoFact.newDAO(firstAccount);
    const dao = Kernel.at(
      daoReceipt.logs.filter(l => l.event === 'DeployDAO')[0].args.dao
    );
    const acl = ACL.at(await dao.acl());

    await acl.createPermission(
      firstAccount,
      dao.address,
      APP_MANAGER_ROLE,
      firstAccount,
      {
        from: firstAccount,
      }
    );

    const receipt = await dao.newAppInstance(
      '0x1234',
      appBase.address,
      '0x',
      false,
      { from: firstAccount }
    );

    // Retrieve proxy.
    app = HolographicConsensus.at(
      receipt.logs.filter(l => l.event === 'NewAppProxy')[0].args.proxy
    );

    // Initialize minime tokens.
    voteTokenContract = await MiniMeToken.new(ZERO_ADDRESS, ZERO_ADDRESS, 0, 'VoteToken', 18, 'ANT', false, { from: accounts[0] });
    stakeTokenContract = await MiniMeToken.new(ZERO_ADDRESS, ZERO_ADDRESS, 0, 'StakeToken', 18, 'GEN', true, { from: accounts[0] });
    
    // Initialize app proxy.
    await app.initialize(
      voteTokenContract.address, 
      stakeTokenContract.address, 
      SUPPORT_PERCENT,
      QUEUE_PERIOD_SECS,
      BOOST_PERIOD_SECS,
      QUIET_ENDING_PERIOD_SECS,
      PENDED_BOOST_PERIOD_SECS,
      COMPENSATION_FEE_PERCENT,
      CONFIDENCE_THRESHOLD_BASE,
      { from: accounts[0] }
    );

    // Mint some stake tokens to the app so that it can pay fees and automatically downstake proposals.
    await stakeTokenContract.generateTokens(app.address, INITIAL_VOTING_STAKE_TOKEN_BALANCE);

    // Setup permissions.
    await acl.createPermission(
      ANY_ADDRESS,
      app.address,
      CREATE_PROPOSALS_ROLE,
      firstAccount,
      { from: firstAccount }
    );
    await acl.createPermission(
      app.address,
      app.address,
      MODIFY_SUPPORT_PERCENT_ROLE,
      firstAccount,
      { from: firstAccount }
    );
  });

  // it('Tokens get deployed correctly', async () => {
  //   expect(web3.isAddress(voteTokenContract.address)).to.be.true;
  //   expect(web3.isAddress(stakeTokenContract.address)).to.be.true;
  // });

  // it('Voting gets deployed and set up correctly', async () => {
  //   expect(web3.isAddress(app.address)).to.equal(true);
  //   expect((await app.supportPct()).toString()).to.equal(`${SUPPORT_PERCENT}`);
  //   expect((await app.queuePeriod()).toString()).to.equal(`${QUEUE_PERIOD_SECS}`);
  //   expect((await app.pendedBoostPeriod()).toString()).to.equal(`${PENDED_BOOST_PERIOD_SECS}`);
  //   expect((await app.boostPeriod()).toString()).to.equal(`${BOOST_PERIOD_SECS}`);
  //   expect((await app.quietEndingPeriod()).toString()).to.equal(`${QUIET_ENDING_PERIOD_SECS}`);
  //   expect((await app.compensationFeePct()).toString()).to.equal(`${COMPENSATION_FEE_PERCENT}`);
  // });

  describe('When creating proposals', () => {

    // const proposalCreationReceipts = [];

    // const NUM_PROPOSALS = 8;

    beforeEach(async () => {

      // Mint some tokens!
      await voteTokenContract.generateTokens(accounts[0], 1  );
      await voteTokenContract.generateTokens(accounts[1], 1  );
      await voteTokenContract.generateTokens(accounts[2], 1  );
      await voteTokenContract.generateTokens(accounts[3], 10 );
      await voteTokenContract.generateTokens(accounts[4], 10 );
      await voteTokenContract.generateTokens(accounts[5], 10 );
      await voteTokenContract.generateTokens(accounts[6], 100);
      await voteTokenContract.generateTokens(accounts[7], 100);
      await voteTokenContract.generateTokens(accounts[8], 100);
      // Note: No tokens for account 9 =(
      // Note: Vote token total supply should be 333.

      // Create a few proposals.
      // for(let i = 0; i < NUM_PROPOSALS; i++) {
      //   const receipt = await app.createProposal(EMPTY_SCRIPT, `DAOs should rule the world ${i}`);
      //   proposalCreationReceipts.push(receipt);
      // }

      // Reset elapsed time since proposals will have startDate set to now.
      elapsedTime = 0;
    });

    // describe('When executing proposal scripts', () => {

    //   it('Should execute a proposal\'s script', async () => {
        
    //     // Create the proposal.
    //     const action = { to: app.address, calldata: app.contract.changeSupportPct.getData(60) }
    //     const script = encodeCallScript([action])
    //     const receipt = await app.createProposal(script, `Modify support percent`);
        
    //     // Support proposal so that it executes.
    //     await app.vote(NUM_PROPOSALS, true, { from: accounts[7] });
    //     await app.vote(NUM_PROPOSALS, true, { from: accounts[8] });

    //     // Retrieve new supportPercent value.
    //     const supportPct = await app.supportPct();
    //     expect(supportPct.toString()).to.equal(`60`);
    //   });

    //   it('Should not execute a proposal\'s script if it targets a blacklisted address', async () => {
        
    //     // Create the proposal.
    //     const action = { to: stakeTokenContract.address, calldata: stakeTokenContract.contract.transfer.getData(ANY_ADDRESS, 1000) }
    //     const script = encodeCallScript([action])
    //     const receipt = await app.createProposal(script, `Remove some stake from the voting app`);
        
    //     // Support proposal so that it executes.
    //     // Should fail because the auto-execution of the proposal is blacklisted for the stake token.
    //     await app.vote(NUM_PROPOSALS, true, { from: accounts[7] });
    //     await assertRevert(
    //       app.vote(NUM_PROPOSALS, true, { from: accounts[8] }),
    //       `EVMCALLS_BLACKLISTED_CALL`
    //     );
    //   });
    // });

    // it('numProposals should increase', async () => {
    //   expect((await app.numProposals()).toString()).to.equal(`${NUM_PROPOSALS}`);
    // });

    // it('Emit ProposalCreated events', async () => {
    //   const receipt = proposalCreationReceipts[2];
    //   const event = receipt.logs[0];
    //   expect(event).to.be.an('object');
    //   expect(event.args._proposalId.toString()).to.equal(`2`);
    //   expect(event.args._creator).to.equal(accounts[0]);
    //   expect(event.args._metadata.toString()).to.equal(`DAOs should rule the world 2`);
    // });

    // it('The proposal should be created with expected parameters', async () => {
    //   const proposalTimeInfo = await app.getProposalTimeInfo(2);
    //   const startDateDeltaSecs = ( new Date().getTime() / 1000 ) - parseInt(proposalTimeInfo[2].toString(), 10);
    //   expect(startDateDeltaSecs).to.be.below(2);
    //   expect(proposalTimeInfo[1].toString()).to.equal(`${QUEUE_PERIOD_SECS}`);
    // });

    describe('When voting on proposals (that have no stake)', () => {

      // it('Should reject voting on proposals that do not exist', async () => {
      //   await assertRevert(
      //     app.vote(9, true),
      //     `PROPOSAL_DOES_NOT_EXIST`
      //   );
      // });

      // it('Should reject voting from accounts that do not own vote tokens', async () => {
      //   await assertRevert(
      //     app.vote(0, true, { from: accounts[9] }),
					// `INSUFFICIENT_TOKENS`
      //   );
      // });

      // it('Should allow multiple votes on a proposal, tracking support and emitting events', async () => {

      //   // Cast some random votes.
      //   await app.vote(1, true, { from: accounts[0] });
      //   await app.vote(1, true, { from: accounts[3] });
      //   const receipt = await app.vote(1, false, { from: accounts[6] });

      //   // Verify that at least one VoteCasted event was emitted.
      //   const event = receipt.logs[0];
      //   expect(event).to.be.an('object');
      //   expect(event.args._proposalId.toString()).to.equal(`1`);
      //   expect(event.args._voter.toString()).to.equal(accounts[6]);
      //   expect(event.args._supports).to.equal(false);
      //   expect(event.args._stake.toString()).to.equal(`100`);

      //   // Retrieve the proposal and verify that the votes were recoreded.
      //   let proposalVotes = await app.getProposalVotes(1);
      //   expect(proposalVotes[0].toString()).to.equal(`11`);
      //   expect(proposalVotes[1].toString()).to.equal(`100`);

      //   // Verify that each voter's vote state is coherent with the vote.
      //   expect((await app.getVote(1, accounts[0])).toString()).to.equal(`1`);
      //   expect((await app.getVote(1, accounts[3])).toString()).to.equal(`1`);
      //   expect((await app.getVote(1, accounts[6])).toString()).to.equal(`2`);

      //   // Verify that someone that hasn't voted registers no vote.
      //   expect((await app.getVote(1, accounts[8])).toString()).to.equal(`0`);

      //   // Change some votes.
      //   await app.vote(1, false, { from: accounts[0] });
      //   await app.vote(1, true, { from: accounts[3] });
      //   await app.vote(1, false, { from: accounts[6] });

      //   // Retrieve the proposal and verify that the votes were recoreded.
      //   proposalVotes = await app.getProposalVotes(1);
      //   expect(proposalVotes[0].toString()).to.equal(`10`);
      //   expect(proposalVotes[1].toString()).to.equal(`101`);

      //   // Verify that each voter's vote state is coherent with the vote.
      //   expect((await app.getVote(1, accounts[0])).toString()).to.equal(`2`);
      //   expect((await app.getVote(1, accounts[3])).toString()).to.equal(`1`);
      //   expect((await app.getVote(1, accounts[6])).toString()).to.equal(`2`);
      // });

      it('Should not resolve a proposal while it doesn\'t reach absolute majority', async () => {

        // Cast some random votes.
        await app.vote(3, false, { from: accounts[0] });
        await app.vote(3, false, { from: accounts[1] });
        await app.vote(3, false, { from: accounts[4] });
        await app.vote(3, true, { from: accounts[8] });

        // Retrieve the proposal and verify that it has been resolved.
        const proposalInfo = await app.getProposalInfo(3);
        expect(proposalInfo[2].toString()).to.equal(`0`); // ProposalState '0' = Queued
      });

      describe('When proposals expire (directly from queue)', () => {

        beforeEach(async () => {

          // Advance time beyond queuePeriod.
          const time = QUEUE_PERIOD_SECS + 2 * HOURS;
          elapsedTime += time;
          await timeUtil.advanceTimeAndBlock(web3, time);

          // Call proposal expiration.
          await app.expireNonBoostedProposal(0);
        });

        it('Voting should not be allowed', async () => {
          await assertRevert(
            app.vote(0, false, { from: accounts[0] }),
						`PROPOSAL_IS_CLOSED`
          );
        });

        it('Staking should not be allowed', async () => {

          // Mint some stake tokens and give allowance.
          await stakeTokenContract.generateTokens(accounts[0], 1000);
          await stakeTokenContract.approve(app.address, 1000, { from: accounts[0] });

          // Staking should fail.
          await assertRevert(
            app.stake(0, 1, false, { from: accounts[0] }),
            `PROPOSAL_IS_CLOSED`
          );
        });

      }); // When proposals expire (directly from queue)

      describe('When absolute majority support is reached in a proposal (directly from queue)', () => {

        let lastVoteReceipt;

        beforeEach(async () => {

          // Cast enough votes to achieve absolute support.
          await app.vote(0, false, { from: accounts[0] });
          await app.vote(0, false, { from: accounts[1] });
          await app.vote(0, false, { from: accounts[4] });
          await app.vote(0, true, { from: accounts[7] });
          lastVoteReceipt = await app.vote(0, true, { from: accounts[8] });
        });

        it('A ProposalStateChanged event with the Resolved state should be emitted', async () => {

          // Check that a ProposalStateChanged event was emitted.
          const event = lastVoteReceipt.logs[1];
          expect(event).to.be.an('object');
          expect(event.args._proposalId.toString()).to.equal(`0`);
          expect(event.args._newState.toString()).to.equal(`4`); // ProposalState '4' = Resolved
        });

        it('The retrieved proposal\'s state should be Resolved', async () => {

          // Retrieve the proposal and verify that it has been resolved.
          const proposal = await app.getProposalInfo(0);
          expect(proposal[2].toString()).to.equal(`4`); // ProposalState '4' = Resolved
        });

        it('Should not allow additional votes on a resolved proposal', async () => {
          await assertRevert(
            app.vote(0, false, { from: accounts[0] }),
						`PROPOSAL_IS_CLOSED`
          );
        });

        it('Should not allow staking on a resolved proposal', async () => {

          // Mint some stake tokens and give allowance.
          await stakeTokenContract.generateTokens(accounts[0], 1000);
          await stakeTokenContract.approve(app.address, 1000 , { from: accounts[0] });

          // Staking should fail.
          await assertRevert(
            app.stake(0, 1, false, { from: accounts[0] }),
						`PROPOSAL_IS_CLOSED`
          );
        });

      }); // When absolute majority support is reached in a proposal

      describe('When staking on proposals', () => { 
        
        beforeEach(async () => {

          // Mint some stake tokens.
          await stakeTokenContract.generateTokens(accounts[0], 1000  );
          await stakeTokenContract.generateTokens(accounts[1], 1000  );
          await stakeTokenContract.generateTokens(accounts[2], 1000  );
          await stakeTokenContract.generateTokens(accounts[3], 10000 );
          await stakeTokenContract.generateTokens(accounts[4], 10000 );
          await stakeTokenContract.generateTokens(accounts[5], 10000 );
          await stakeTokenContract.generateTokens(accounts[6], 100000);
          await stakeTokenContract.generateTokens(accounts[7], 100000);
          await stakeTokenContract.generateTokens(accounts[8], 100000);
          // Note: No tokens for account 9 =(
          // Note: Stake token total supply should be 333000.

          // All stakers give 'infinite' allowance to the contract.
          // Note: In practice, a staker will need to either atomically provide allowance
          // to the voting contract, or provide it by chunks that would support staking for some time.
          const infiniteAllowance = `${10 ** 18}`;
          for(let i = 0; i < 8; i++) {
            await stakeTokenContract.approve(app.address, infiniteAllowance, { from: accounts[i] });
          }
          // Note: No allowance set for account 8 =(
        });

        // it('Should reject staking on proposals that do not exist', async () => {
        //   await assertRevert(
        //     app.stake(1338, 1000, true),
						// `PROPOSAL_DOES_NOT_EXIST`
        //   );
        // });

        // it('Should not allow an account to stake more tokens that it holds', async () => {
        //   await assertRevert(
        //     app.stake(0, 10000, true),
						// `INSUFFICIENT_TOKENS`
        //   );
        // });

        it('Should not allow an account to stake without having provided sufficient allowance', async () => {
          await assertRevert(
            app.stake(0, 1000, true, { from: accounts[8] }),
            `INSUFFICIENT_ALLOWANCE`
          );
        });

        it('Should not allow an account to withdraw tokens from a proposal that has no stake', async () => {
          await assertRevert(
            app.unstake(0, 10000, true),
            `SENDER_DOES_NOT_HAVE_REQUIRED_STAKE`
          );
        });

        it('Should not allow an account to withdraw tokens that were not staked by the account', async () => {
          await app.stake(0, 1000, true);
          await assertRevert(
            app.unstake(0, 1000, true, { from: accounts[1] }),
            `SENDER_DOES_NOT_HAVE_REQUIRED_STAKE`
          );
        });

        it('Can retrieve a proposals confidence factor', async () => {
          await app.stake(0, 10000, true, { from: accounts[3] });
          await app.stake(0, 5000, false, { from: accounts[4] });
          expect((await app.getConfidence(0)).toString()).to.equal(`${2 * PRECISION_MULTIPLIER}`);
        });

        it('Should allow staking and unstaking on proposals', async () => {

          // Stake tokens.
          const upstakeReceipt = await app.stake(0, 10000, true, { from: accounts[6] });
          const downstakeReceipt = await app.stake(0, 5000, false, { from: accounts[6] });

          // Verify that the proper events were triggered.
          let event = upstakeReceipt.logs[0];
          expect(event).to.be.an('object');
          expect(event.args._proposalId.toString()).to.equal(`0`);
          expect(event.args._staker.toString()).to.equal(accounts[6]);
          expect(event.args._amount.toString()).to.equal(`10000`);
          event = downstakeReceipt.logs[0];
          expect(event).to.be.an('object');
          expect(event.args._proposalId.toString()).to.equal(`0`);
          expect(event.args._staker.toString()).to.equal(accounts[6]);
          expect(event.args._amount.toString()).to.equal(`5000`);

          // Stake some more.
          await app.stake(0, 5000, true, { from: accounts[6] });
          await app.stake(0, 5000, false, { from: accounts[6] });

          // Verify that the proposal received the stake.
          const proposal = await app.getProposalStakes(0);
          expect(proposal[0].toString()).to.equal(`15000`);
          expect(proposal[1].toString()).to.equal(`10000`);

          // Verify that the proposal registers the sender's stake.
          let upstake = await app.getUpstake(0, accounts[6]);
          expect(upstake.toString()).to.equal(`15000`);
          let downstake = await app.getDownstake(0, accounts[6]);
          expect(downstake.toString()).to.equal(`10000`);

          // Verify that the owner's stake token balance decreased.
          let stakerBalance = await stakeTokenContract.balanceOf(accounts[6]);
          expect(stakerBalance.toString()).to.equal(`75000`);

          // Verify that the voting contract now holds the staked tokens.
          let votingBalance = await stakeTokenContract.balanceOf(app.address);
          expect(votingBalance.toString()).to.equal(`${INITIAL_VOTING_STAKE_TOKEN_BALANCE + 25000}`);

          // Retrieve stake.
          const unUpstakeReceipt = await app.unstake(0, 10000, true, { from: accounts[6] });
          const unDownstakeReceipt = await app.unstake(0, 5000, false, { from: accounts[6] });

          // Verify that the proper events were triggered.
          event = unUpstakeReceipt.logs[0];
          expect(event).to.be.an('object');
          expect(event.args._proposalId.toString()).to.equal(`0`);
          expect(event.args._staker.toString()).to.equal(accounts[6]);
          expect(event.args._amount.toString()).to.equal(`10000`);
          event = unDownstakeReceipt.logs[0];
          expect(event).to.be.an('object');
          expect(event.args._proposalId.toString()).to.equal(`0`);
          expect(event.args._staker.toString()).to.equal(accounts[6]);
          expect(event.args._amount.toString()).to.equal(`5000`);

          // Verify that the proposal registers the new sender's stake.
          upstake = await app.getUpstake(0, accounts[6]);
          expect(upstake.toString()).to.equal(`5000`);
          downstake = await app.getDownstake(0, accounts[6]);
          expect(downstake.toString()).to.equal(`5000`);

          // Verify that the staker retrieved the tokens.
          stakerBalance = await stakeTokenContract.balanceOf(accounts[6]);
          expect(stakerBalance.toString()).to.equal(`90000`);

          // Verify that the voting contract lost the tokens payed out to the staker.
          votingBalance = await stakeTokenContract.balanceOf(app.address);
          expect(votingBalance.toString()).to.equal(`${INITIAL_VOTING_STAKE_TOKEN_BALANCE + 10000}`);
        });

        it.skip('External callers should not be able to boost a proposal that hasn\'t gained enough confidence');

        describe('When queued proposals\' lifetime ends without boosting nor resolution', () => {

          beforeEach(async () => {

            // Advance enough time for a proposal to be expired.
            const time = QUEUE_PERIOD_SECS + 2 * HOURS;
            elapsedTime += time;
            await timeUtil.advanceTimeAndBlock(web3, time);
          });

          it('External callers should be able to expire a proposal with stake and receive a compensation fee', async () => {

            // Add some stake to the proposal so that fee's can be obtained by external callers.
            await app.stake(0, 10000, true, { from: accounts[3] });
            await app.stake(0, 5000, false, { from: accounts[4] });

            // Record the caller's current stake token balance
            // to later verify that it has received a compensation fee for the call.
            const balance = (await stakeTokenContract.balanceOf(accounts[0])).toString();

            // Call the expiration function.
            const receipt = await app.expireNonBoostedProposal(0);

            // Verify that a proposal state change event was triggered.
            const event = receipt.logs[0];
            expect(event).to.be.an('object');
            expect(event.args._proposalId.toString()).to.equal(`0`);
            expect(event.args._newState.toString()).to.equal(`5`); // ProposalState '5' = Expired

            // Get the proposal and verify its new state.
            const proposal = await app.getProposalInfo(0);
            expect(proposal[2].toString()).to.equal(`5`);

            // Verify that the caller received a compensation fee.
            const newBalance = (await stakeTokenContract.balanceOf(accounts[0])).toString();
            expect(parseInt(newBalance, 10)).to.be.above(parseInt(balance, 10));
          });

          it('Stakers should be able to withdraw their stake from an expired proposal', async () => {

            // Add some stake to the proposal so that fee's can be obtained by external callers.
            await app.stake(0, 10000, true, { from: accounts[3] });
            await app.stake(0, 5000, false, { from: accounts[4] });

            // Call the expiration function.
            const receipt = await app.expireNonBoostedProposal(0);

            // Verify that a proposal state change event was triggered.
            const event = receipt.logs[0];
            expect(event).to.be.an('object');
            expect(event.args._proposalId.toString()).to.equal(`0`);
            expect(event.args._newState.toString()).to.equal(`5`); // ProposalState '5' = Expired

            // Get the proposal and verify its new state.
            const proposal = await app.getProposalInfo(0);
            expect(proposal[2].toString()).to.equal(`5`);

            // Have the stakers withdraw their stake.
            app.withdrawStakeFromExpiredQueuedProposal(0, { from: accounts[3] });
            app.withdrawStakeFromExpiredQueuedProposal(0, { from: accounts[4] });

            // Verify that the stakers retrieved their stake.
            expect((await stakeTokenContract.balanceOf(accounts[3])).toString()).to.equal(`10000`);
            expect((await stakeTokenContract.balanceOf(accounts[4])).toString()).to.equal(`10000`);
          });
        });

        describe('When proposals have enough confidence', () => {

          beforeEach(async () => {

            // Stake enough to reach the confidence factor.
            await app.stake(0, 20000, true, { from: accounts[6] });
            await app.stake(0, 20000, true, { from: accounts[7] });
            await app.stake(0, 5000, false, { from: accounts[4] });
            await app.stake(0, 5000, false, { from: accounts[5] });
          });

          it('Their state should be set to Pended', async () => {

            // Verify confidence.
            const confidence = await app.getConfidence(0);
            expect(confidence.toString()).to.equal(`${4 * PRECISION_MULTIPLIER}`);

            // Retrieve the proposal and verify it's state.
            const proposalInfo = await app.getProposalInfo(0);
            expect(proposalInfo[2].toString()).to.equal(`2`); // ProposalState '2' = Pended
            const proposalTimeInfo = await app.getProposalTimeInfo(0);
            const pendedDateDeltaSecs = ( new Date().getTime() / 1000 ) - parseInt(proposalTimeInfo[3].toString(), 10);
            expect(pendedDateDeltaSecs).to.be.below(2);
          }); 

          it('Their state should change to Unpended if confidence drops', async () => {

            // Downstake the proposal a bit to reduce confidence beneath the threshold.
            await app.stake(0, 10000, false, { from: accounts[7] });

            // Verify that confidence dropped.
            const confidence = await app.getConfidence(0);
            expect(confidence.toString()).to.equal(`${2 * PRECISION_MULTIPLIER}`);

            // Retrieve the proposal and verify it's state.
            const proposal = await app.getProposalInfo(0);
            expect(proposal[2].toString()).to.equal(`1`); // ProposalState '1' = Unpended
          }); 

          it.skip('External callers should not be able to boost a proposal that hasn\'t been pended for enough time');

          describe('When proposals have had enough confidence for a while', () => {

            beforeEach(async () => {

              // Advance enough time for a proposal to be boosted.
              // Note that a little extra time is advanced, that's because compensation fees
              // are proportional to that extra time, and having no extra time would result in fees of value 0.
              const time = PENDED_BOOST_PERIOD_SECS + 2 * HOURS;
              elapsedTime += time;
              await timeUtil.advanceTimeAndBlock(web3, time);
            });

            it('An external caller should be able to boost the proposal and receive a compensation fee', async () => {

              // Record the caller's current stake token balance
              // to later verify that it has received a compensation fee for the call.
              const balance = (await stakeTokenContract.balanceOf(accounts[0])).toString();

              // Boost the proposal.
              await app.boostProposal(0);

              // Verify the proposal's state.
              const proposalInfo = await app.getProposalInfo(0);
              expect(proposalInfo[2].toString()).to.equal(`3`); // ProposalState '3' = Boosted

              // Verify that the proposal's lifetime has changed to boostPeriod.
              const proposalTimeInfo = await app.getProposalTimeInfo(0);
              expect(proposalTimeInfo[1].toString()).to.equal(`${BOOST_PERIOD_SECS}`);

              // Verify that the coller received a compensation fee.
              const newBalance = (await stakeTokenContract.balanceOf(accounts[0])).toString();
              expect(parseInt(newBalance, 10)).to.be.above(parseInt(balance, 10));
            });

            it.skip('An external caller shouldn\'t be able to boost a proposal once it has already been boosted');

            describe('When proposals are boosted', () => {

              beforeEach(async () => {

                // Produce some votes without reaching absolute majority.
                await app.vote(0, true, { from: accounts[3] });
                await app.vote(0, true, { from: accounts[4] });
                await app.vote(0, false, { from: accounts[5] });

                // Boost the pended proposals.
                await app.boostProposal(0);
              });

              describe('In the quiet ending zone of the boost period', () => {

                beforeEach(async () => {

                  // Advance enough time for a proposal to be boosted.
                  const time = BOOST_PERIOD_SECS - elapsedTime - QUIET_ENDING_PERIOD_SECS * 0.5;
                  elapsedTime += time;
                  await timeUtil.advanceTimeAndBlock(web3, time);
                });

                it('A decision flip near the end of the proposal should extend its boosted lifetime', async () => {

                  // Produce a decision flip in proposal 0.
                  const voteReceipt = await app.vote(0, false, { from: accounts[3] });

                  // Verify that an event was triggered.
                  const event = voteReceipt.logs[1];
                  expect(event).to.be.an('object');
                  expect(event.args._proposalId.toString()).to.equal(`0`);
                  expect(event.args._newLifetime.toString()).to.equal(`${BOOST_PERIOD_SECS + QUIET_ENDING_PERIOD_SECS}`);

                  // Retrieve the proposal and verify that its lifetime has been extended.
                  const proposal = await app.getProposalTimeInfo(0);
                  expect(proposal[1].toString()).to.equal(`${BOOST_PERIOD_SECS + QUIET_ENDING_PERIOD_SECS}`);
                });

                describe('When the boost period has elapsed', () => {

                  beforeEach(async () => {

                    // Advance enough time for a proposal to be boosted.
                    // Note that a little extra time is advanced, that's because compensation fees
                    // are proportional to that extra time, and having no extra time would result in fees of value 0.
                    const time = BOOST_PERIOD_SECS - elapsedTime + 2 * HOURS;
                    elapsedTime += time;
                    await timeUtil.advanceTimeAndBlock(web3, time);
                  });

                  it('Proposals should be resolvable by relative consensus', async () => {

                    // Record the caller's current stake token balance
                    // to later verify that it has received a compensation fee for the call.
                    const balance = (await stakeTokenContract.balanceOf(accounts[0])).toString();
 
                    // Have an external caller resolve the boosted proposal.
                    const receipt = await app.resolveBoostedProposal(0);

                    // Verify that a proposal state change event was emitted.
                    const event = receipt.logs[0];
                    expect(event).to.be.an('object');
                    expect(event.args._proposalId.toString()).to.equal(`0`);
                    expect(event.args._newState.toString()).to.equal(`4`); // ProposalState '4' = Resolved

                    // Verify that the state of the proposal was changed.
                    const proposal = await app.getProposalInfo(0);
                    expect(proposal[2].toString()).to.equal(`4`);

                    // Verify that the caller was compensated.
                    const newBalance = (await stakeTokenContract.balanceOf(accounts[0])).toString();
                    expect(parseInt(newBalance, 10)).to.be.above(parseInt(balance, 10));
                  });

                  // TODO: This same it should be performed on a non boosted proposal that was resolved with abs majority.
                  it('Winning stakers should be able to withdraw their reward on a proposal resolved by relative majority', async () => {

                    // Have an external caller resolve the boosted proposal.
                    await app.resolveBoostedProposal(0);

                    // Withdraw reward.
                    await app.withdrawRewardFromResolvedProposal(0, { from: accounts[6] });
                    await app.withdrawRewardFromResolvedProposal(0, { from: accounts[7] });

                    // Verify that the winning staker has recovered the stake + the reward.
                    expect((await stakeTokenContract.balanceOf(accounts[6])).toString()).to.equal(`105000`);
                    expect((await stakeTokenContract.balanceOf(accounts[7])).toString()).to.equal(`105000`);
                  });

                }); // When the boost period has elapsed
              }); // In the quiet ending zone of the boost period
            }); // When proposals are boosted
          }); // When proposals have had enough confidence for a while
        }); // When proposals have enough confidence
      }); // When staking on proposals
    }); // When voting on proposals
  }); // When creating proposals
}); // When setting up an HC contract correctly
// TODO
// describe('When setting up an HC contract incorrectly');
