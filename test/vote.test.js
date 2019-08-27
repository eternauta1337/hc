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

const VOTE = {
  ABSENT: '0',
  YEA: '1',
  NAY: '2'
}

contract('HCVoting (vote)', ([appManager, creator, voter1, voter2, voter3]) => {
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

  it('should revert when voting on a proposal that doesn\'t exist', async () => {
    await assertRevert(
      app.vote(0, true, { from: voter1 }),
      'HCVOTING_PROPOSAL_DOES_NOT_EXIST'
    )
  })

  describe('when voting on proposals', () => {
    let voteReceipt1, voteReceipt2, voteReceipt3, voteReceipt4

    before('mint some tokens', async () => {
      await voteToken.generateTokens(voter1, VOTER_BALANCE)
      await voteToken.generateTokens(voter2, VOTER_BALANCE)
    })

    before('create some proposals', async () => {
      await app.createProposal(EMPTY_SCRIPT, 'Proposal metadata', { from: creator })
      await app.createProposal(EMPTY_SCRIPT, 'Proposal metadata', { from: creator })
    })

    it('should not allow a voter with no voting power to vote', async () => {
      await assertRevert(
        app.vote(0, true, { from: voter3 }),
        'HCVOTING_NO_VOTING_POWER'
      )
    })

    before('cast some votes', async () => {
      voteReceipt1 = await app.vote(0, true, { from: voter1 })
      voteReceipt2 = await app.vote(0, false, { from: voter2 })

      voteReceipt3 = await app.vote(1, false, { from: voter1 })
      voteReceipt4 = await app.vote(1, true, { from: voter2 })
    })

    it('should emit VoteCasted events', async () => {
      const event1 = getEventAt(voteReceipt1, 'VoteCasted')
      assert.equal(event1.args.proposalId.toNumber(), 0, 'invalid proposal id')
      assert.equal(event1.args.voter, voter1, 'invalid voter')
      assert.equal(event1.args.supports, true, 'invalid vote support')

      const event2 = getEventAt(voteReceipt2, 'VoteCasted')
      assert.equal(event2.args.proposalId.toNumber(), 0, 'invalid proposal id')
      assert.equal(event2.args.voter, voter2, 'invalid voter')
      assert.equal(event2.args.supports, false, 'invalid vote support')

      const event3 = getEventAt(voteReceipt3, 'VoteCasted')
      assert.equal(event3.args.proposalId.toNumber(), 1, 'invalid proposal id')
      assert.equal(event3.args.voter, voter1, 'invalid voter')
      assert.equal(event3.args.supports, false, 'invalid vote support')

      const event4 = getEventAt(voteReceipt4, 'VoteCasted')
      assert.equal(event4.args.proposalId.toNumber(), 1, 'invalid proposal id')
      assert.equal(event4.args.voter, voter2, 'invalid voter')
      assert.equal(event4.args.supports, true, 'invalid vote support')
    })

    it('should register the correct number of yeas and nays on each proposal', async () => {
      assert.equal((await app.getProposalYeas(0)).toNumber(), VOTER_BALANCE, 'invalid yeas')
      assert.equal((await app.getProposalNays(0)).toNumber(), VOTER_BALANCE, 'invalid nays')

      assert.equal((await app.getProposalYeas(1)).toNumber(), VOTER_BALANCE, 'invalid yeas')
      assert.equal((await app.getProposalNays(1)).toNumber(), VOTER_BALANCE, 'invalid nays')
    })

    it('should keep track of each vote, per user', async () => {
      assert.equal((await app.getVote(0, voter1)).toString(), VOTE.YEA)
      assert.equal((await app.getVote(0, voter2)).toString(), VOTE.NAY)
      assert.equal((await app.getVote(0, voter3)).toString(), VOTE.ABSENT)

      assert.equal((await app.getVote(1, voter1)).toString(), VOTE.NAY)
      assert.equal((await app.getVote(1, voter2)).toString(), VOTE.YEA)
      assert.equal((await app.getVote(1, voter3)).toString(), VOTE.ABSENT)
    })

    it('should not allow redundant votes', async () => {
      await assertRevert(
        app.vote(0, true, { from: voter1 }),
        'HCVOTING_VOTE_ALREADY_CASTED'
      )
    })

    it('should allow a vote to be changed from yea to nay and viceversa', async () => {
      await app.vote(0, false, { from: voter1 })

      assert.equal((await app.getProposalYeas(0)).toNumber(), 0, 'invalid yeas')
      assert.equal((await app.getVote(0, voter1)).toString(), VOTE.NAY)
    })

    it('should properly calculate support', async () => {
      assert.equal(await app.getProposalSupport(0), false)

      await app.vote(1, true, { from: voter1 })
      assert.equal(await app.getProposalSupport(1), true)
    })

    it('should not allow a voter to double vote by transferring tokens', async () => {
      await voteToken.transfer(voter3, VOTER_BALANCE, { from: voter1 })
      await assertRevert(
        app.vote(0, true, { from: voter3 }),
        'HCVOTING_NO_VOTING_POWER'
      )
      await voteToken.transfer(voter1, VOTER_BALANCE, { from: voter3 })
    })

    it('should not change calculated support if vote token supply changes', async () => {
      await app.createProposal(EMPTY_SCRIPT, 'Proposal metadata', { from: creator })

      const proposalId = (await app.numProposals()).toNumber() - 1
      await app.vote(proposalId, true, { from: voter1 })
      await app.vote(proposalId, true, { from: voter2 })
      assert.equal(await app.getProposalSupport(proposalId), true)

      await voteToken.generateTokens(voter3, VOTER_BALANCE)
      assert.equal(await app.getProposalSupport(proposalId), true)
    })

    it('should not allow voting on a proposal that has been resolved', async () => {
      await app.createProposal(EMPTY_SCRIPT, 'Proposal metadata', { from: creator })
      const proposalId = (await app.numProposals()).toNumber() - 1

      await app.vote(proposalId, true, { from: voter1 })
      await app.vote(proposalId, true, { from: voter2 })
      assert.equal(await app.getProposalSupport(proposalId), true)

      await app.executeProposal(proposalId)
      await assertRevert(
        app.vote(proposalId, false, { from: voter2 }),
        'HCVOTING_PROPOSAL_IS_RESOLVED'
      )
    })

    it('should not allow voting on a proposal that has expired', async () => {
      await app.createProposal(EMPTY_SCRIPT, 'Proposal metadata', { from: creator })
      const proposalId = (await app.numProposals()).toNumber() - 1

      const now = Math.floor(new Date().getTime() / 1000)
      await app.mockSetTimestamp(now + PROPOSAL_DURATION + 1)

      await assertRevert(
        app.vote(proposalId, true, { from: voter1 }),
        'HCVOTING_PROPOSAL_IS_CLOSED'
      )

      await app.mockSetTimestamp(now)
    })
  })
})
