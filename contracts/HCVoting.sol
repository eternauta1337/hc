pragma solidity ^0.4.24;

import "@aragon/os/contracts/apps/AragonApp.sol";

import "@aragon/os/contracts/lib/math/SafeMath.sol";

import "@aragon/apps-shared-minime/contracts/MiniMeToken.sol";


contract HCVoting is AragonApp {
    using SafeMath for uint256;

    /* ERRORS */

    string internal constant ERROR_PROPOSAL_DOES_NOT_EXIST = "HCVOTING_PROPOSAL_DOES_NOT_EXIST";
    string internal constant ERROR_ALREADY_VOTED           = "HCVOTING_ALREADY_VOTED";
    string internal constant ERROR_NO_VOTING_POWER         = "HCVOTING_NO_VOTING_POWER";

    /* DATA STRUCURES */

    enum Vote {
        Absent, // 0 -- default
        Yea,
        Nay
    }

    struct Proposal {
        uint256 totalYeas;
        uint256 totalNays;
        mapping (address => Vote) votes;
    }

    /* PROPERTIES */

    MiniMeToken public voteToken;

    mapping (uint256 => Proposal) proposals;
    uint256 public numProposals;

    /* EVENTS */

    event ProposalCreated(uint256 proposalId, address creator, string metadata);
    event VoteCasted(uint256 proposalId, address voter, bool supports);

    /* INIT */

    function initialize(MiniMeToken _voteToken) public onlyInit {
        initialized();

        voteToken = _voteToken;
    }

    /* PUBLIC */

    function propose(string _metadata) public {
        emit ProposalCreated(numProposals, msg.sender, _metadata);
        numProposals++;
    }

    function vote(uint256 _proposalId, bool _supports) public {
        Proposal storage proposal_ = _getProposal(_proposalId);

        uint256 userVotingPower = voteToken.balanceOf(msg.sender);
        require(userVotingPower > 0, ERROR_NO_VOTING_POWER);

        // Reject re-voting.
        require(getUserVote(_proposalId, msg.sender) == Vote.Absent, ERROR_ALREADY_VOTED);

        // Update user Vote and totalYeas/totalNays.
        if (_supports) {
            proposal_.totalYeas = proposal_.totalYeas.add(userVotingPower);
        } else {
            proposal_.totalNays = proposal_.totalNays.add(userVotingPower);
        }
        proposal_.votes[msg.sender] = _supports ? Vote.Yea : Vote.Nay;

        emit VoteCasted(_proposalId, msg.sender, _supports);
    }

    /* GETTERS */

    function getUserVote(uint256 _proposalId, address _user) public view returns (Vote) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.votes[_user];
    }

    function getTotalYeas(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.totalYeas;
    }

    function getTotalNays(uint256 _proposalId) public view returns (uint256) {
        Proposal storage proposal_ = _getProposal(_proposalId);
        return proposal_.totalNays;
    }

    /* INTERNAL */

    function _getProposal(uint256 _proposalId) internal view returns (Proposal storage) {
        require(_proposalId < numProposals, ERROR_PROPOSAL_DOES_NOT_EXIST);
        return proposals[_proposalId];
    }
}
