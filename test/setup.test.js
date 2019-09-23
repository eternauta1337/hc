/* global contract beforeEach it assert */

const { assertRevert } = require('@aragon/test-helpers/assertThrow')
const { EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript')
const { defaultParams, deployAll, initializeAppWithParams, deployAllAndInitializeApp } = require('./helpers/deployApp')

contract('HCVoting (setup)', ([appManager]) => {
  let app, voteToken

  describe('when initializing the app with valid parameters', () => {
    before('deploy and initialize', async () => {
      ({ app, voteToken } = await deployAllAndInitializeApp(appManager))
    })

    it('has a vote token set', async () => {
      assert.equal(voteToken.address, await app.voteToken())
    })

    it('has requiredSupport set', async () => {
      assert.equal((await app.requiredSupport()).toNumber(), defaultParams.requiredSupport)
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
      ({ app, voteToken } = await deployAll(appManager))
    })

    it('reverts when using an invalid requiredSupport', async () => {
      await assertRevert(
        initializeAppWithParams(app, { voteToken, ...defaultParams,
          requiredSupport: 0
        }),
        'HCVOTING_BAD_REQUIRED_SUPPORT'
      )
      await assertRevert(
        initializeAppWithParams(app, { voteToken, ...defaultParams,
          requiredSupport: 1000001
        }),
        'HCVOTING_BAD_REQUIRED_SUPPORT'
      )
    })
  })
})
