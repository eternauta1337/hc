/* global artifacts contract before beforeEach it assert */
const { assertRevert } = require('@aragon/test-helpers/assertThrow');

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

      // Mint some vote tokens!
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
        // expect((await votingContract.numProposals()).toString()).to.equal(`${NUM_PROPOSALS}`);
    });

  });
})
