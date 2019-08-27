/* global contract beforeEach it assert */

const { assertRevert } = require('@aragon/test-helpers/assertThrow')
const { defaultParams, deployAll, initializeAppWithParams, deployAllAndInitializeApp } = require('./helpers/deployApp')

contract('HCVoting (setup)', ([appManager]) => {
  let app, voteToken, stakeToken

  describe('when initializing the app with valid parameters', () => {
    before('deploy and initialize', async () => {
      ({ app, voteToken, stakeToken } = await deployAllAndInitializeApp(appManager))
    })

    it('has a vote token set', async () => {
      assert.equal(voteToken.address, await app.voteToken())
    })

    it('has a stake token set', async () => {
      assert.equal(stakeToken.address, await app.stakeToken())
    })

    it('has requiredSupport set', async () => {
      assert.equal((await app.requiredSupport()).toNumber(), defaultParams.requiredSupport)
    })

    it('has proposalDuration set', async () => {
      assert.equal((await app.proposalDuration()).toNumber(), defaultParams.proposalDuration)
    })

    it('has boostingDuration set', async () => {
      assert.equal((await app.boostingDuration()).toNumber(), defaultParams.boostingDuration)
    })

    it('has boostedDuration set', async () => {
      assert.equal((await app.boostedDuration()).toNumber(), defaultParams.boostedDuration)
    })
  })

  describe('when initializing the app with invalid parameters', () => {

    before('deploy', async () => {
      ({ app, voteToken, stakeToken } = await deployAll(appManager))
    })

    it('reverts when using an invalid requiredSupport', async () => {
      await assertRevert(
        initializeAppWithParams(app, { voteToken, stakeToken, ...defaultParams,
          requiredSupport: 0
        }),
        'HCVOTING_BAD_REQUIRED_SUPPORT'
      )
    })

    it('reverts when using an invalid proposal duration', async () => {
      await assertRevert(
        initializeAppWithParams(app, { voteToken, stakeToken, ...defaultParams,
          proposalDuration: 0
        }),
        'HCVOTING_BAD_PROPOSAL_DURATION'
      )
    })

    it('reverts when using an invalid boosting duration', async () => {
      await assertRevert(
        initializeAppWithParams(app, { voteToken, stakeToken, ...defaultParams,
          boostingDuration: 0
        }),
        'HCVOTING_BAD_BOOSTING_DURATION'
      )
    })

    it('reverts when using an invalid boosted duration', async () => {
      await assertRevert(
        initializeAppWithParams(app, { voteToken, stakeToken, ...defaultParams,
          boostedDuration: 0
        }),
        'HCVOTING_BAD_BOOSTED_DURATION'
      )
    })
  })
})
