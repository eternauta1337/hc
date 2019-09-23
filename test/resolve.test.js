/* global contract beforeEach it assert */

const { assertRevert } = require('@aragon/test-helpers/assertThrow')
const { encodeCallScript } = require('@aragon/test-helpers/evmScript')
const { getEventAt } = require('@aragon/test-helpers/events')
const { defaultParams, deployAllAndInitializeApp, VOTE, PROPOSAL_STATE } = require('./helpers/deployApp')

const SomeContract = artifacts.require('SomeContract.sol')

contract('HCVoting (resolve)', ([appManager, creator, voter1, voter2, voter3, voter4, staker]) => {
  let app, voteToken, someContract
  let resolutionReceipt
  let proposalId = -1

  const NEW_VALUE = 42

  async function createProposalWithScript() {
    const action = {
      to: someContract.address,
      calldata: someContract.contract.setValue.getData(NEW_VALUE)
    }
    const script = encodeCallScript([action])
    await app.propose(script, 'Change value in SomeContract')
    proposalId++
  }

  async function itResolvesTheProposal(executes, consensus, positiveSupport, negativeSupport) {
    it('properly calculates the proposal\'s positive support', async () => {
      assert.equal((await app.getSupport(proposalId, true)).toNumber(), positiveSupport)
    })

    it('properly calculates the proposal\'s negative support', async () => {
      assert.equal((await app.getSupport(proposalId, false)).toNumber(), negativeSupport)
    })

    it('properly calculates the proposal\'s consensus', async () => {
      assert.equal((await app.getConsensus(proposalId)).toNumber(), consensus)
    })

    describe('when resolving the proposal', () => {
      before('resolve proposal', async () => {
        resolutionReceipt = await app.resolve(proposalId)
      })

      it('emits a ProposalResolved event', async () => {
        const resolutionEvent = getEventAt(resolutionReceipt, 'ProposalResolved')
        assert.equal(resolutionEvent.args.proposalId.toNumber(), proposalId, 'invalid proposal id')
      })

      it('correctly registers if the proposal is resolved', async () => {
        assert.equal(await app.getResolved(proposalId), true)
      })

      it('correctly registers if the proposal is executed', async () => {
        assert.equal(await app.getExecuted(proposalId), executes)
      })

      it('changes value in SomeContract if the proposal is supported', async () => {
        assert.equal((await someContract.value()).toNumber(), executes ? NEW_VALUE : 0)
      })

      it('reverts when trying to resolve the proposal a second time', async () => {
        await assertRevert(
          app.resolve(proposalId),
          'HCVOTING_PROPOSAL_IS_RESOLVED'
        )
      })
    })
  }

  before('deploy app', async () => {
    ({ app, voteToken } = await deployAllAndInitializeApp(appManager))
  })

  before('mint some tokens', async () => {
    await voteToken.generateTokens(voter1, '100e18')
    await voteToken.generateTokens(voter2, '100e18')
    await voteToken.generateTokens(voter3, '100e18')
    await voteToken.generateTokens(voter4, '100e18')
  })

  describe('when trying to resolve a proposal with no consensus', () => {
    before('create proposal', async () => {
      someContract = await SomeContract.new()
      await createProposalWithScript()
    })

    it('evaluates the proposal\'s consensus to be ABSENT', async () => {
      assert.equal((await app.getConsensus(proposalId)).toNumber(), VOTE.ABSENT)
    })

    it('reverts when trying to resolve the proposal', async () => {
      await assertRevert(
        app.resolve(proposalId),
        'HCVOTING_NO_CONSENSUS'
      )
    })
  })

  describe('when resolving proposals with absolute consensus', () => {
    describe('when a proposal has absolute negative consensus', () => {
      before('create proposal', async () => {
        someContract = await SomeContract.new()
        await createProposalWithScript()
      })

      before('cast votes', async () => {
        await app.vote(proposalId, false, { from: voter1 })
        await app.vote(proposalId, false, { from: voter2 })
        await app.vote(proposalId, false, { from: voter3 })
      })

      itResolvesTheProposal(false, VOTE.NAY, 0, 750000)
    })

    describe('when a proposal has absolute positive consensus', () => {
      before('create proposal', async () => {
        someContract = await SomeContract.new()
        await createProposalWithScript()
      })

      before('cast votes', async () => {
        await app.vote(proposalId, true, { from: voter1 })
        await app.vote(proposalId, true, { from: voter2 })
        await app.vote(proposalId, true, { from: voter3 })
      })

      itResolvesTheProposal(true, VOTE.YEA, 750000, 0)
    })
  })
})
