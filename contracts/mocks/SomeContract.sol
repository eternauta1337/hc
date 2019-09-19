pragma solidity ^0.4.24;

contract SomeContract {
    uint256 public value;

    function setValue(uint256 _newValue) public {
        value = _newValue;
    }
}
