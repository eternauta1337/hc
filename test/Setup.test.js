const { 
  defaultSetup,
  SUPPORT_PERCENT,
  QUEUE_PERIOD_SECS,
  PENDED_BOOST_PERIOD_SECS,
  BOOST_PERIOD_SECS,
  QUIET_ENDING_PERIOD_SECS,
  COMPENSATION_FEE_PERCENT
} = require('./common.js');

contract('HCVoting', accounts => {

  describe('When deploying the app', () => {

    before(() => defaultSetup(this, accounts[0]));
    
    it('Tokens get deployed', async () => {
      expect(web3.isAddress(this.voteToken.address)).to.be.true;
      expect(web3.isAddress(this.stakeToken.address)).to.be.true;
    });

    it('Tokens are set correctly', async () => {
      expect((await this.app.voteToken()).toString()).to.equal(this.voteToken.address);
      expect((await this.app.stakeToken()).toString()).to.equal(this.stakeToken.address);
    });

    it('App gets deployed', async () => {
      expect(web3.isAddress(this.app.address)).to.equal(true);
    });

    it('App parameters are set correctly', async () => {
      expect((await this.app.supportPct()).toString()).to.equal(`${SUPPORT_PERCENT}`);
      expect((await this.app.queuePeriod()).toString()).to.equal(`${QUEUE_PERIOD_SECS}`);
      expect((await this.app.pendedBoostPeriod()).toString()).to.equal(`${PENDED_BOOST_PERIOD_SECS}`);
      expect((await this.app.boostPeriod()).toString()).to.equal(`${BOOST_PERIOD_SECS}`);
      expect((await this.app.quietEndingPeriod()).toString()).to.equal(`${QUIET_ENDING_PERIOD_SECS}`);
      expect((await this.app.compensationFeePct()).toString()).to.equal(`${COMPENSATION_FEE_PERCENT}`);
    });
  });
});
