pragma solidity ^0.4.24;

import "./HCStaking.sol";

contract HCCompensations is HCStaking {

    /*
     * External functions.
     */

    function resolveBoostedProposal(uint256 _proposalId) public {
        require(_proposalExists(_proposalId), ERROR_PROPOSAL_DOES_NOT_EXIST);

        Proposal storage proposal_ = proposals[_proposalId];
        require(proposal_.state == ProposalState.Boosted, ERROR_PROPOSAL_IS_NOT_BOOSTED);

        // Verify that the proposal lifetime has ended.
        require(now >= proposal_.startDate.add(proposal_.lifetime), ERROR_PROPOSAL_IS_ACTIVE);

        // Compensate the caller.
        uint256 fee = _calculateCompensationFee(_proposalId, proposal_.startDate.add(proposal_.lifetime));
        require(stakeToken.balanceOf(address(this)) >= fee, ERROR_INSUFFICIENT_TOKENS);
        stakeToken.transfer(msg.sender, fee);

        // Resolve the proposal.
        _updateProposalState(_proposalId, ProposalState.Resolved);
        _executeProposal(proposal_);
    }

    function expireNonBoostedProposal(uint256 _proposalId) public {
        require(_proposalExists(_proposalId), ERROR_PROPOSAL_DOES_NOT_EXIST);

        Proposal storage proposal_ = proposals[_proposalId];
        require(proposal_.state != ProposalState.Boosted, ERROR_PROPOSAL_IS_BOOSTED);
        require(proposal_.state != ProposalState.Expired, ERROR_PROPOSAL_IS_CLOSED);

        // Verify that the proposal's lifetime has ended.
        require(now >= proposal_.startDate.add(proposal_.lifetime), ERROR_PROPOSAL_IS_ACTIVE);

        // Compensate the caller.
        uint256 fee = _calculateCompensationFee(_proposalId, proposal_.startDate.add(proposal_.lifetime));
        require(stakeToken.balanceOf(address(this)) >= fee, ERROR_INSUFFICIENT_TOKENS);
        stakeToken.transfer(msg.sender, fee);

        // Update the proposal's state and emit an event.
        _updateProposalState(_proposalId, ProposalState.Expired);
    }

    function boostProposal(uint256 _proposalId) public {
        require(_proposalExists(_proposalId), ERROR_PROPOSAL_DOES_NOT_EXIST);

        Proposal storage proposal_ = proposals[_proposalId];
        require(proposal_.state != ProposalState.Expired, ERROR_PROPOSAL_IS_CLOSED);
        require(proposal_.state != ProposalState.Resolved, ERROR_PROPOSAL_IS_CLOSED);
        require(proposal_.state != ProposalState.Boosted, ERROR_PROPOSAL_IS_BOOSTED);

        // Require that the proposal is currently pended.
        require(proposal_.state == ProposalState.Pended);

        // Require that the proposal has had enough confidence for a period of time.
        require(_proposalHasEnoughConfidence(_proposalId), ERROR_PROPOSAL_DOESNT_HAVE_ENOUGH_CONFIDENCE);
        require(now >= proposal_.lastPendedDate.add(pendedBoostPeriod), ERROR_PROPOSAL_HASNT_HAD_CONFIDENCE_ENOUGH_TIME);

        // Compensate the caller.
        uint256 fee = _calculateCompensationFee(_proposalId, proposal_.lastPendedDate.add(pendedBoostPeriod));
        require(stakeToken.balanceOf(address(this)) >= fee, ERROR_INSUFFICIENT_TOKENS);
        stakeToken.transfer(msg.sender, fee);

        // Boost the proposal.
        _updateProposalState(_proposalId, ProposalState.Boosted);
        proposal_.lifetime = boostPeriod;
    }

    /*
     * Utility functions.
     */

    function _calculateCompensationFee(uint256 _proposalId, uint256 _cutoffDate) internal view returns(uint256 _fee) {

        // Require that the proposal has potentially expired.
        // This is necessary because the fee depends on the time since expiration.
        // If the proposal hasn't expired, the calculation would yield a negative fee.
        Proposal storage proposal_ = proposals[_proposalId];

        // Calculate fee.
        /* 
           fee
           ^
           |     ___________ max = compensationFeePct * total upstake
           |    /
           |   /
           |  /
           | /
           |/______________> time elapsed since resolution
        */
        // Note: this assumes that now > _cutoffDate, and it is the responsibility of the calling function to verify that.
        _fee = now.sub(_cutoffDate).div(compensationFeePct);
        uint256 max = proposal_.upstake.mul(PRECISION_MULTIPLIER).div(compensationFeePct);
        if(_fee.mul(PRECISION_MULTIPLIER) > max) _fee = max.div(PRECISION_MULTIPLIER);
    }
}
