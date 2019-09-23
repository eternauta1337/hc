/* global artifacts */

const { getEventArgument } = require('@aragon/test-helpers/events')
const { hash } = require('eth-ens-namehash')
const { deployVoteToken } = require('./deployTokens.js')
const { deployDAO } = require('./deployDAO.js')

const HCVoting = artifacts.require('HCVoting.sol')

const BIG_ZERO = web3.toBigNumber(0)
const ANY_ADDRESS = '0xffffffffffffffffffffffffffffffffffffffff'

const VOTE = {
  ABSENT: 0,
  YEA: 1,
  NAY: 2
}

const defaultParams = {}

const paramsObjToArr = (paramsObj) => {
  return [
    paramsObj.voteToken.address
  ]
}

const deployAll = async (appManager) => {
  const { dao, acl } = await deployDAO(appManager)

  const voteToken = await deployVoteToken()

  const app = await deployApp(dao, acl, appManager)

  return { dao, acl, voteToken, app }
}

const deployAllAndInitializeApp = async (appManager, params) => {
  if (!params) {
    params = defaultParams
  }

  const deployed = await deployAll(appManager)

  params.voteToken = deployed.voteToken

  await initializeAppWithParams(deployed.app, params)

  return deployed
}

const initializeAppWithParams = async (app, params) => {
  await app.initialize(
    ...paramsObjToArr(params)
  )
}

const deployApp = async (dao, acl, appManager) => {
  // Deploy the app's base contract.
  const appBase = await HCVoting.new()

  // Instantiate a proxy for the app, using the base contract as its logic implementation.
  const instanceReceipt = await dao.newAppInstance(
    hash('hcvoting.aragonpm.test'), // appId - Unique identifier for each app installed in the DAO; can be any bytes32 string in the tests.
    appBase.address, // appBase - Location of the app's base implementation.
    '0x', // initializePayload - Used to instantiate and initialize the proxy in the same call (if given a non-empty bytes string).
    false, // setDefault - Whether the app proxy is the default proxy.
    { from: appManager }
  )
  const app = HCVoting.at(
    getEventArgument(instanceReceipt, 'NewAppProxy', 'proxy')
  )

  // Set up the app's permissions.
  // await acl.createPermission(
  //   ANY_ADDRESS, // entity (who?) - The entity or address that will have the permission.
  //   app.address, // app (where?) - The app that holds the role involved in this permission.
  //   await app.INCREMENT_ROLE(), // role (what?) - The particular role that the entity is being assigned to in this permission.
  //   appManager, // manager - Can grant/revoke further permissions for this role.
  //   { from: appManager }
  // )
  // await acl.createPermission(
  //   ANY_ADDRESS,
  //   app.address,
  //   await app.DECREMENT_ROLE(),
  //   appManager,
  //   { from: appManager }
  // )

  return app
}

module.exports = {
  defaultParams,
  initializeAppWithParams,
  deployApp,
  deployAll,
  deployAllAndInitializeApp,
  VOTE,
  BIG_ZERO
}
