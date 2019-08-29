pragma solidity ^0.4.24;

contract ProposalBase {

    /* Errors */

    string internal constant ERROR_PROPOSAL_DOES_NOT_EXIST = "HCVOTING_PROPOSAL_DOES_NOT_EXIST";

    /* Data structures */

    enum Vote { Absent, Yea, Nay }

    struct Proposal {
        bool boosted;
        bool executed;
        bool resolved;
        uint64 creationDate;
        uint64 closeDate;
        uint64 pendedDate;
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

    /* Properties */

    mapping (uint256 => Proposal) proposals;
    uint256 public numProposals;

    /* Getters */

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

    function getProposalYeas(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.totalYeas;
    }

    function getProposalNays(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.totalNays;
    }

    function getProposalResolved(uint256 _proposalId) public view returns (bool) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.resolved;
    }

    function getProposalExecuted(uint256 _proposalId) public view returns (bool) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.executed;
    }

    function getProposalBoosted(uint256 _proposalId) public view returns (bool) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.boosted;
    }

    function getProposalCreationBlock(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.creationBlock;
    }

    function getProposalCreationDate(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.creationDate;
    }

    function getProposalCloseDate(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.closeDate;
    }

    function getProposalPendedDate(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.pendedDate;
    }

    function getProposalUpstake(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.totalUpstake;
    }

    function getProposalDownstake(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.totalDownstake;
    }

    function getProposalScript(uint256 _proposalId) public view returns (bytes) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.executionScript;
    }

    /* Internal */

    function _getProposal(uint256 _proposalId) internal view returns (Proposal storage) {
        require(_proposalId < numProposals, ERROR_PROPOSAL_DOES_NOT_EXIST);
        return proposals[_proposalId];
    }
}
