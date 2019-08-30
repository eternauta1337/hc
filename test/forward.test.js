/* global contract beforeEach it assert */

const { assertRevert } = require('@aragon/test-helpers/assertThrow')
const { EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript')
const { deployAllAndInitializeApp } = require('./helpers/deployApp')

contract('HCVoting (forward)', ([appManager, voter]) => {
  let app, voteToken

  before('deploy app', async () => {
    ({ app, voteToken } = await deployAllAndInitializeApp(appManager))
  })

  it('reports to be a forwarder', async () => {
    assert.isTrue(await app.isForwarder())
  })

  it('allows any address to forward', async () => {
    assert.isTrue(await app.canForward(voter, EMPTY_SCRIPT))
  })

  describe('when there is no vote token supply', () => {
    it('reverts when forwarding to the app', async () => {
      await assertRevert(
        app.forward(EMPTY_SCRIPT),
        'HCVOTING_NO_VOTING_POWER'
      )
    })
  })

  describe('when vote tokens exist', () => {
    before('mint tokens', async () => {
      await voteToken.generateTokens(voter, 1)
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
})
