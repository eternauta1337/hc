/* global artifacts contract before beforeEach it assert */
const { assertRevert,  } = require('@aragon/test-helpers/assertThrow');
const timeUtil = require('../scripts/timeUtil.js');

const HolographicConsensus = artifacts.require('HolographicConsensus.sol');
const MiniMeToken = artifacts.require('@aragon/apps-shared-minime/contracts/MiniMeToken')
const DAOFactory = artifacts.require('@aragon/core/contracts/factory/DAOFactory');
const EVMScriptRegistryFactory = artifacts.require('@aragon/core/contracts/factory/EVMScriptRegistryFactory');
const ACL = artifacts.require('@aragon/core/contracts/acl/ACL');
const Kernel = artifacts.require('@aragon/core/contracts/kernel/Kernel');

const getContract = name => artifacts.require(name);

const ANY_ADDRESS = '0xffffffffffffffffffffffffffffffffffffffff';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

contract('HolographicConsensus', accounts => {

  let APP_MANAGER_ROLE;
  let CREATE_PROPOSALS_ROLE;

  let daoFact, appBase, app;
  let voteTokenContract;
  let stakeTokenContract;
  let txParams;
  let elapsedTime = 0;

  const firstAccount = accounts[0];
  const secondAccount = accounts[1];

  const HOURS = 60 * 60;
  const SUPPORT_PERCENT = 51; // MOD ROLE 1
  const QUEUE_PERIOD_SECS = 24 * HOURS; // MOD ROLE 2
  const PENDED_BOOST_PERIOD_SECS = 1 * HOURS; // MOD ROLE 2
  const BOOST_PERIOD_SECS = 6 * HOURS; // MOD ROLE 2
  const QUIET_ENDING_PERIOD_SECS = 1 * HOURS; // MOD ROLE 2
  const COMPENSATION_FEE_PERCENT = 10; // MOD ROLE 3
  const CONFIDENCE_THRESHOLD_BASE = 4; // MOD ROLE 4
  const PRECISION_MULTIPLIER = 10 ** 16;
  const INITIAL_VOTING_STAKE_TOKEN_BALANCE = 100000000000;

  before(async () => {

    txParams = {
      from: accounts[0],
      gas: 6700000,
      gasPrice: 1
    };

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
    stakeTokenContract = await MiniMeToken.new(ZERO_ADDRESS, ZERO_ADDRESS, 0, 'StakeToken', 18, 'GEN', false, { from: accounts[0] });

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

    // Setup permissions.
    await acl.createPermission(
      ANY_ADDRESS,
      app.address,
      CREATE_PROPOSALS_ROLE,
      firstAccount,
      { from: firstAccount }
    );
  });

  it('Tokens get deployed correctly', async () => {
      expect(web3.isAddress(voteTokenContract.address)).to.be.true;
      expect(web3.isAddress(stakeTokenContract.address)).to.be.true;
  });

  it('Voting gets deployed and set up correctly', async () => {
    expect(web3.isAddress(app.address)).to.equal(true);
    expect((await app.supportPct()).toString()).to.equal(`${SUPPORT_PERCENT}`);
    expect((await app.queuePeriod()).toString()).to.equal(`${QUEUE_PERIOD_SECS}`);
    expect((await app.pendedBoostPeriod()).toString()).to.equal(`${PENDED_BOOST_PERIOD_SECS}`);
    expect((await app.boostPeriod()).toString()).to.equal(`${BOOST_PERIOD_SECS}`);
    expect((await app.quietEndingPeriod()).toString()).to.equal(`${QUIET_ENDING_PERIOD_SECS}`);
    expect((await app.compensationFeePct()).toString()).to.equal(`${COMPENSATION_FEE_PERCENT}`);
  });

  describe('When creating proposals', () => {

    const proposalCreationReceipts = [];

    const NUM_PROPOSALS = 8;
    
    beforeEach(async () => {

      // Mint some tokens!
      await voteTokenContract.generateTokens(accounts[0], 1  , { ...txParams });
      await voteTokenContract.generateTokens(accounts[1], 1  , { ...txParams });
      await voteTokenContract.generateTokens(accounts[2], 1  , { ...txParams });
      await voteTokenContract.generateTokens(accounts[3], 10 , { ...txParams });
      await voteTokenContract.generateTokens(accounts[4], 10 , { ...txParams });
      await voteTokenContract.generateTokens(accounts[5], 10 , { ...txParams });
      await voteTokenContract.generateTokens(accounts[6], 100, { ...txParams });
      await voteTokenContract.generateTokens(accounts[7], 100, { ...txParams });
      await voteTokenContract.generateTokens(accounts[8], 100, { ...txParams });
      // Note: No tokens for account 9 =(
      // Note: Vote token total supply should be 333.

      // Also mint some stake tokens to the app so that it can pay fees and automatically downstake proposals.
      await stakeTokenContract.generateTokens(app.address, INITIAL_VOTING_STAKE_TOKEN_BALANCE, { ...txParams });

      // Create a few proposals.
      for(let i = 0; i < NUM_PROPOSALS; i++) {
        const receipt = await app.createProposal(
          ``,
          `DAOs should rule the world ${i}`,
          { ...txParams }
        );
        proposalCreationReceipts.push(receipt);
      }

      // Reset elapsed time since proposals will have startDate set to now.
      elapsedTime = 0;
    });

    it('numProposals should increase', async () => {
        expect((await app.numProposals()).toString()).to.equal(`${NUM_PROPOSALS}`);
    });

    it('Emit ProposalCreated events', async () => {
      const receipt = proposalCreationReceipts[2];
      const event = receipt.logs[0];
      expect(event).to.be.an('object');
      expect(event.args._proposalId.toString()).to.equal(`2`);
      expect(event.args._creator).to.equal(accounts[0]);
      expect(event.args._metadata.toString()).to.equal(`DAOs should rule the world 2`);
    });

    it('The proposal should be created with expected parameters', async () => {
      const proposalTimeInfo = await app.getProposalTimeInfo(2);
      const startDateDeltaSecs = ( new Date().getTime() / 1000 ) - parseInt(proposalTimeInfo[2].toString(), 10);
      expect(startDateDeltaSecs).to.be.below(2);
      expect(proposalTimeInfo[1].toString()).to.equal(`${QUEUE_PERIOD_SECS}`);
    });

    describe('When voting on proposals (that have no stake)', () => {
    
      it('Should reject voting on proposals that do not exist', async () => {
        await assertRevert(
          app.vote(9, true, { ...txParams })
        );
      });

      it('Should reject voting from accounts that do not own vote tokens', async () => {
        await assertRevert(
          app.vote(0, true, { ...txParams, from: accounts[9] })
        );
      });

      it('Should allow multiple votes on a proposal, tracking support and emitting events', async () => {

        // Cast some random votes.
        await app.vote(1, true, { ...txParams, from: accounts[0] });
        await app.vote(1, true, { ...txParams, from: accounts[3] });
        const receipt = await app.vote(1, false, { ...txParams, from: accounts[6] });
        
        // Verify that at least one VoteCasted event was emitted.
        const event = receipt.logs[0];
        expect(event).to.be.an('object');
        expect(event.args._proposalId.toString()).to.equal(`1`);
        expect(event.args._voter.toString()).to.equal(accounts[6]);
        expect(event.args._supports).to.equal(false);
        expect(event.args._stake.toString()).to.equal(`100`);
        
        // Retrieve the proposal and verify that the votes were recoreded.
        let proposalVotes = await app.getProposalVotes(1);
        expect(proposalVotes[0].toString()).to.equal(`11`);
        expect(proposalVotes[1].toString()).to.equal(`100`);

        // Verify that each voter's vote state is coherent with the vote.
        expect((await app.getVote(1, accounts[0])).toString()).to.equal(`1`);
        expect((await app.getVote(1, accounts[3])).toString()).to.equal(`1`);
        expect((await app.getVote(1, accounts[6])).toString()).to.equal(`2`);

        // Verify that someone that hasn't voted registers no vote.
        expect((await app.getVote(1, accounts[8])).toString()).to.equal(`0`);

        // Change some votes.
        await app.vote(1, false, { ...txParams, from: accounts[0] });
        await app.vote(1, true, { ...txParams, from: accounts[3] });
        await app.vote(1, false, { ...txParams, from: accounts[6] });

        // Retrieve the proposal and verify that the votes were recoreded.
        proposalVotes = await app.getProposalVotes(1);
        expect(proposalVotes[0].toString()).to.equal(`10`);
        expect(proposalVotes[1].toString()).to.equal(`101`);

        // Verify that each voter's vote state is coherent with the vote.
        expect((await app.getVote(1, accounts[0])).toString()).to.equal(`2`);
        expect((await app.getVote(1, accounts[3])).toString()).to.equal(`1`);
        expect((await app.getVote(1, accounts[6])).toString()).to.equal(`2`);
      });

      it('Should not resolve a proposal while it doesn\'t reach absolute majority', async () => {
          
        // Cast some random votes.
        await app.vote(3, false, { ...txParams, from: accounts[0] });
        await app.vote(3, false, { ...txParams, from: accounts[1] });
        await app.vote(3, false, { ...txParams, from: accounts[4] });
        await app.vote(3, true, { ...txParams, from: accounts[8] });

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
          // TODO: getting an undefined revert here - try commenting out parts of the function to see where it reverts
          await app.expireNonBoostedProposal(0,  {...txParams });
        });

        it.only('Voting should not be allowed', async () => {
          // await assertRevert(
            // app.vote(0, false, { ...txParams, from: accounts[0] }),
          // );
        });
        
      });
    });
  });
})
