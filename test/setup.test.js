/* global contract beforeEach it assert */

const { EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript')
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

    it('has queuePeriod set', async () => {
      assert.equal((await app.queuePeriod()).toNumber(), defaultParams.queuePeriod)
    })

    it('has pendedPeriod set', async () => {
      assert.equal((await app.pendedPeriod()).toNumber(), defaultParams.pendedPeriod)
    })

    it('has boostPeriod set', async () => {
      assert.equal((await app.boostPeriod()).toNumber(), defaultParams.boostPeriod)
    })

    it('has endingPeriod set', async () => {
      assert.equal((await app.endingPeriod()).toNumber(), defaultParams.endingPeriod)
    })

    it('reverts when attempting to re-initialize the app', async () => {
      await assertRevert(
        initializeAppWithParams(app, defaultParams),
        'INIT_ALREADY_INITIALIZED'
      )
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
      await assertRevert(
        initializeAppWithParams(app, { voteToken, stakeToken, ...defaultParams,
          requiredSupport: 1000001
        }),
        'HCVOTING_BAD_REQUIRED_SUPPORT'
      )
    })

    it('reverts when using an invalid queuePeriod', async () => {
      await assertRevert(
        initializeAppWithParams(app, { voteToken, stakeToken, ...defaultParams,
          queuePeriod: 0
        }),
        'HCVOTING_BAD_QUEUE_PERIOD'
      )
    })

    it('reverts when using an invalid pendedPeriod', async () => {
      await assertRevert(
        initializeAppWithParams(app, { voteToken, stakeToken, ...defaultParams,
          pendedPeriod: 0
        }),
        'HCVOTING_BAD_PENDED_PERIOD'
      )
    })

    it('reverts when using an invalid boostPeriod', async () => {
      await assertRevert(
        initializeAppWithParams(app, { voteToken, stakeToken, ...defaultParams,
          boostPeriod: 0
        }),
        'HCVOTING_BAD_BOOST_PERIOD'
      )
    })

    it('reverts when using an invalid endingPeriod', async () => {
      await assertRevert(
        initializeAppWithParams(app, { voteToken, stakeToken, ...defaultParams,
          endingPeriod: 0
        }),
        'HCVOTING_BAD_ENDING_PERIOD'
      )
      await assertRevert(
        initializeAppWithParams(app, { voteToken, stakeToken, ...defaultParams,
          endingPeriod: defaultParams.boostPeriod + 1
        }),
        'HCVOTING_BAD_ENDING_PERIOD'
      )
    })
  })

  describe('when attempting to interact with an uninitialized app', () => {
    before('deploy', async () => {
      ({ app } = await deployAll(appManager))
    })

    it('reverts when trying to create a proposal', async () => {
      await assertRevert(
        app.createProposal(EMPTY_SCRIPT, 'Proposal metadata'),
        'APP_AUTH_FAILED'
      )
    })
  })
})
