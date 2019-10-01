pragma solidity ^0.4.24;

contract ProposalBase {

    /* ERRORS */

    string internal constant ERROR_PROPOSAL_DOES_NOT_EXIST = "HCVOTING_PROPOSAL_DOES_NOT_EXIST";

    /* DATA STRUCURES */

    enum Vote {
        Absent, // 0 -- default
        Yea,
        Nay
    }

    struct Proposal {
        bool executed;
        bool resolved;
        uint64 creationDate;
        uint64 closeDate;
        uint64 creationBlock;
        uint256 totalYeas;
        uint256 totalNays;
        uint256 totalUpstake;
        uint256 totalDownstake;
        bytes executionScript;
        mapping (address => Vote) votes;
        mapping (address => uint256) upstakes;
        mapping (address => uint256) downstakes;
    }

    /* PROPERTIES */

    mapping (uint256 => Proposal) proposals;
    uint256 public numProposals;

    /* GETTERS */

    function getUserVote(uint256 _proposalId, address _user) public view returns (Vote) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.votes[_user];
    }

    function getUserUpstake(uint256 _proposalId, address _user) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.upstakes[_user];
    }

    function getUserDownstake(uint256 _proposalId, address _user) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.downstakes[_user];
    }

    function getTotalUpstake(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.totalUpstake;
    }

    function getTotalDownstake(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.totalDownstake;
    }

    function getTotalYeas(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.totalYeas;
    }

    function getTotalNays(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.totalNays;
    }

    function getResolved(uint256 _proposalId) public view returns (bool) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.resolved;
    }

    function getExecuted(uint256 _proposalId) public view returns (bool) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.executed;
    }

    function getCreationBlock(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.creationBlock;
    }

    function getCreationDate(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.creationDate;
    }

    function getScript(uint256 _proposalId) public view returns (bytes) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.executionScript;
    }

    /* INTERNAL */

    function _getProposal(uint256 _proposalId) internal view returns (Proposal storage) {
        require(_proposalId < numProposals, ERROR_PROPOSAL_DOES_NOT_EXIST);
        return proposals[_proposalId];
    }
}
