/* global artifacts contract beforeEach it assert */

const { assertRevert } = require('@aragon/test-helpers/assertThrow')
const { getEventArgument, getEventAt } = require('@aragon/test-helpers/events')
const { hash } = require('eth-ens-namehash')
const deployDAO = require('./helpers/deployDAO')

const HCVoting = artifacts.require('HCVoting.sol')
const MiniMeToken = artifacts.require('@aragon/apps-shared-minime/contracts/MiniMeToken')

const ANY_ADDRESS = '0xffffffffffffffffffffffffffffffffffffffff'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const VOTER_BALANCE = 100

const VOTE = {
  ABSENT: '0',
  YEA: '1',
  NAY: '2'
}

contract('HCVoting', ([appManager, creator1, creator2, voter1, voter2, voter3]) => {
  let app, voteToken

  beforeEach('deploy dao, voteToken, and app', async () => {
    const { dao, acl } = await deployDAO(appManager)

    // Deploy the app's base contract.
    const appBase = await HCVoting.new()

    // Instantiate a proxy for the app, using the base contract as its logic implementation.
    const instanceReceipt = await dao.newAppInstance(
      hash('counter.aragonpm.test'), // appId - Unique identifier for each app installed in the DAO; can be any bytes32 string in the tests.
      appBase.address, // appBase - Location of the app's base implementation.
      '0x', // initializePayload - Used to instantiate and initialize the proxy in the same call (if given a non-empty bytes string).
      false, // setDefault - Whether the app proxy is the default proxy.
      { from: appManager }
    )
    app = HCVoting.at(
      getEventArgument(instanceReceipt, 'NewAppProxy', 'proxy')
    )

    // Set up the app's permissions.
    // await acl.createPermission(
    //   ANY_ADDRESS, // entity (who?) - The entity or address that will have the permission.
    //   app.address, // app (where?) - The app that holds the role involved in this permission.
    //   await app.INCREMENT_ROLE(), // role (what?) - The particular role that the entity is being assigned to in this permission.
    //   appManager, // manager - Can grant/revoke further permissions for this role.
    //   { from: appManager }
    // )
    // await acl.createPermission(
    //   ANY_ADDRESS,
    //   app.address,
    //   await app.DECREMENT_ROLE(),
    //   appManager,
    //   { from: appManager }
    // )

    voteToken = await MiniMeToken.new(
      ZERO_ADDRESS, // tokenFactory
      ZERO_ADDRESS, // parentToken
      0, // parentSnapShotBlock
      'VoteToken', // tokenName
      18, // decimalUnits
      'VOT', // tokenSymbol
      true // transfersEnabled
    )

    await app.initialize(voteToken.address)

    await voteToken.generateTokens(voter1, VOTER_BALANCE)
    await voteToken.generateTokens(voter2, VOTER_BALANCE)
  })

  it('has a vote token set', async () => {
    assert.equal(web3.isAddress(await app.voteToken()), true)
  })

  it('vote token total suply should be as expected', async () => {
    assert.equal((await voteToken.totalSupply()).toNumber(), 2 * VOTER_BALANCE)
  })

  describe('when creating proposals', () => {
    let proposalCreationReceipt1, proposalCreationReceipt2

    const proposalMetadata1 = 'Transfer 10000 dai from the DAO\'s vault to 0xb4124cEB3451635DAcedd11767f004d8a28c6eE7'
    const proposalMetadata2 = 'Mint 100 DAO tokens to 0xb4124cEB3451635DAcedd11767f004d8a28c6eE7'

    beforeEach('create some proposals', async () => {
      proposalCreationReceipt1 = await app.createProposal(proposalMetadata1, { from: creator1 })
      proposalCreationReceipt2 = await app.createProposal(proposalMetadata2, { from: creator2 })
    })

    it('should not allow a voter with no voting power to vote', async () => {
      await assertRevert(
        app.vote(0, true, { from: voter3 }),
        'HCVOTING_NO_VOTING_POWER'
      )
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

    describe('when voting on a proposal that does not exist', () => {
      it('should revert', async () => {
        await assertRevert(
          app.vote(2, true, { from: voter1 }),
          'HCVOTING_PROPOSAL_DOES_NOT_EXIST'
        )
      })
    })

    describe('when voting on proposals that exist', () => {

      let voteReceipt1, voteReceipt2, voteReceipt3, voteReceipt4

      beforeEach('cast some votes', async () => {
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
    })
  })
})
