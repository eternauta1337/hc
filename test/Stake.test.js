const { 
  defaultSetup,
  ANY_ADDRESS
} = require('./common.js');
const { assertRevert } = require('@aragon/test-helpers/assertThrow');
const { EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript');

contract.only('HCVoting', accounts => {

  const [ 
    stakeHolder1, 
    stakeHolder2, 
    stakeHolder3, 
    appManager
  ] = accounts;

  const HOLDER_1_BALANCE = 100;
  const HOLDER_2_BALANCE = 100;
  const HOLDER_3_BALANCE = 100;

  const INIFINITE_ALLOWANCE = 100000000000000000;

  describe('When staking on proposals', () => {

    beforeEach(async () => {
      await defaultSetup(this, appManager);

      await this.voteToken.generateTokens(ANY_ADDRESS, 999);

      await this.stakeToken.generateTokens(stakeHolder1, HOLDER_1_BALANCE);
      await this.stakeToken.generateTokens(stakeHolder2, HOLDER_2_BALANCE);
      await this.stakeToken.generateTokens(stakeHolder3, HOLDER_3_BALANCE);

      await this.stakeToken.approve(this.app.address, INIFINITE_ALLOWANCE, { from: stakeHolder1 });
      await this.stakeToken.approve(this.app.address, INIFINITE_ALLOWANCE, { from: stakeHolder2 });
      await this.stakeToken.approve(this.app.address, INIFINITE_ALLOWANCE, { from: stakeHolder3 });

      await this.app.createProposal(EMPTY_SCRIPT, `Proposal message`);
    });

    it('Should reject staking on proposals that do not exist', async () => {
      await assertRevert(
        this.app.stake(999, 10, true, { from: stakeHolder1 }),
        `PROPOSAL_DOES_NOT_EXIST`
      );
    });

    it('Should not allow an account to stake more tokens that it holds', async () => {
      await assertRevert(
        this.app.stake(0, 10000, true, { from: stakeHolder1 }),
        `INSUFFICIENT_TOKENS`
      );
    });

  });
});
