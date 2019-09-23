/* global contract beforeEach it assert */

const { assertRevert } = require('@aragon/test-helpers/assertThrow')
const { defaultParams, initializeAppWithParams, deployAllAndInitializeApp } = require('./helpers/deployApp')

contract('HCVoting (setup)', ([appManager]) => {
  let app, voteToken

  describe('when initializing the app with valid parameters', () => {
    before('deploy and initialize', async () => {
      ({ app, voteToken } = await deployAllAndInitializeApp(appManager))
    })

    it('has a vote token set', async () => {
      assert.equal(voteToken.address, await app.voteToken())
    })

    it('reverts when attempting to re-initialize the app', async () => {
      await assertRevert(
        initializeAppWithParams(app, defaultParams),
        'INIT_ALREADY_INITIALIZED'
      )
    })
  })
})
