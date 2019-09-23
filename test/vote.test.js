/* global contract beforeEach it assert */

const { assertRevert } = require('@aragon/test-helpers/assertThrow')
const { getEventAt } = require('@aragon/test-helpers/events')
const { deployAllAndInitializeApp, VOTE } = require('./helpers/deployApp')

contract('HCVoting (vote)', ([appManager, voter1, voter2, voter3, voter4]) => {
  let app

  before('deploy app', async () => {
    ({ app } = await deployAllAndInitializeApp(appManager))
  })

  it('should revert when voting on a proposal that doesn\'t exist', async () => {
    await assertRevert(
      app.vote(0, true, { fom: voter1 }),
      'HCVOTING_PROPOSAL_DOES_NOT_EXIST'
    )
  })

  describe('when a proposal exists', () => {
    before('create a proposal', async () => {
      await app.propose('Proposal metadata 0')
    })

    describe('when voter1 casts a Nay vote on the proposal', () => {
      let voteReceipt

      before('cast vote', async () => {
        voteReceipt = await app.vote(0, false, { from: voter1 })
      })

      it('should emit a VoteCasted event with the appropriate data', async () => {
        const voteEvent = getEventAt(voteReceipt, 'VoteCasted')
        assert.equal(voteEvent.args.proposalId.toNumber(), 0, 'invalid proposal id')
        assert.equal(voteEvent.args.voter, voter1, 'invalid voter')
        assert.equal(voteEvent.args.supports, false, 'invalid vote support')
      })

      it('registers the correct totalYeas/totalNays', async () => {
        assert.equal((await app.getTotalYeas(0)), 0, 'invalid yeas')
        assert.equal((await app.getTotalNays(0)), 1, 'invalid nays')
      })

      it('should record the user\'s vote as Nay', async () => {
        assert.equal((await app.getUserVote(0, voter1)).toNumber(), VOTE.NAY)
      })

      it('does not allow voter1 to vote again', async () => {
        await assertRevert(
          app.vote(0, true, { from: voter1 }),
          'HCVOTING_ALREADY_VOTED'
        )
        await assertRevert(
          app.vote(0, false, { from: voter1 }),
          'HCVOTING_ALREADY_VOTED'
        )
      })

      describe('when voter2 casts a Yea vote on the proposal', () => {
        before('cast vote', async () => {
          await app.vote(0, true, { from: voter2 })
        })

        it('should record the user\'s vote as Yea', async () => {
          assert.equal((await app.getUserVote(0, voter2)).toNumber(), VOTE.YEA)
        })

        it('registers the correct totalYeas/totalNays', async () => {
          assert.equal((await app.getTotalYeas(0)), 1, 'invalid yeas')
          assert.equal((await app.getTotalNays(0)), 1, 'invalid nays')
        })
      })
    })
  })
})
