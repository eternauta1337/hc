/* global artifacts contract beforeEach it assert */

const { assertRevert } = require('@aragon/test-helpers/assertThrow')
const { encodeCallScript, EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript')
const { getEventAt } = require('@aragon/test-helpers/events')
const { deployAllAndInitializeApp } = require('./helpers/deployApp')

const REQUIRED_SUPPORT_PPM = 510000
const PROPOSAL_DURATION = 24 * 60 * 60
const BOOSTING_DURATION = 1 * 60 * 60
const BOOSTED_DURATION = 6 * 60 * 60

contract.skip('HCVoting (create)', ([appManager, creator1, creator2]) => {
  let app
  let proposalCreationReceipt1, proposalCreationReceipt2

  const proposalMetadata1 = 'Transfer 10000 dai from the DAO\'s vault to 0xb4124cEB3451635DAcedd11767f004d8a28c6eE7'
  const proposalMetadata2 = 'Mint 100 DAO tokens to 0xb4124cEB3451635DAcedd11767f004d8a28c6eE7'

  before('deploy app', async () => {
    ({ app } = await deployAllAndInitializeApp(
      appManager,
      REQUIRED_SUPPORT_PPM,
      PROPOSAL_DURATION,
      BOOSTING_DURATION,
      BOOSTED_DURATION
    ))
  })

  describe('when creating some proposals', () => {
    before('create some proposals', async () => {
      proposalCreationReceipt1 = await app.createProposal(EMPTY_SCRIPT, proposalMetadata1, { from: creator1 })
      proposalCreationReceipt2 = await app.createProposal(EMPTY_SCRIPT, proposalMetadata2, { from: creator2 })
    })

    it('should properly store the current block number for when the proposal was created', async () => {
      assert.equal((await app.getProposalCreationBlock(0)).toNumber(), proposalCreationReceipt1.receipt.blockNumber - 1)
      assert.equal((await app.getProposalCreationBlock(1)).toNumber(), proposalCreationReceipt2.receipt.blockNumber - 1)
    })

    it('should emit ProposalCreated events', async () => {
      const event1 = getEventAt(proposalCreationReceipt1, 'ProposalCreated')
      assert.equal(event1.args.proposalId.toNumber(), 0, 'invalid proposal id')
      assert.equal(event1.args.creator, creator1, 'invalid creator')
      assert.equal(event1.args.metadata, proposalMetadata1, 'invalid proposal metadata')

      const event2 = getEventAt(proposalCreationReceipt2, 'ProposalCreated')
      assert.equal(event2.args.proposalId.toNumber(), 1, 'invalid proposal id')
      assert.equal(event2.args.creator, creator2, 'invalid creator')
      assert.equal(event2.args.metadata, proposalMetadata2, 'invalid proposal metadata')
    })

    it('should have increased the number of proposals', async () => {
      assert.equal((await app.numProposals()).toNumber(), 2)
    })
  })
})
