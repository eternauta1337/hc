/* global contract beforeEach it assert */

const { assertRevert } = require('@aragon/test-helpers/assertThrow')
const { encodeCallScript } = require('@aragon/test-helpers/evmScript')
const { getEventAt } = require('@aragon/test-helpers/events')
const { defaultParams, deployAllAndInitializeApp } = require('./helpers/deployApp')

const VOTE = {
  ABSENT: 0,
  YEA: 1,
  NAY: 2
}

const PROPOSAL_STATE = {
  QUEUED: 0,
  PENDED: 1,
  BOOSTED: 2,
  RESOLVED: 3,
  CLOSED: 4
}

contract('HCVoting (resolve)', ([appManager, creator, voter1, voter2, voter3, voter4, staker]) => {
  let app, voteToken, stakeToken
  let resolutionReceipt
  let proposalId = -1

  const newRequiredSupport = 400000;

  async function createProposalWithScript() {
    const action = { to: app.address, calldata: app.contract.changeRequiredSupport.getData(newRequiredSupport) }
    const script = encodeCallScript([action])
    await app.createProposal(script, 'Modify support')
    proposalId++
  }

  async function itResolvesTheProposal(executes, relative, consensus, positiveSupport, negativeSupport) {
    it('properly calculates the proposal\'s positive support', async () => {
      assert.equal((await app.getProposalSupport(proposalId, true, relative)).toNumber(), positiveSupport)
    })

    it('properly calculates the proposal\'s negative support', async () => {
      assert.equal((await app.getProposalSupport(proposalId, false, relative)).toNumber(), negativeSupport)
    })

    it('properly calculates the proposal\'s consensus', async () => {
      assert.equal((await app.getProposalConsensus(proposalId, relative)).toNumber(), consensus)
    })

    describe('when resolving the proposal', () => {
      before('resolve proposal', async () => {
        resolutionReceipt = await app.resolveProposal(proposalId)
      })

      after('restore requiredSupport', async () => {
        await app.changeRequiredSupport(defaultParams.requiredSupport)
      })

      it('emits a ProposalResolved event', async () => {
        const resolutionEvent = getEventAt(resolutionReceipt, 'ProposalResolved')
        assert.equal(resolutionEvent.args.proposalId.toNumber(), proposalId, 'invalid proposal id')
      })

      it('evaluates the proposal\'s state as RESOLVED', async () => {
        assert.equal((await app.getProposalState(proposalId)).toNumber(), PROPOSAL_STATE.RESOLVED)
      })

      it('correctly registers if the proposal is executed', async () => {
        assert.equal(await app.getProposalExecuted(proposalId), executes)
      })

      it('changes requiredSupport if the proposal is supported', async () => {
        assert.equal((await app.requiredSupport()).toNumber(), executes ? newRequiredSupport : defaultParams.requiredSupport)
      })

      it('reverts when trying to resolve the proposal a second time', async () => {
        await assertRevert(
          app.resolveProposal(proposalId),
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
      await createProposalWithScript()
    })

    it('evaluates the proposal\'s consensus to be ABSENT', async () => {
      assert.equal((await app.getProposalConsensus(proposalId, false)).toNumber(), VOTE.ABSENT)
    })

    it('reverts when trying to resolve the proposal', async () => {
      await assertRevert(
        app.resolveProposal(proposalId),
        'HCVOTING_NO_CONSENSUS'
      )
    })
  })

  describe('when resolving proposals with absolute consensus', () => {
    describe('when a proposal has absolute negative consensus', () => {
      before('create proposal', async () => {
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

      const pendedDate = (await app.getProposalPendedDate(proposalId)).toNumber()
      await app.mockSetTimestamp(pendedDate + defaultParams.pendedPeriod)
      await app.boostProposal(proposalId)
    }

    before('mint stake tokens', async () => {
      await stakeToken.generateTokens(staker, 1000000)
      await stakeToken.approve(app.address, 1000000, { from: staker })
    })

    describe('when a proposal has relative negative consensus', () => {
      before('create and boost a proposal', async () => {
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
          app.resolveProposal(proposalId),
          'HCVOTING_ON_BOOST_PERIOD'
        )
      })

      describe('when the boost period elapses', () => {
        before('shift time till after the proposal closes', async () => {
          const closeDate = (await app.getProposalCloseDate(proposalId)).toNumber()
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
        const closeDate = (await app.getProposalCloseDate(proposalId)).toNumber()
        await app.mockSetTimestamp(closeDate)
      })

      itResolvesTheProposal(true, true, VOTE.YEA, 666666, 333333)
    })
  })
})
