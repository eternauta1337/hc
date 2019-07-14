const HCVoting = artifacts.require('HCVoting.sol');
const MiniMeToken = artifacts.require('@aragon/apps-shared-minime/contracts/MiniMeToken')
const DAOFactory = artifacts.require('@aragon/core/contracts/factory/DAOFactory');
const EVMScriptRegistryFactory = artifacts.require('@aragon/core/contracts/factory/EVMScriptRegistryFactory');
const ACL = artifacts.require('@aragon/core/contracts/acl/ACL');
const Kernel = artifacts.require('@aragon/core/contracts/kernel/Kernel');
const getContract = name => artifacts.require(name);

const HOURS = 60 * 60;

const common = {

  SUPPORT_PERCENT: 51,
  QUEUE_PERIOD_SECS: 24 * HOURS,
  PENDED_BOOST_PERIOD_SECS: 1 * HOURS,
  BOOST_PERIOD_SECS: 6 * HOURS,
  QUIET_ENDING_PERIOD_SECS: 1 * HOURS,
  COMPENSATION_FEE_PERCENT: 10,
  CONFIDENCE_THRESHOLD_BASE: 4,
  ANY_ADDRESS: '0xffffffffffffffffffffffffffffffffffffffff',
  ZERO_ADDRESS: '0x0000000000000000000000000000000000000000',
  PRECISION_MULTIPLIER: 10 ** 16,

  deployDAOFactory: async (test) => { 
    const kernelBase = await getContract('Kernel').new(true); // petrify immediately
    const aclBase = await getContract('ACL').new();
    const regFact = await EVMScriptRegistryFactory.new();
    test.daoFact = await DAOFactory.new(
      kernelBase.address,
      aclBase.address,
      regFact.address
    );
    test.APP_MANAGER_ROLE = await kernelBase.APP_MANAGER_ROLE();
  },

  deployDAO: async (test, daoManager) => {

    const daoReceipt = await test.daoFact.newDAO(daoManager);
    test.dao = Kernel.at(
      daoReceipt.logs.filter(l => l.event === 'DeployDAO')[0].args.dao
    );

    test.acl = ACL.at(await test.dao.acl());

    await test.acl.createPermission(
      daoManager,
      test.dao.address,
      test.APP_MANAGER_ROLE,
      daoManager,
      { from: daoManager }
    );
  },

  deployApp: async (test, appManager) => {

    const appBase = await HCVoting.new();
    test.CREATE_PROPOSALS_ROLE            = await appBase.CREATE_PROPOSALS_ROLE();
    test.MODIFY_SUPPORT_PERCENT_ROLE      = await appBase.MODIFY_SUPPORT_PERCENT_ROLE();
    test.MODIFY_PERIODS_ROLE              = await appBase.MODIFY_PERIODS_ROLE();
    test.MODIFY_COMPENSATION_FEES_ROLE    = await appBase.MODIFY_COMPENSATION_FEES_ROLE();
    test.MODIFY_CONFIDENCE_THRESHOLD_ROLE = await appBase.MODIFY_CONFIDENCE_THRESHOLD_ROLE();

    const daoInstanceReceipt = await test.dao.newAppInstance(
      '0x1234',
      appBase.address,
      '0x',
      false,
      { from: appManager }
    );

    const proxy = daoInstanceReceipt.logs.filter(l => l.event === 'NewAppProxy')[0].args.proxy;
    test.app = HCVoting.at(proxy);

    await test.acl.createPermission(
      common.ANY_ADDRESS,
      test.app.address,
      test.CREATE_PROPOSALS_ROLE,
      appManager,
      { from: appManager }
    );

    await test.acl.createPermission(
      test.app.address,
      test.app.address,
      test.MODIFY_SUPPORT_PERCENT_ROLE,
      appManager,
      { from: appManager }
    );
  },

  deployTokens: async (test) => {
    test.voteToken = await MiniMeToken.new(common.ZERO_ADDRESS, common.ZERO_ADDRESS, 0, 'VoteToken', 18, 'ANT', false);
    test.stakeToken = await MiniMeToken.new(common.ZERO_ADDRESS, common.ZERO_ADDRESS, 0, 'StakeToken', 18, 'GEN', true);
  },

  defaultSetup: async (test, managerAddress) => {
    await common.deployDAOFactory(test);
    await common.deployDAO(test, managerAddress);
    await common.deployApp(test, managerAddress);
    await common.deployTokens(test);
    await test.app.initialize(
      test.voteToken.address, 
      test.stakeToken.address, 
      common.SUPPORT_PERCENT,
      common.QUEUE_PERIOD_SECS,
      common.BOOST_PERIOD_SECS,
      common.QUIET_ENDING_PERIOD_SECS,
      common.PENDED_BOOST_PERIOD_SECS,
      common.COMPENSATION_FEE_PERCENT,
      common.CONFIDENCE_THRESHOLD_BASE
    );
  }
};

module.exports = common;
