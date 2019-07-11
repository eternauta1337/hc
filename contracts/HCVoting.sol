pragma solidity ^0.5.0;

import "./SafeMath.sol";
import "./Token.sol";
import "./HCBase.sol";

contract HCVoting is HCBase {
    using SafeMath for uint256;

    // Token used for voting.
    Token public voteToken;

    // Percentage required for a vote to pass with either absolute or relative majority, e.g. 50%.
    uint256 public supportPct;

    // Events.
    event VoteCasted(uint256 indexed _proposalId, address indexed _voter, bool _supports, uint256 _stake);
    event ProposalLifetimeExtended(uint256 indexed _proposalId, uint256 _newLifetime);
  
    /*
     * External functions.
     */

    // TODO: Guard for only once calling.
    function initializeVoting(
        address _voteToken, 
        uint256 _supportPct,
        uint256 _queuePeriod,
        uint256 _boostPeriod,
        uint256 _quietEndingPeriod,
        uint256 _compensationFeePct
    ) 
        public
    {
        // TODO: Need to cast here or can have param type directly?
        voteToken = Token(_voteToken);

        // Validate and assign percentages.
        require(_supportPct >= 50, ERROR_INIT_SUPPORT_TOO_SMALL);
        require(_supportPct < 100, ERROR_INIT_SUPPORT_TOO_BIG);
        supportPct = _supportPct;

        // Assign periods.
        // TODO: Require min periods?
        queuePeriod = _queuePeriod;
        boostPeriod = _boostPeriod;
        quietEndingPeriod= _quietEndingPeriod;

        // Assign fees.
        // TODO: Contain?
        compensationFeePct = _compensationFeePct;
    }

    // TODO: Guard on who can vote?
    function vote(uint256 _proposalId, bool _supports) public {
        require(_proposalExists(_proposalId), ERROR_PROPOSAL_DOES_NOT_EXIST);
        require(_userHasVotingPower(msg.sender), ERROR_USER_HAS_NO_VOTING_POWER);
        // TODO: Different errors for these
        require(!_proposalStateIs(_proposalId, ProposalState.Expired), ERROR_PROPOSAL_IS_CLOSED);
        require(!_proposalStateIs(_proposalId, ProposalState.Resolved), ERROR_PROPOSAL_IS_CLOSED);


        // Get the user's voting power.
        uint256 votingPower = voteToken.balanceOf(msg.sender);

        // Has the user previously voted?
        Proposal storage proposal_ = proposals[_proposalId];
        VoteState previousVote = proposal_.votes[msg.sender];

        // TODO: Can be optimized, but be careful.
        // Clean up the user's previous vote, if existent.
        if(previousVote == VoteState.Yea) {
            proposal_.yea = proposal_.yea.sub(votingPower);
        }
        else if(previousVote == VoteState.Nay) {
            proposal_.nay = proposal_.nay.sub(votingPower);
        }

        // Update the user's vote in the proposal's yea/nay count.
        if(_supports) {
            proposal_.yea = proposal_.yea.add(votingPower);
        }
        else {
            proposal_.nay = proposal_.nay.add(votingPower);
        }

        // Update the user's vote state.
        proposal_.votes[msg.sender] = _supports ? VoteState.Yea : VoteState.Nay;

        emit VoteCasted(_proposalId,msg.sender, _supports, votingPower);

        // A vote can change the state of a proposal, e.g. resolving it.
        _updateProposalAfterVoting(_proposalId);
    }

    /*
     * Getters.
     */

    function getVote(uint256 _proposalId, address _voter) public view returns (VoteState) {
        require(_proposalExists(_proposalId), ERROR_PROPOSAL_DOES_NOT_EXIST);

        // Retrieve the voter's vote.
        Proposal storage proposal_ = proposals[_proposalId];
        return proposal_.votes[_voter];
    }

    /*
     * Internal functions.
     */

    function _updateProposalAfterVoting(uint256 _proposalId) internal {

        // Evaluate proposal resolution by absolute majority,
        // no matter if it is boosted or not.
        // Note: boosted proposals cannot auto-resolve.
        Proposal storage proposal_ = proposals[_proposalId];
        VoteState absoluteSupport = _calculateProposalAbsoluteSupport(proposal_);
        if(absoluteSupport == VoteState.Yea) {
            _updateProposalState(_proposalId, ProposalState.Resolved);
            return;
        }

        // If proposal is boosted, evaluate quiet endings
        // and possible extensions to its lifetime.
        if(proposal_.state == ProposalState.Boosted) {
            VoteState currentSupport = proposal_.lastRelativeSupport;
            VoteState newSupport = _calculateProposalRelativeSupport(proposal_);
            if(newSupport != currentSupport) {
                proposal_.lastRelativeSupportFlipDate = now;
                proposal_.lastRelativeSupport = newSupport;
                proposal_.lifetime = proposal_.lifetime.add(quietEndingPeriod);
                emit ProposalLifetimeExtended(_proposalId, proposal_.lifetime);
            }
        }
    }

    // TODO: HCBase?
    function _updateProposalState(uint256 _proposalId, ProposalState _newState) internal {
        Proposal storage proposal_ = proposals[_proposalId];
        if(proposal_.state != _newState) {
            proposal_.state = _newState;
            emit ProposalStateChanged(_proposalId, _newState);
        }
    }

    // TODO: A bit of duplicate code here
    function _calculateProposalAbsoluteSupport(Proposal storage proposal_) internal view returns(VoteState) {
        uint256 totalSupply = voteToken.totalSupply();
        uint256 yeaPct = _votesToPct(proposal_.yea, totalSupply);
        uint256 nayPct = _votesToPct(proposal_.nay, totalSupply);
        if(yeaPct > supportPct.mul(PRECISION_MULTIPLIER)) return VoteState.Yea;
        if(nayPct > supportPct.mul(PRECISION_MULTIPLIER)) return VoteState.Nay;
        return VoteState.Absent;
    }

    function _calculateProposalRelativeSupport(Proposal storage proposal_) internal view returns(VoteState) {
        uint256 totalVoted = proposal_.yea.add(proposal_.nay);
        uint256 yeaPct = _votesToPct(proposal_.yea, totalVoted);
        uint256 nayPct = _votesToPct(proposal_.nay, totalVoted);
        if(yeaPct > supportPct.mul(PRECISION_MULTIPLIER)) return VoteState.Yea;
        if(nayPct > supportPct.mul(PRECISION_MULTIPLIER)) return VoteState.Nay;
        return VoteState.Absent;
    }

    /*
     * Utility functions.
     */

    function _votesToPct(uint256 votes, uint256 totalVotes) internal pure returns (uint256) {
        return votes.mul(uint256(100).mul(PRECISION_MULTIPLIER)) / totalVotes;
    }

    function _userHasVotingPower(address _voter) internal view returns (bool) {
        return voteToken.balanceOf(_voter) > 0;
    }
}
