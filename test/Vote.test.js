const { 
  defaultSetup 
} = require('./common.js');
const { assertRevert } = require('@aragon/test-helpers/assertThrow');
const { EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript');

contract('HCVoting', accounts => {

  const [ 
    nonHolder, 
    holder1, 
    holder2, 
    holder3, 
    holder4, 
    holder5, 
    holder6,
    appManager
  ] = accounts;

  const HOLDER_1_BALANCE = 1;
  const HOLDER_2_BALANCE = 1;
  const HOLDER_3_BALANCE = 10;
  const HOLDER_4_BALANCE = 10;
  const HOLDER_5_BALANCE = 100;
  const HOLDER_6_BALANCE = 100;

  describe('When casting votes', () => {

    beforeEach(async () => {
      await defaultSetup(this, appManager);

      await this.voteToken.generateTokens(holder1, HOLDER_1_BALANCE);
      await this.voteToken.generateTokens(holder2, HOLDER_2_BALANCE);
      await this.voteToken.generateTokens(holder3, HOLDER_3_BALANCE);
      await this.voteToken.generateTokens(holder4, HOLDER_4_BALANCE);
      await this.voteToken.generateTokens(holder5, HOLDER_5_BALANCE);
      await this.voteToken.generateTokens(holder6, HOLDER_6_BALANCE);

      await this.app.createProposal(EMPTY_SCRIPT, `Proposal message 1`);
      await this.app.createProposal(EMPTY_SCRIPT, `Proposal message 2`);
    });
    
    it('Should reject voting from accounts that do not own vote tokens', async () => {
      await assertRevert(
        this.app.vote(0, true, { from: nonHolder }),
        `INSUFFICIENT_TOKENS`
      );
    });

    it('Should reject voting on proposals that do not exist', async () => {
      await assertRevert(
        this.app.vote(999, true, { from: holder1 }),
        `PROPOSAL_DOES_NOT_EXIST`
      );
    });

    it('Should emit events when votes are made', async () => {

      let receipt, event;

      receipt = await this.app.vote(0, true, { from: holder1 });
      event = receipt.logs.filter(l => l.event === 'VoteCasted')[0];
      expect(event).to.be.an('object');
      expect(event.args._proposalId.toString()).to.equal(`0`);
      expect(event.args._voter).to.equal(holder1);
      expect(event.args._supports).to.equal(true);
      expect(event.args._stake.toString()).to.equal(`${HOLDER_1_BALANCE}`);

      receipt = await this.app.vote(1, false, { from: holder3 });
      event = receipt.logs.filter(l => l.event === 'VoteCasted')[0];
      expect(event).to.be.an('object');
      expect(event.args._proposalId.toString()).to.equal(`1`);
      expect(event.args._voter).to.equal(holder3);
      expect(event.args._supports).to.equal(false);
      expect(event.args._stake.toString()).to.equal(`${HOLDER_3_BALANCE}`);
    });

    it('Should keep track of total # of yeas/nays in a proposal', async () => {

      await this.app.vote(0, true,  { from: holder1 });
      await this.app.vote(0, false, { from: holder2 });
      await this.app.vote(0, false, { from: holder3 });
      await this.app.vote(0, false, { from: holder4 });
      await this.app.vote(0, true,  { from: holder5 });
      await this.app.vote(0, true,  { from: holder6 });

      const [ yea, nay ] = await this.app.getProposalVotes(0);
      expect(yea.toString()).to.equal(`${HOLDER_1_BALANCE + HOLDER_5_BALANCE + HOLDER_6_BALANCE}`);
      expect(nay.toString()).to.equal(`${HOLDER_2_BALANCE + HOLDER_3_BALANCE + HOLDER_4_BALANCE}`);
    });

    it('Should keep track of support per voter on a proposal', async () => {

      // Note: holder 1 is not voting
      await this.app.vote(0, false, { from: holder2 });
      await this.app.vote(0, false, { from: holder3 });
      await this.app.vote(0, false, { from: holder4 });
      await this.app.vote(0, true,  { from: holder5 });
      await this.app.vote(0, true,  { from: holder6 });

      expect((await this.app.getUserVote(0, nonHolder)).toString()).to.equal(`0`);
      expect((await this.app.getUserVote(0, holder1)).toString()).to.equal(`0`);
      expect((await this.app.getUserVote(0, holder2)).toString()).to.equal(`2`);
      expect((await this.app.getUserVote(0, holder3)).toString()).to.equal(`2`);
      expect((await this.app.getUserVote(0, holder4)).toString()).to.equal(`2`);
      expect((await this.app.getUserVote(0, holder5)).toString()).to.equal(`1`);
      expect((await this.app.getUserVote(0, holder6)).toString()).to.equal(`1`);
    });

    it('Should allow a voter to change it\'s vote from yea to nay and viceversa', async () => {

      await this.app.vote(0, true, { from: holder1 });
      expect((await this.app.getUserVote(0, holder1)).toString()).to.equal(`1`);
      await this.app.vote(0, false, { from: holder1 });
      expect((await this.app.getUserVote(0, holder1)).toString()).to.equal(`2`);

      await this.app.vote(0, false, { from: holder2 });
      expect((await this.app.getUserVote(0, holder1)).toString()).to.equal(`2`);
      await this.app.vote(0, true, { from: holder2 });
      expect((await this.app.getUserVote(0, holder2)).toString()).to.equal(`1`);
    });

    it('Should not allow an attack in which a vote token holder votes and moves the tokens to another account to vote again', async () => {

      // 1st vote.
      await this.app.vote(0, true, { from: holder1 });
      let [ yea, nay ] = await this.app.getProposalVotes(0);
      expect(yea.toString()).to.equal(`${HOLDER_1_BALANCE}`);

      // Transfer to another account.
      await this.voteToken.transfer(nonHolder, HOLDER_1_BALANCE, { from: holder1 });
      const nonHolderBalance = (await this.voteToken.balanceOf(nonHolder)).toString();
      expect(nonHolderBalance).to.equal(`${HOLDER_1_BALANCE}`);

      // 2nd vote (with the same tokens).
      await assertRevert(
        this.app.vote(0, true, { from: nonHolder }),
        `INSUFFICIENT_TOKENS`
      );
    });

  });
});
