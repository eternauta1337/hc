const { 
  deployDAOFactory,
  deployDAO,
  deployTokens,
  deployApp
} = require('./common.js');

const HOURS = 60 * 60;
const SUPPORT_PERCENT = 51;
const QUEUE_PERIOD_SECS = 24 * HOURS;
const PENDED_BOOST_PERIOD_SECS = 1 * HOURS;
const BOOST_PERIOD_SECS = 6 * HOURS;
const QUIET_ENDING_PERIOD_SECS = 1 * HOURS;
const COMPENSATION_FEE_PERCENT = 10;
const CONFIDENCE_THRESHOLD_BASE = 4;

contract('HCVoting', accounts => {

  describe('When deploying the app', () => {

    beforeEach(async () => {
      await deployDAOFactory(this);
      await deployDAO(this, accounts[0]);
      await deployApp(this, accounts[0]);
      await deployTokens(this);
      await this.app.initialize(
        this.voteToken.address, 
        this.stakeToken.address, 
        SUPPORT_PERCENT,
        QUEUE_PERIOD_SECS,
        BOOST_PERIOD_SECS,
        QUIET_ENDING_PERIOD_SECS,
        PENDED_BOOST_PERIOD_SECS,
        COMPENSATION_FEE_PERCENT,
        CONFIDENCE_THRESHOLD_BASE
      );
    });

    it('Tokens get deployed correctly', async () => {
      expect(web3.isAddress(this.voteToken.address)).to.be.true;
      expect(web3.isAddress(this.stakeToken.address)).to.be.true;
    });

    it('Voting gets deployed and set up correctly', async () => {
      expect(web3.isAddress(this.app.address)).to.equal(true);
      expect((await this.app.supportPct()).toString()).to.equal(`${SUPPORT_PERCENT}`);
      expect((await this.app.queuePeriod()).toString()).to.equal(`${QUEUE_PERIOD_SECS}`);
      expect((await this.app.pendedBoostPeriod()).toString()).to.equal(`${PENDED_BOOST_PERIOD_SECS}`);
      expect((await this.app.boostPeriod()).toString()).to.equal(`${BOOST_PERIOD_SECS}`);
      expect((await this.app.quietEndingPeriod()).toString()).to.equal(`${QUIET_ENDING_PERIOD_SECS}`);
      expect((await this.app.compensationFeePct()).toString()).to.equal(`${COMPENSATION_FEE_PERCENT}`);
    });
  });
});
