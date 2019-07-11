pragma solidity ^0.5.0;

import "./SafeMath.sol";
import "./Token.sol";
import "./HCVoting.sol";

contract HCStaking is HCVoting {
    using SafeMath for uint256;

    // Token used for staking on proposals.
    Token public stakeToken;

    // Confidence threshold.
    // A proposal can be boosted if it's confidence, determined by staking, is above this threshold.
    uint256 public confidenceThresholdBase;

    // Events.
    event UpstakeProposal(uint256 indexed _proposalId, address indexed _staker, uint256 _amount);
    event DownstakeProposal(uint256 indexed _proposalId, address indexed _staker, uint256 _amount);
    event WithdrawUpstake(uint256 indexed _proposalId, address indexed _staker, uint256 _amount);
    event WithdrawDownstake(uint256 indexed _proposalId, address indexed _staker, uint256 _amount);
    // TODO: Add an event for a proposal becoming boosted.

    /*
     * External functions.
     */

    // TODO: Guard for only once calling.
    function initializeStaking(
        Token _stakeToken, 
        uint256 _pendedBoostPeriod,
        uint256 _confidenceThresholdBase
    ) 
        public 
    {
        stakeToken = _stakeToken;
        // TODO: Check min pendendBoostPeriod?
        pendedBoostPeriod = _pendedBoostPeriod;
        confidenceThresholdBase = _confidenceThresholdBase;
    }

    function stake(uint256 _proposalId, uint256 _amount, bool _supports) public {
        require(_proposalExists(_proposalId), ERROR_PROPOSAL_DOES_NOT_EXIST);
        // TODO: Different errors for these
        require(!_proposalStateIs(_proposalId, ProposalState.Expired), ERROR_PROPOSAL_IS_CLOSED);
        require(!_proposalStateIs(_proposalId, ProposalState.Resolved), ERROR_PROPOSAL_IS_CLOSED);
        require(!_proposalStateIs(_proposalId, ProposalState.Boosted), ERROR_PROPOSAL_IS_BOOSTED);
        require(stakeToken.balanceOf(msg.sender) >= _amount, ERROR_SENDER_DOES_NOT_HAVE_ENOUGH_FUNDS);

        Proposal storage proposal_ = proposals[_proposalId];

        // Update the proposal's stake.
        if(_supports) proposal_.upstake = proposal_.upstake.add(_amount);
        else proposal_.downstake = proposal_.downstake.add(_amount);

        // Update the staker's stake amount.
        if(_supports) proposal_.upstakes[msg.sender] = proposal_.upstakes[msg.sender].add(_amount);
        else proposal_.downstakes[msg.sender] = proposal_.downstakes[msg.sender].add(_amount);

        // Extract the tokens from the sender and store them in this contract.
        // Note: This assumes that the sender has provided the required allowance to this contract.
        require(stakeToken.allowance(msg.sender, address(this)) >= _amount, ERROR_INSUFFICIENT_ALLOWANCE);
        stakeToken.transferFrom(msg.sender, address(this), _amount);

        // Emit corresponding event.
        if(_supports) emit UpstakeProposal(_proposalId, msg.sender, _amount);
        else emit DownstakeProposal(_proposalId, msg.sender, _amount);

        // A stake can change the state of a proposal.
        _updateProposalAfterStaking(_proposalId);
    }

    function unstake(uint256 _proposalId, uint256 _amount, bool _supports) public {
        require(_proposalExists(_proposalId), ERROR_PROPOSAL_DOES_NOT_EXIST);
        // TODO: Different errors for these
        require(!_proposalStateIs(_proposalId, ProposalState.Expired), ERROR_PROPOSAL_IS_CLOSED);
        require(!_proposalStateIs(_proposalId, ProposalState.Resolved), ERROR_PROPOSAL_IS_CLOSED);

        Proposal storage proposal_ = proposals[_proposalId];

        // Verify that the sender holds the required stake to be removed.
        if(_supports) require(proposal_.upstakes[msg.sender] >= _amount, ERROR_SENDER_DOES_NOT_HAVE_REQUIRED_STAKE);
        else require(proposal_.downstakes[msg.sender] >= _amount, ERROR_SENDER_DOES_NOT_HAVE_REQUIRED_STAKE);
        
        // Verify that the proposal has the required stake to be removed.
        if(_supports) require(proposal_.upstake >= _amount, ERROR_PROPOSAL_DOES_NOT_HAVE_REQUIRED_STAKE);
        else require(proposal_.downstake >= _amount, ERROR_PROPOSAL_DOES_NOT_HAVE_REQUIRED_STAKE);

        // Remove the stake from the proposal.
        if(_supports) proposal_.upstake = proposal_.upstake.sub(_amount);
        else proposal_.downstake = proposal_.downstake.sub(_amount);

        // Remove the stake from the sender.
        if(_supports) proposal_.upstakes[msg.sender] = proposal_.upstakes[msg.sender].sub(_amount);
        else proposal_.downstakes[msg.sender] = proposal_.downstakes[msg.sender].sub(_amount);

        // Return the tokens to the sender.
        require(stakeToken.balanceOf(address(this)) >= _amount, ERROR_VOTING_DOES_NOT_HAVE_ENOUGH_FUNDS);
        stakeToken.transfer(msg.sender, _amount);

        // Emit corresponding event.
        if(_supports) emit WithdrawUpstake(_proposalId, msg.sender, _amount);
        else emit WithdrawDownstake(_proposalId, msg.sender, _amount);

        // A stake can change the state of a proposal.
        _updateProposalAfterStaking(_proposalId);
    }

    /*
     * Getters.
     */

    function getUpstake(uint256 _proposalId, address _staker) public view returns (uint256) {
        require(_proposalExists(_proposalId), ERROR_PROPOSAL_DOES_NOT_EXIST);
        Proposal storage proposal_ = proposals[_proposalId];
        return proposal_.upstakes[_staker];
    }

    function getDownstake(uint256 _proposalId, address _staker) public view returns (uint256) {
        require(_proposalExists(_proposalId), ERROR_PROPOSAL_DOES_NOT_EXIST);
        Proposal storage proposal_ = proposals[_proposalId];
        return proposal_.downstakes[_staker];
    }

    function getConfidence(uint256 _proposalId) public view returns (uint256 _confidence) {
        require(_proposalExists(_proposalId), ERROR_PROPOSAL_DOES_NOT_EXIST);
        Proposal storage proposal_ = proposals[_proposalId];
        if(proposal_.downstake == 0) _confidence = proposal_.upstake.mul(PRECISION_MULTIPLIER);
        else _confidence = proposal_.upstake.mul(PRECISION_MULTIPLIER) / proposal_.downstake;
    }

    /*
     * Internal functions.
     */

    function _updateProposalAfterStaking(uint256 _proposalId) internal {

        // If the proposal has enough confidence and it was in queue or unpended, pend it.
		// If it doesn't, unpend it.
        Proposal storage proposal_ = proposals[_proposalId];
        if(_proposalHasEnoughConfidence(proposal_)) {
            if(proposal_.state == ProposalState.Queued || proposal_.state == ProposalState.Unpended) {
                proposal_.lastPendedDate = now;
                _updateProposalState(_proposalId, ProposalState.Pended);
            }
        }
		else {
			if(proposal_.state == ProposalState.Pended) {
                _updateProposalState(_proposalId, ProposalState.Unpended);
			}
		}

        // TODO: Shouldn't we be able to also automatically boost proposals here?
    }

    /*
     * Utility functions.
     */

    function _proposalHasEnoughConfidence(Proposal storage proposal_) internal view returns (bool _hasConfidence) {
        uint256 currentConfidence = getConfidence(proposal_.id);
        // TODO: The threshold should be elevated to the power of the number of currently boosted proposals.
        uint256 confidenceThreshold = confidenceThresholdBase.mul(PRECISION_MULTIPLIER);
        _hasConfidence = currentConfidence >= confidenceThreshold;
    }
}
