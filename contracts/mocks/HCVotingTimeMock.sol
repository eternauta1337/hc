pragma solidity ^0.4.24;

import "../HCVoting.sol";

import "@aragon/test-helpers/contracts/TimeHelpersMock.sol";


contract HCVotingTimeMock is HCVoting, TimeHelpersMock {}
