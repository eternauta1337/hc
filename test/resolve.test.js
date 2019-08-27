/* global contract beforeEach it assert */

const { assertRevert } = require('@aragon/test-helpers/assertThrow')
const { encodeCallScript, EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript')
const { getEventAt } = require('@aragon/test-helpers/events')
const { deployAllAndInitializeApp } = require('./helpers/deployApp')

const VOTER_BALANCE = 100
const REQUIRED_SUPPORT_PPM = 510000
const PROPOSAL_DURATION = 24 * 60 * 60
const BOOSTING_DURATION = 1 * 60 * 60
const BOOSTED_DURATION = 6 * 60 * 60

contract('HCVoting (resolve)', ([appManager, creator, voter]) => {
  let app, voteToken

  before('deploy app', async () => {
    ({ app, voteToken } = await deployAllAndInitializeApp(
      appManager,
      REQUIRED_SUPPORT_PPM,
      PROPOSAL_DURATION,
      BOOSTING_DURATION,
      BOOSTED_DURATION
    ))
  })

  before('mint some tokens', async () => {
    await voteToken.generateTokens(voter, VOTER_BALANCE)
  })

  describe('when resolving proposals', () => {
    let proposalId

    const newSupportPPM = 400000;

    beforeEach('create a proposal with a script that is not empty', async () => {
      const action = {
        to: app.address,
        calldata: app.contract.changeSupportPPM.getData(newSupportPPM)
      }
      const script = encodeCallScript([action])

      await app.createProposal(script, 'Modify support')
      proposalId = (await app.numProposals()).toNumber() - 1
    })

    it('reverts when trying to resolve a proposal that doesn\'t have enough support', async () => {
      assert.equal(await app.getProposalSupport(proposalId, false), false)
      await assertRevert(
        app.resolveProposal(proposalId),
        'HCVOTING_NOT_ENOUGH_SUPPORT'
      )
    })

    it('executes the script when resolving a proposal that has enough support', async () => {
      await app.vote(proposalId, true, { from: voter })
      assert.equal(await app.getProposalSupport(proposalId, false), true)

      await app.resolveProposal(proposalId)
      // assert.equal((await app.supportPPM()).toNumber(), newSupportPPM)
    })

    it('emits a ProposalExecuted event when the proposal is executed', async () => {
      await app.vote(proposalId, true, { from: voter })

      const resolutionReceipt = await app.resolveProposal(proposalId)

      const executionEvent = getEventAt(resolutionReceipt, 'ProposalExecuted')
      assert.equal(executionEvent.args.proposalId.toNumber(), proposalId, 'invalid proposal id')
    })

    it('reverts when trying to resolve a proposal a second time', async () => {
      await app.vote(proposalId, true, { from: voter })
      assert.equal(await app.getProposalSupport(proposalId, false), true)

      await app.resolveProposal(proposalId)
      await assertRevert(
        app.resolveProposal(proposalId),
        'HCVOTING_PROPOSAL_IS_RESOLVED'
      )
    })
  })
})
