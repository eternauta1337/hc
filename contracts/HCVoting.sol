import "@aragon/os/contracts/apps/AragonApp.sol";


contract HCVoting is AragonApp {

    function initialize() public onlyInit {
        initialized();
    }
}
