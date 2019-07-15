const { 
  defaultSetup,
  ANY_ADDRESS,
  PRECISION_MULTIPLIER
} = require('./common.js');
const { EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript');

contract('HCVoting', accounts => {

  const [ 
    stakeHolder1, 
    stakeHolder2, 
    stakeHolder3, 
    stakeHolder4, 
    appManager
  ] = accounts;

  const HOLDER_1_BALANCE = 100;
  const HOLDER_2_BALANCE = 100;
  const HOLDER_3_BALANCE = 200;
  const HOLDER_4_BALANCE = 400;

  const INIFINITE_ALLOWANCE = 100000000000000000;

  describe('When boosting proposals', () => {

    beforeEach(async () => {
      await defaultSetup(this, appManager);

      await this.voteToken.generateTokens(ANY_ADDRESS, 999);

      await this.stakeToken.generateTokens(stakeHolder1, HOLDER_1_BALANCE);
      await this.stakeToken.generateTokens(stakeHolder2, HOLDER_2_BALANCE);
      await this.stakeToken.generateTokens(stakeHolder3, HOLDER_3_BALANCE);
      await this.stakeToken.generateTokens(stakeHolder4, HOLDER_4_BALANCE);

      await this.stakeToken.approve(this.app.address, INIFINITE_ALLOWANCE, { from: stakeHolder1 });
      await this.stakeToken.approve(this.app.address, INIFINITE_ALLOWANCE, { from: stakeHolder2 });
      await this.stakeToken.approve(this.app.address, INIFINITE_ALLOWANCE, { from: stakeHolder3 });
      await this.stakeToken.approve(this.app.address, INIFINITE_ALLOWANCE, { from: stakeHolder4 });

      await this.app.createProposal(EMPTY_SCRIPT, `Proposal message`);
    });
    
    it.only('Can retrieve a proposal\'s confidence factor', async () => {
      await this.app.stake(0, 200, true, { from: stakeHolder4 });
      await this.app.stake(0, 100, false, { from: stakeHolder2 });
      expect((await this.app.getConfidence(0)).toString()).to.equal(`${2 * PRECISION_MULTIPLIER}`);
    });

  });
});
