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

contract('HCVoting (execute)', ([appManager, creator, voter]) => {
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

  describe('when executing proposals', () => {
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

    it('reverts when trying to execute a proposal that doesn\'t have enough support', async () => {
      assert.equal(await app.getProposalSupport(proposalId), false)
      await assertRevert(
        app.executeProposal(proposalId),
        'HCVOTING_NOT_ENOUGH_SUPPORT'
      )
    })

    it('executes the script when executing a proposal that has enough support', async () => {
      await app.vote(proposalId, true, { from: voter })
      assert.equal(await app.getProposalSupport(proposalId), true)

      await app.executeProposal(proposalId)
      assert.equal((await app.supportPPM()).toNumber(), newSupportPPM)
    })

    it('emits a ProposalExecuted event when the proposal is executed', async () => {
      await app.vote(proposalId, true, { from: voter })

      const executionReceipt = await app.executeProposal(proposalId)

      const executionEvent = getEventAt(executionReceipt, 'ProposalExecuted')
      assert.equal(executionEvent.args.proposalId.toNumber(), proposalId, 'invalid proposal id')
    })

    it('reverts when trying to execute a proposal a second time', async () => {
      await app.vote(proposalId, true, { from: voter })
      assert.equal(await app.getProposalSupport(proposalId), true)

      await app.executeProposal(proposalId)
      await assertRevert(
        app.executeProposal(proposalId),
        'HCVOTING_PROPOSAL_IS_RESOLVED'
      )
    })
  })
})
