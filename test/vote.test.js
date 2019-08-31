/* global contract beforeEach it assert */

const { assertRevert } = require('@aragon/test-helpers/assertThrow')
const { EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript')
const { getEventAt } = require('@aragon/test-helpers/events')
const { defaultParams, deployAllAndInitializeApp, VOTE } = require('./helpers/deployApp')

const VOTER_BALANCE = 100
const MILLION = 1000000

contract('HCVoting (vote)', ([appManager, voter1, voter2, voter3, voter4]) => {
  let app, voteToken

  before('deploy app', async () => {
    ({ app, voteToken } = await deployAllAndInitializeApp(appManager))
  })

  it('should revert when voting on a proposal that doesn\'t exist', async () => {
    await assertRevert(
      app.vote(0, true, { fom: voter1 }),
      'HCVOTING_PROPOSAL_DOES_NOT_EXIST'
    )
  })

  describe('when a proposal exists', () => {
    let creationDate

    const calculateSupport = (numVotes, numVoters) => {
      return numVotes * MILLION / numVoters
    }

    before('mint some tokens', async () => {
      await voteToken.generateTokens(voter1, VOTER_BALANCE)
      await voteToken.generateTokens(voter2, VOTER_BALANCE)
    })

    before('create a proposal', async () => {
      await app.create(EMPTY_SCRIPT, 'Proposal metadata 0')
      creationDate = (await app.getCreationDate(0)).toNumber()
    })

    it('should not allow a user with no voting power to vote', async () => {
      await assertRevert(
        app.vote(0, true, { from: voter3 }),
        'HCVOTING_NO_VOTING_POWER'
      )
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
        assert.equal((await app.getTotalYeas(0)).toNumber(), 0, 'invalid yeas')
        assert.equal((await app.getTotalNays(0)).toNumber(), VOTER_BALANCE, 'invalid nays')
      })

      it('should record the user\'s vote as Nay', async () => {
        assert.equal((await app.getVote(0, voter1)).toNumber(), VOTE.NAY)
      })

      it('should not allow redundant votes', async () => {
        await assertRevert(
          app.vote(0, false, { from: voter1 }),
          'HCVOTING_REDUNDANT_VOTE'
        )
      })

      it('calculates the correct absolute support', async () => {
        assert.equal((await app.getSupport(0, true, false)).toNumber(), calculateSupport(0, 2), 'incorrect absolute positive support')
        assert.equal((await app.getSupport(0, false, false)).toNumber(), calculateSupport(1, 2), 'incorrect absolute negative support')
      })

      it('calculates the correct absolute consensus', async () => {
        assert.equal((await app.getConsensus(0, false)).toNumber(), VOTE.ABSENT, 'incorrect absolute consensus')
      })

      describe('when voter1 changes the Nay vote to Yea', () => {
        before('change vote', async () => {
          await app.vote(0, true, { from: voter1 })
        })

        it('should record the user\'s vote as Yea', async () => {
          assert.equal((await app.getVote(0, voter1)).toNumber(), VOTE.YEA)
        })

        it('registers the correct totalYeas/totalNays', async () => {
          assert.equal((await app.getTotalYeas(0)).toNumber(), VOTER_BALANCE, 'invalid yeas')
          assert.equal((await app.getTotalNays(0)).toNumber(), 0, 'invalid nays')
        })

        it('calculates the correct absolute support', async () => {
          assert.equal((await app.getSupport(0, true, false)).toNumber(), calculateSupport(1, 2), 'incorrect absolute positive support')
          assert.equal((await app.getSupport(0, false, false)).toNumber(), calculateSupport(0, 2), 'incorrect absolute negative support')
        })

        describe('when voter2 casts a Yea vote on the proposal', () => {
          before('cast vote', async () => {
            await app.vote(0, true, { from: voter2 })
          })

          it('should record the user\'s vote as Yea', async () => {
            assert.equal((await app.getVote(0, voter2)).toNumber(), VOTE.YEA)
          })

          it('registers the correct totalYeas/totalNays', async () => {
            assert.equal((await app.getTotalYeas(0)).toNumber(), 2 * VOTER_BALANCE, 'invalid yeas')
            assert.equal((await app.getTotalNays(0)).toNumber(), 0, 'invalid nays')
          })

          it('calculates the correct absolute support', async () => {
            assert.equal((await app.getSupport(0, true, false)).toNumber(), calculateSupport(2, 2), 'incorrect absolute positive support')
            assert.equal((await app.getSupport(0, false, false)).toNumber(), calculateSupport(0, 2), 'incorrect absolute negative support')
          })

          it('calculates the correct absolute consensus', async () => {
            assert.equal((await app.getConsensus(0, false)).toNumber(), VOTE.YEA, 'incorrect absolute consensus')
          })

          describe('when voter1 transfers its tokens to voter3', () => {
            before('transfer tokens', async () => {
              await voteToken.transfer(voter3, VOTER_BALANCE, { from: voter1 })
            })

            after('return tokens', async () => {
              await voteToken.transfer(voter1, VOTER_BALANCE, { from: voter3 })
            })

            it('reverts when voter3 attempts to vote on the proposal', async () => {
              await assertRevert(
                app.vote(0, true, { from: voter3 }),
                'HCVOTING_NO_VOTING_POWER'
              )
            })
          })

          describe('when the vote token supply increases after the proposal was created', () => {
            before('mint tokens', async () => {
              await voteToken.generateTokens(voter3, VOTER_BALANCE)
              await voteToken.generateTokens(voter4, VOTER_BALANCE)
            })

            it('calculated absolute support does not change', async () => {
              assert.equal((await app.getSupport(0, true, false)).toNumber(), calculateSupport(2, 2), 'incorrect absolute positive support')
              assert.equal((await app.getSupport(0, false, false)).toNumber(), calculateSupport(0, 2), 'incorrect absolute negative support')
            })

            it('calculates absolute consensus does not change', async () => {
              assert.equal((await app.getConsensus(0, false)).toNumber(), VOTE.YEA, 'incorrect absolute consensus')
            })

            describe('when another proposal is created and multiple votes are casted on it', () => {
              before('create another proposal', async () => {
                await app.create(EMPTY_SCRIPT, 'Proposal metadata 1')
              })

              before('cast multiple votes', async () => {
                await app.vote(1, true, { from: voter1 })
                await app.vote(1, false, { from: voter2 })
                await app.vote(1, false, { from: voter3 })
                await app.vote(1, false, { from: voter4 })
              })

              it('registers the correct totalYeas/totalNays', async () => {
                assert.equal((await app.getTotalYeas(1)).toNumber(), 1 * VOTER_BALANCE, 'invalid yeas')
                assert.equal((await app.getTotalNays(1)).toNumber(), 3 * VOTER_BALANCE, 'invalid nays')
              })

              it('registers each user\'s vote', async () => {
                assert.equal((await app.getVote(1, voter1)).toNumber(), VOTE.YEA)
                assert.equal((await app.getVote(1, voter2)).toNumber(), VOTE.NAY)
                assert.equal((await app.getVote(1, voter3)).toNumber(), VOTE.NAY)
                assert.equal((await app.getVote(1, voter4)).toNumber(), VOTE.NAY)
              })

              it('calculates the correct absolute support', async () => {
                assert.equal((await app.getSupport(1, true, false)).toNumber(), calculateSupport(1, 4), 'incorrect absolute positive support')
                assert.equal((await app.getSupport(1, false, false)).toNumber(), calculateSupport(3, 4), 'incorrect absolute negative support')
              })

              it('calculates the correct absolute consensus', async () => {
                assert.equal((await app.getConsensus(1, false)).toNumber(), VOTE.NAY, 'incorrect absolute consensus')
              })
            })
          })

          describe('when the proposal is closed', () => {
            before('shift time to after queuePeriod', async () => {
              await app.mockSetTimestamp(creationDate + defaultParams.queuePeriod)
            })

            after('shift time back to when the proposal was created', async () => {
              await app.mockSetTimestamp(creationDate)
            })

            it('reverts when voter2 attempts to change its vote', async () => {
              await assertRevert(
                app.vote(0, false, { from: voter2 }),
                'HCVOTING_PROPOSAL_IS_CLOSED'
              )
            })
          })

          describe('when the proposal is resolved', () => {
            before('resolve proposal', async () => {
              await app.resolve(0)
            })

            it('reverts when voter2 attempts to change its vote', async () => {
              await assertRevert(
                app.vote(0, false, { from: voter2 }),
                'HCVOTING_PROPOSAL_IS_RESOLVED'
              )
            })
          })
        })
      })
    })
  })
})
