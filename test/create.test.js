/* global artifacts contract beforeEach it assert */

const { assertRevert } = require('@aragon/test-helpers/assertThrow')
const { EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript')
const { getEventAt } = require('@aragon/test-helpers/events')
const { defaultParams, deployAllAndInitializeApp } = require('./helpers/deployApp')

contract('HCVoting (create)', ([appManager, user1, user2]) => {
  let app, voteToken
  let proposalId = -1

  const createProposal = async (creator) => {
    proposalId++
    return app.createProposal(EMPTY_SCRIPT, `Proposal metadata ${proposalId}`, { from: creator })
  }

  before('deploy app', async () => {
    ({ app, voteToken } = await deployAllAndInitializeApp(appManager))
  })

  it('should revert when attempting to retrieve a proposal that does not exist', async () => {
    await assertRevert(
      app.getProposalCreationDate(0),
      'HCVOTING_PROPOSAL_DOES_NOT_EXIST'
    )
  })

  it('should revert when attempting to create a proposal when no vote tokens exist', async () => {
    await assertRevert(
      app.createProposal(EMPTY_SCRIPT, 'Proposal metadata'),
      'HCVOTING_NO_VOTING_POWER'
    )
  })

  describe('when vote tokens exist', () => {
    before('mint vote tokens', async () => {
      await voteToken.generateTokens(user1, 1)
    })

    it('can create a proposal', async () => {
      await createProposal(user1)
    })

    describe('when creating a proposal', () => {
      let creationReceipt

      before('create a proposal', async () => {
        creationReceipt = await createProposal(user2)
      })

      it('should store creationBlock', async () => {
        assert.equal((await app.getProposalCreationBlock(proposalId)).toNumber(), creationReceipt.receipt.blockNumber - 1)
      })

      it('should store creationDate', async () => {
        assert.notEqual((await app.getProposalCreationDate(proposalId)).toNumber(), 0)
      })

      it('should store closeDate', async () => {
        const creationDate = (await app.getProposalCreationDate(proposalId)).toNumber()
        const closeDate = (await app.getProposalCloseDate(proposalId)).toNumber()
        assert.equal(closeDate, creationDate + defaultParams.queuePeriod)
      })

      it('should store execution script', async () => {
        assert.equal(await app.getProposalScript(proposalId), EMPTY_SCRIPT)
      })

      it('should emit a ProposalCreated event with the appropriate data', async () => {
        const creationEvent = getEventAt(creationReceipt, 'ProposalCreated')
        assert.equal(creationEvent.args.proposalId.toNumber(), proposalId, 'invalid proposal id')
        assert.equal(creationEvent.args.creator, user2, 'invalid creator')
        assert.equal(creationEvent.args.metadata, `Proposal metadata ${proposalId}`, 'invalid proposal metadata')
      })

      it('should increase numProposals', async () => {
        assert.equal((await app.numProposals()).toNumber(), proposalId + 1)
      })

      describe('when creating another proposal', () => {
        before('create another proposal', async () => {
          creationReceipt = await createProposal(user1)
        })

        it('should emit a ProposalCreated event with the appropriate data', async () => {
          const creationEvent = getEventAt(creationReceipt, 'ProposalCreated')
          assert.equal(creationEvent.args.proposalId.toNumber(), proposalId, 'invalid proposal id')
          assert.equal(creationEvent.args.creator, user1, 'invalid creator')
          assert.equal(creationEvent.args.metadata, `Proposal metadata ${proposalId}`, 'invalid proposal metadata')
        })

        it('should increase numProposals', async () => {
          assert.equal((await app.numProposals()).toNumber(), proposalId + 1)
        })
      })
    })
  })
})
