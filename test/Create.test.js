const { 
  defaultSetup,
  QUEUE_PERIOD_SECS,
  ANY_ADDRESS
} = require('./common.js');
const { EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript');
const { assertRevert } = require('@aragon/test-helpers/assertThrow');

contract('HCVoting', ([appManager, proposalCreator]) => {

  describe('When creating proposals', () => {

    const proposalCreationReceipts = [];
    const proposalCreationDates = [];
    const NUM_PROPOSALS = 8;

    beforeEach(() => defaultSetup(this, appManager));

    describe('When there is no existing vote token supply', () => {
      it('Proposal creation should be rejected', async () => {
        await assertRevert(
          this.app.createProposal(EMPTY_SCRIPT, `Proposal message`),
          `INSUFFICIENT_TOKENS`
        );
      });
    });

    describe('When a supply of vote tokens exists', () => {
      
      beforeEach(async () => {

        await this.voteToken.generateTokens(ANY_ADDRESS, 999);

        for(let i = 0; i < NUM_PROPOSALS; i++) {
          const receipt = await this.app.createProposal(
            EMPTY_SCRIPT, 
            `Proposal message ${i}`,
            { from: proposalCreator }
          );
          proposalCreationReceipts.push(receipt);
          proposalCreationDates.push(new Date().getTime() / 1000);
        }
      });

      it('numProposals should be set to the number of proposals created', async () => {
        expect((await this.app.numProposals()).toString()).to.equal(`${NUM_PROPOSALS}`);
      });

      it('ProposalCreated events should have been emitted', async () => {
        for(let i = 0; i < NUM_PROPOSALS; i++) {
          const receipt = proposalCreationReceipts[i];
          const event = receipt.logs.filter(l => l.event === 'ProposalCreated')[0];
          expect(event).to.be.an('object');
          expect(event.args._proposalId.toString()).to.equal(`${i}`);
          expect(event.args._creator).to.equal(proposalCreator);
          expect(event.args._metadata.toString()).to.equal(`Proposal message ${i}`);
        }
      });

      it('Proposals created should be retrievable and be apropriately setup', async () => {
        for(let i = 0; i < NUM_PROPOSALS; i++) {
          const [
            snapshotBlock,
            lifetime,
            startDate,
            lastPendedDate,
            lastRelativeSupportFlipDate
          ] = await this.app.getProposalTimeInfo(i);
          const startDateDeltaSecs = proposalCreationDates[i] - parseInt(startDate.toString(), 10);
          expect(startDateDeltaSecs).to.be.below(2);
          expect(lifetime.toString()).to.equal(`${QUEUE_PERIOD_SECS}`);
        }
      });

    });
  });
});
