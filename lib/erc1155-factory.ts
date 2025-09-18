// ERC1155 Factory ABI and configuration
export const erc1155FactoryAbi = [
  {
    "inputs": [],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "OwnableInvalidOwner",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "OwnableUnauthorizedAccount",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "collection",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "mintPrice",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "maxSupply",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "symbol",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "royaltyRecipient",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint96",
        "name": "royaltyBps",
        "type": "uint96"
      }
    ],
    "name": "CollectionDeployed",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "baseUri",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "mintPrice",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "maxSupply",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "name_",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "symbol_",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "description",
        "type": "string"
      },
      {
        "internalType": "address",
        "name": "royaltyRecipient",
        "type": "address"
      },
      {
        "internalType": "uint96",
        "name": "royaltyBps",
        "type": "uint96"
      }
    ],
    "name": "createCollection",
    "outputs": [
      {
        "internalType": "address",
        "name": "collection",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "allCollections",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "collectionsByUser",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getAllCollections",
    "outputs": [
      {
        "internalType": "address[]",
        "name": "",
        "type": "address[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "u",
        "type": "address"
      }
    ],
    "name": "getUserCollections",
    "outputs": [
      {
        "internalType": "address[]",
        "name": "",
        "type": "address[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "isCardifyCollection",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalCollections",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const

export const getFactoryAddress = (): `0x${string}` => {
  if (typeof window !== 'undefined') {
    const collectionType = localStorage.getItem('collectionType')
    if (collectionType === 'erc1155') {
      return (process.env.NEXT_PUBLIC_FACTORY_ADDRESS_ERC1155 as `0x${string}`) || '0x0000000000000000000000000000000000000000'
    }
  }
  return (process.env.NEXT_PUBLIC_FACTORY_ADDRESS as `0x${string}`) || '0x0000000000000000000000000000000000000000'
}

export const getFactoryAbi = () => {
  if (typeof window !== 'undefined') {
    const collectionType = localStorage.getItem('collectionType')
    if (collectionType === 'erc1155') {
      return erc1155FactoryAbi
    }
  }
  // Return ERC721 factory ABI (existing)
  return [
    {
      name: "createCollection",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        { name: "name", type: "string" },
        { name: "symbol", type: "string" },
        { name: "price", type: "uint256" },
        { name: "royaltyRecipient", type: "address" },
        { name: "royaltyPercentage", type: "uint96" },
      ],
      outputs: [{ name: "collectionAddress", type: "address" }],
    },
    {
      name: "getUserCollections",
      type: "function",
      stateMutability: "view",
      inputs: [{ name: "user", type: "address" }],
      outputs: [{ type: "address[]" }],
    },
    {
      anonymous: false,
      name: "CollectionDeployed",
      type: "event",
      inputs: [
        { indexed: true, name: "creator", type: "address" },
        { indexed: false, name: "collectionAddress", type: "address" },
        { indexed: false, name: "name", type: "string" },
        { indexed: false, name: "symbol", type: "string" },
        { indexed: false, name: "mintPrice", type: "uint256" },
        { indexed: false, name: "royaltyRecipient", type: "address" },
        { indexed: false, name: "royaltyPercentage", type: "uint96" },
      ],
    },
  ] as const
}
