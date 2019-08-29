/* global contract beforeEach it assert */

const { EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript')
const { deployAllAndInitializeApp } = require('./helpers/deployApp')

contract('HCVoting (forward)', ([appManager, voter]) => {
  let app, voteToken

  before('deploy app and mint some vote tokens', async () => {
    ({ app, voteToken } = await deployAllAndInitializeApp(appManager))

    await voteToken.generateTokens(voter, 1)
  })

  describe('when no proposals exist', () => {
    it('reports numProposals to be 0', async () => {
      assert.equal((await app.numProposals()).toNumber(), 0)
    })
  })

  describe('when forwarding to the app', () => {
    before('forward', async () => {
      await app.forward(EMPTY_SCRIPT);
    })

    it('reports numProposals to be 1', async () => {
      assert.equal((await app.numProposals()).toNumber(), 1)
    })

    it('created a proposal with the appropriate script', async () => {
      assert.equal(await app.getProposalScript(0), EMPTY_SCRIPT)
    })
  })
})
