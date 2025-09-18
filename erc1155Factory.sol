// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./Cardify1155.sol";

contract Cardify1155Factory is Ownable {
    address[] public allCollections;
    mapping(address => address[]) public collectionsByUser;
    mapping(address => bool) public isCardifyCollection;

    event CollectionDeployed(
        address indexed creator,
        address collection,
        uint256 mintPrice,
        uint256 maxSupply,
        string  name,
        string  symbol,
        address royaltyRecipient,
        uint96  royaltyBps
    );

    constructor() Ownable(msg.sender) {}

    /* ---------------------------------------------------------- */
    /*  External wrapper – user-friendly arg list                 */
    /* ---------------------------------------------------------- */
    function createCollection(
        string  calldata baseUri,
        uint256 mintPrice,
        uint256 maxSupply,
        string  calldata name_,
        string  calldata symbol_,
        string  calldata description,
        address royaltyRecipient,
        uint96  royaltyBps
    ) external returns (address collection) {
        require(royaltyRecipient != address(0), "Royalty 0x0");
        require(royaltyBps <= 10_000,           "Royalty > 100%");

        Cardify1155.InitParams memory p = Cardify1155.InitParams({
            baseUri:          baseUri,
            creator:          msg.sender,
            mintPrice:        mintPrice,
            maxSupply:        maxSupply,
            name:             name_,
            symbol:           symbol_,
            description:      description,
            royaltyRecipient: royaltyRecipient,
            royaltyBps:       royaltyBps
        });

        collection = address(new Cardify1155(p));

        allCollections.push(collection);
        collectionsByUser[msg.sender].push(collection);
        isCardifyCollection[collection] = true;

        emit CollectionDeployed(
            msg.sender,
            collection,
            mintPrice,
            maxSupply,
            name_,
            symbol_,
            royaltyRecipient,
            royaltyBps
        );
    }

    /* helpers */
    function getUserCollections(address u) external view returns (address[] memory) {
        return collectionsByUser[u];
    }
    function getAllCollections() external view returns (address[] memory) {
        return allCollections;
    }
    function totalCollections() external view returns (uint256) {
        return allCollections.length;
    }
}
