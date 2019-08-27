/* global artifacts */

const { getEventArgument } = require('@aragon/test-helpers/events')
const { hash } = require('eth-ens-namehash')
const deployDAO = require('./deployDAO.js')
const { deployVoteToken, deployStakeToken } = require('./deployTokens.js')

const HCVoting = artifacts.require('HCVotingTimeMock.sol')

const ANY_ADDRESS = '0xffffffffffffffffffffffffffffffffffffffff'

const deployAllAndInitializeApp = async (appManager, supportPPM, proposalDuration, boostingDuration, boostedDuration) => {
  const { dao, acl } = await deployDAO(appManager)

  const voteToken = await deployVoteToken()
  const stakeToken = await deployStakeToken()

  const app = await deployApp(dao, acl, appManager)
  await app.initialize(
    voteToken.address,
    stakeToken.address,
    supportPPM,
    proposalDuration,
    boostingDuration,
    boostedDuration
  )

  return { dao, acl, voteToken, stakeToken, app }
}

const deployApp = async (dao, acl, appManager) => {
  // Deploy the app's base contract.
  const appBase = await HCVoting.new()

  // Instantiate a proxy for the app, using the base contract as its logic implementation.
  const instanceReceipt = await dao.newAppInstance(
    hash('counter.aragonpm.test'), // appId - Unique identifier for each app installed in the DAO; can be any bytes32 string in the tests.
    appBase.address, // appBase - Location of the app's base implementation.
    '0x', // initializePayload - Used to instantiate and initialize the proxy in the same call (if given a non-empty bytes string).
    false, // setDefault - Whether the app proxy is the default proxy.
    { from: appManager }
  )
  const app = HCVoting.at(
    getEventArgument(instanceReceipt, 'NewAppProxy', 'proxy')
  )

  // Set up the app's permissions.
  await acl.createPermission(
    ANY_ADDRESS, // entity (who?) - The entity or address that will have the permission.
    app.address, // app (where?) - The app that holds the role involved in this permission.
    await app.CREATE_PROPOSALS_ROLE(), // role (what?) - The particular role that the entity is being assigned to in this permission.
    appManager, // manager - Can grant/revoke further permissions for this role.
    { from: appManager }
  )
  await acl.createPermission(
    ANY_ADDRESS,
    app.address,
    await app.CHANGE_SUPPORT_ROLE(),
    appManager,
    { from: appManager }
  )

  return app
}

module.exports = {
  deployApp,
  deployAllAndInitializeApp
}
