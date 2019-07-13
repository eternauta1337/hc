const { 
  defaultSetup 
} = require('./common.js');
const { assertRevert } = require('@aragon/test-helpers/assertThrow');
const { EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript');

contract.only('HCVoting', [nonHolder, holder1, holder2, holder3, holder4, holder5, holder6, holder7, holder8 ] => {

  describe('When voting in a proposal', () => {

    before(() => defaultSetup(this, accounts[0]));

    beforeEach(async () => {

      await this.voteToken.generateTokens(holder1, 1);
      await this.voteToken.generateTokens(holder2, 1);
      await this.voteToken.generateTokens(holder3, 1);
      await this.voteToken.generateTokens(holder4, 10);
      await this.voteToken.generateTokens(holder5, 10);
      await this.voteToken.generateTokens(holder6, 10);
      await this.voteToken.generateTokens(holder7, 100);
      await this.voteToken.generateTokens(holder8, 100);
      await this.voteToken.generateTokens(holder9, 100);

      await this.app.createProposal(EMPTY_SCRIPT, `Proposal message`);
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

  });
});
