/* global contract beforeEach it assert */

const { assertRevert } = require('@aragon/test-helpers/assertThrow')
const { encodeCallScript, EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript')
const { deployAllAndInitializeApp, deployApp } = require('./helpers/deployApp')
const { deployVoteToken, deployStakeToken } = require('./helpers/deployTokens')
const deployDAO = require('./helpers/deployDAO')

const REQUIRED_SUPPORT_PPM = 510000
const PROPOSAL_DURATION = 24 * 60 * 60

contract('HCVoting (setup)', ([appManager]) => {
  let app, voteToken, stakeToken

  describe('when initializing the app with valid parameters', () => {
    before('deploy app', async () => {
      ({ app } = await deployAllAndInitializeApp(
        appManager,
        REQUIRED_SUPPORT_PPM,
        PROPOSAL_DURATION
      ))
    })

    it('has a vote token set', async () => {
      assert.equal(web3.isAddress(await app.voteToken()), true)
    })

    it('has a stake token set', async () => {
      assert.equal(web3.isAddress(await app.stakeToken()), true)
    })

    it('has supportPPM set', async () => {
      assert.equal((await app.supportPPM()).toNumber(), REQUIRED_SUPPORT_PPM)
    })

    it('has proposalDuration set', async () => {
      assert.equal((await app.proposalDuration()).toNumber(), PROPOSAL_DURATION)
    })
  })

  describe('when initializing the app with invalid parameters', () => {
    let validParams

    const toParamsArray = (params) => [
      params.voteToken,
      params.stakeToken,
      params.supportPPM,
      params.proposalDuration
    ]

    before('deploy dao, tokens and app', async () => {
      const { dao, acl } = await deployDAO(appManager)
      voteToken = await deployVoteToken()
      stakeToken = await deployStakeToken()
      app = await deployApp(dao, acl, appManager)

      validParams = {
        voteToken: voteToken.address,
        stakeToken: stakeToken.address,
        supportPPM: REQUIRED_SUPPORT_PPM,
        proposalDuration: PROPOSAL_DURATION
      }
    })

    it('reverts when using an invalid support parameter', async () => {
      await assertRevert(
        app.initialize(...toParamsArray({
          ...validParams,
          supportPPM: 0
        })),
        'HCVOTING_INVALID_SUPPORT'
      )
    })

    it('reverts when using an invalid queue period parameter', async () => {
      await assertRevert(
        app.initialize(...toParamsArray({
          ...validParams,
          proposalDuration: 0
        })),
        'HCVOTING_INVALID_DURATION'
      )
    })
  })
})
