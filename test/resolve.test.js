/* global contract beforeEach it assert */

const { assertRevert } = require('@aragon/test-helpers/assertThrow')
const { encodeCallScript } = require('@aragon/test-helpers/evmScript')
const { getEventAt } = require('@aragon/test-helpers/events')
const { defaultParams, deployAllAndInitializeApp, VOTE, PROPOSAL_STATE } = require('./helpers/deployApp')

const SomeContract = artifacts.require('SomeContract.sol')

contract('HCVoting (resolve)', ([appManager, creator, voter1, voter2, voter3, voter4, staker]) => {
  let app, voteToken, stakeToken, someContract
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

  async function itResolvesTheProposal(executes, relative, consensus, positiveSupport, negativeSupport) {
    it('properly calculates the proposal\'s positive support', async () => {
      assert.equal((await app.getSupport(proposalId, true, relative)).toNumber(), positiveSupport)
    })

    it('properly calculates the proposal\'s negative support', async () => {
      assert.equal((await app.getSupport(proposalId, false, relative)).toNumber(), negativeSupport)
    })

    it('properly calculates the proposal\'s consensus', async () => {
      assert.equal((await app.getConsensus(proposalId, relative)).toNumber(), consensus)
    })

    describe('when resolving the proposal', () => {
      before('resolve proposal', async () => {
        resolutionReceipt = await app.resolve(proposalId)
      })

      it('emits a ProposalResolved event', async () => {
        const resolutionEvent = getEventAt(resolutionReceipt, 'ProposalResolved')
        assert.equal(resolutionEvent.args.proposalId.toNumber(), proposalId, 'invalid proposal id')
      })

      it('evaluates the proposal\'s state as RESOLVED', async () => {
        assert.equal((await app.getState(proposalId)).toNumber(), PROPOSAL_STATE.RESOLVED)
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
    ({ app, voteToken, stakeToken } = await deployAllAndInitializeApp(appManager))
  })

  before('mint some tokens', async () => {
    await voteToken.generateTokens(voter1, 100)
    await voteToken.generateTokens(voter2, 100)
    await voteToken.generateTokens(voter3, 100)
    await voteToken.generateTokens(voter4, 100)
  })

  describe('when trying to resolve a proposal with no consensus', () => {
    before('create proposal', async () => {
      someContract = await SomeContract.new()
      await createProposalWithScript()
    })

    it('evaluates the proposal\'s consensus to be ABSENT', async () => {
      assert.equal((await app.getConsensus(proposalId, false)).toNumber(), VOTE.ABSENT)
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

      itResolvesTheProposal(false, false, VOTE.NAY, 0, 750000)
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

      itResolvesTheProposal(true, false, VOTE.YEA, 750000, 0)
    })
  })

  describe('when resolving proposals with relative consensus', () => {
    async function quickBoostProposal() {
      await app.stake(proposalId, 4000, true, { from: staker })

      const pendedDate = (await app.getPendedDate(proposalId)).toNumber()
      await app.mockSetTimestamp(pendedDate + defaultParams.pendedPeriod)
      await app.boost(proposalId)
    }

    before('mint stake tokens', async () => {
      await stakeToken.generateTokens(staker, 1000000)
      await stakeToken.approve(app.address, 1000000, { from: staker })
    })

    describe('when a proposal has relative negative consensus', () => {
      before('create and boost a proposal', async () => {
        someContract = await SomeContract.new()
        await createProposalWithScript()
        await quickBoostProposal()
      })

      before('cast votes', async () => {
        await app.vote(proposalId, true, { from: voter1 })
        await app.vote(proposalId, false, { from: voter2 })
        await app.vote(proposalId, false, { from: voter3 })
      })

      it('reverts when trying to resolve the proposal before the boostPeriod elapses', async () => {
        await assertRevert(
          app.resolve(proposalId),
          'HCVOTING_ON_BOOST_PERIOD'
        )
      })

      describe('when the boost period elapses', () => {
        before('shift time till after the proposal closes', async () => {
          const closeDate = (await app.getCloseDate(proposalId)).toNumber()
          await app.mockSetTimestamp(closeDate)
        })

        itResolvesTheProposal(false, true, VOTE.NAY, 333333, 666666)
      })
    })

    describe('when a proposal has relative positive consensus', () => {
      before('create and boost a proposal', async () => {
        await createProposalWithScript()
        await quickBoostProposal()
      })

      before('cast votes', async () => {
        await app.vote(proposalId, false, { from: voter1 })
        await app.vote(proposalId, true, { from: voter2 })
        await app.vote(proposalId, true, { from: voter3 })
      })

      before('shift time till after the proposal closes', async () => {
        const closeDate = (await app.getCloseDate(proposalId)).toNumber()
        await app.mockSetTimestamp(closeDate)
      })

      itResolvesTheProposal(true, true, VOTE.YEA, 666666, 333333)
    })
  })
})
