// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract Cardify1155 is ERC1155, ERC2981, Ownable {
    using Strings for uint256;

    /* ------------------------- struct to reduce stack ------------------------- */
    struct InitParams {
        string  baseUri;
        address creator;
        uint256 mintPrice;
        uint256 maxSupply;
        string  name;
        string  symbol;
        string  description;
        address royaltyRecipient;
        uint96  royaltyBps;          // in basis points, 10_000 = 100%
    }

    string  public name;
    string  public symbol;
    string  public description;

    string  public baseUri;
    uint256 public immutable mintPrice;
    uint256 public immutable maxSupply;
    uint256 public totalMinted;

    mapping(bytes32 => bool) public validCodes;
    mapping(bytes32 => bool) public usedCodes;

    event NFTMinted(address indexed to, uint256 indexed id, string code);
    event CodesAdded(uint256 count);

    constructor(InitParams memory p)
        ERC1155("")
        Ownable(p.creator)
    {
        require(p.royaltyBps <= 10_000, "Royalty too high");
        require(p.maxSupply > 0,        "Supply = 0");

        baseUri     = p.baseUri;
        mintPrice   = p.mintPrice;
        maxSupply   = p.maxSupply;
        name        = p.name;
        symbol      = p.symbol;
        description = p.description;

        _setDefaultRoyalty(p.royaltyRecipient, p.royaltyBps);
    }

    /* ───────── creator admin ───────── */
    function addValidCodes(bytes32[] calldata hashes) external onlyOwner {
        for (uint256 i; i < hashes.length; ++i) {
            validCodes[hashes[i]] = true;
        }
        emit CodesAdded(hashes.length);
    }

    function setBaseUri(string calldata newBase) external onlyOwner {
        baseUri = newBase;
    }

    function withdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    /* ──────────── minting ──────────── */
    function redeemWithCode(string calldata code) external payable {
        require(msg.value >= mintPrice,   "Insufficient ETH");
        require(totalMinted < maxSupply,  "Sold out");

        bytes32 h = keccak256(abi.encodePacked(code));
        require(validCodes[h] && !usedCodes[h], "Invalid or used");

        usedCodes[h] = true;
        delete validCodes[h];

        uint256 id = totalMinted; // 0,1,2,…
        _mint(msg.sender, id, 1, "");
        emit NFTMinted(msg.sender, id, code);

        unchecked { ++totalMinted; }

        // Forward funds immediately. You also have withdraw() for residuals.
        payable(owner()).transfer(msg.value);
    }

    /* ────────── metadata ────────── */
    function uri(uint256) public view override returns (string memory) {
        return baseUri; // single URI for all tokens (your original behavior)
    }

    function supportsInterface(bytes4 iid)
        public
        view
        override(ERC1155, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(iid);
    }
}
