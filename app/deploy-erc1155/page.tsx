'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePrivy } from '@privy-io/react-auth'
import { useReadContract, useWriteContract, useWalletClient, useAccount, usePublicClient, useConnect } from 'wagmi'
import { parseEther, formatEther, keccak256, encodePacked, decodeEventLog } from 'viem'
import { getFactoryAddress, getFactoryAbi } from '@/lib/erc1155-factory'
import axios from 'axios'

const pinataJWT = process.env.NEXT_PUBLIC_PINATA_JWT!

export default function DeployERC1155Page() {
  const router = useRouter()
  const { authenticated, user, logout } = usePrivy()
  const { isConnected, address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient()
  const { connect, connectors, isPending: isConnecting } = useConnect()

  // Form state
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [description, setDescription] = useState('')
  const [mintPrice, setMintPrice] = useState('0')
  const [maxSupply, setMaxSupply] = useState('1000')
  const [royaltyRecipient, setRoyaltyRecipient] = useState('')
  const [royaltyBps, setRoyaltyBps] = useState('500')
  const [image, setImage] = useState<File | null>(null)
  
  // Processing state
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStatus, setProcessingStatus] = useState('')
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([])
  const [txHash, setTxHash] = useState<string | null>(null)

  // Redirect if not authenticated
  if (!authenticated) {
    router.push('/')
    return null
  }

  // Auto-populate royalty recipient when wallet connects
  useEffect(() => {
    if (isConnected && address) {
      setRoyaltyRecipient(address)
    }
  }, [isConnected, address])

  // Helper functions
  const generateRandomCode = (length: number) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  const encodeIndex = (index: number): string => {
    return index.toString(36).padStart(2, '0')
  }

  const generateCodes = (count: number) => {
    const codes: string[] = []
    for (let i = 0; i < count; i++) {
      const randomPart = generateRandomCode(6)
      const indexPart = encodeIndex(i)
      const finalCode = randomPart + indexPart
      codes.push(finalCode)
    }
    setGeneratedCodes(codes)
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImage(e.target.files[0])
    }
  }

  const connectWallet = async () => {
    try {
      const preferred = connectors[0]
      await connect({ connector: preferred })
    } catch (e) {
      alert("Could not connect wallet")
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isConnected || !walletClient || !publicClient) {
      alert("Wallet or client not ready")
      return
    }

    try {
      setIsProcessing(true)
      setProcessingStatus("🚀 Deploying ERC1155 collection...")

      // Get factory configuration
      const factoryAddress = getFactoryAddress()
      const factoryAbi = getFactoryAbi()

      // Deploy collection contract
      const txHash = await writeContractAsync({
        account: walletClient.account,
        address: factoryAddress,
        abi: factoryAbi,
        functionName: "createCollection",
        args: [
          "ipfs://", // baseUri - will be updated later
          BigInt(parseEther(mintPrice || "0")), // mintPrice
          BigInt(maxSupply || "1000"), // maxSupply
          name,
          symbol,
          description || `Collection: ${name}`, // description
          royaltyRecipient as `0x${string}`,
          BigInt(royaltyBps || "500"),
        ],
      })

      setProcessingStatus("⏳ Waiting for transaction confirmation...")
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })

      // Extract collection address from event using viem's decodeEventLog
      const eventAbi = {
        "anonymous": false,
        "inputs": [
          { "indexed": true, "internalType": "address", "name": "creator", "type": "address" },
          { "indexed": false, "internalType": "address", "name": "collection", "type": "address" },
          { "indexed": false, "internalType": "uint256", "name": "mintPrice", "type": "uint256" },
          { "indexed": false, "internalType": "uint256", "name": "maxSupply", "type": "uint256" },
          { "indexed": false, "internalType": "string", "name": "name", "type": "string" },
          { "indexed": false, "internalType": "string", "name": "symbol", "type": "string" },
          { "indexed": false, "internalType": "address", "name": "royaltyRecipient", "type": "address" },
          { "indexed": false, "internalType": "uint96", "name": "royaltyBps", "type": "uint96" }
        ],
        "name": "CollectionDeployed",
        "type": "event"
      }

      const decodedEvents = receipt.logs
        .map(log => {
          try {
            return decodeEventLog({
              abi: [eventAbi],
              data: log.data,
              topics: log.topics,
            })
          } catch {
            return null
          }
        })
        .filter(Boolean)

      if (decodedEvents.length === 0) {
        throw new Error("CollectionDeployed event not found")
      }

      const collectionAddress = (decodedEvents[0] as any).args.collection as `0x${string}`
      
      console.log('Extracted collection address:', collectionAddress)

      setProcessingStatus("💾 Saving collection data...")
      await fetch("/api/collections", {
        method: "POST",
        body: JSON.stringify({
          address: collectionAddress.toLowerCase(),
          owner: walletClient.account.address.toLowerCase(),
          collection_type: 'erc1155',
        }),
      })

      // Process image and generate codes if provided
      if (image) {
        setProcessingStatus("📤 Processing image and generating codes...")
        
        // Upload image to IPFS
        const fd = new FormData()
        fd.append('file', image, image.name)
        const { data: imageData } = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', fd, {
          headers: { Authorization: `Bearer ${pinataJWT}` },
        })
        const imageCID = `ipfs://${imageData.IpfsHash}`

        // Generate codes based on max supply
        const nftCount = parseInt(maxSupply)
        
        // Generate codes & hashes locally (Patch ①)
        const codesLocal = Array.from({ length: nftCount }, (_, i) => {
          const randomPart = generateRandomCode(6)
          const indexPart = i.toString().padStart(2, '0')
          return randomPart + indexPart
        })

        // Update state for UI display
        setGeneratedCodes(codesLocal)

        // Create single metadata file for ERC1155 (shared by all NFTs)
        setProcessingStatus("📝 Creating metadata...")
        const meta = {
          name: name,
          description: description || `ERC1155 NFT collection: ${name}`,
          image: imageCID,
          attributes: [
            { trait_type: "Collection", value: name },
            { trait_type: "Type", value: "ERC1155" },
            { trait_type: "Max Supply", value: nftCount.toString() }
          ]
        }

        const metaFD = new FormData()
        metaFD.append('file', new Blob([JSON.stringify(meta)], { type: 'application/json' }), 'metadata.json')
        metaFD.append('pinataMetadata', JSON.stringify({ name: 'erc1155-metadata' }))
        // REMOVED wrapWithDirectory - single file = no folder needed

        const metaRes = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', metaFD, {
          headers: { Authorization: `Bearer ${pinataJWT}` },
        })
        const cid: string = metaRes.data.IpfsHash
        
        console.log('Metadata CID:', cid)
        console.log('Metadata response:', metaRes.data)

        // Generate hashes for codes (Patch ② - only hash the code)
        setProcessingStatus("🔐 Generating hashes...")
        const hashes = codesLocal.map(code =>
          keccak256(encodePacked(['string'], [code])),
        )

        // Save collection with CID and codes
        console.log('Updating collection with CID:', cid)
        const updateData = { 
          cid, 
          owner: walletClient.account.address.toLowerCase(),
          codes: codesLocal,
          hashes: hashes,
          total_nfts: nftCount,
          collection_type: 'erc1155' // ✅ Add collection type to prevent null constraint violation
        }
        console.log('Update data being sent:', updateData)
        console.log('Collection type included:', updateData.collection_type)
        console.log('Full update data JSON:', JSON.stringify(updateData, null, 2))
        
        const updateResponse = await fetch(`/api/collections/${collectionAddress.toLowerCase()}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData),
        })
        
        if (!updateResponse.ok) {
          const errorData = await updateResponse.text()
          console.error('Failed to update collection:', errorData)
          throw new Error(`Failed to update collection: ${errorData}`)
        }
        
        console.log('Collection updated successfully')

        // Save individual codes to the nft_codes table
        const codesData = codesLocal.map((code, i) => ({
          code,
          hash: hashes[i],
          token_id: i, // ERC1155 token IDs start from 0
          metadata_uri: `ipfs://${cid}` // ✅ Direct CID - matches contract baseUri
        }))

        const codesResponse = await fetch(`/api/collections/${collectionAddress.toLowerCase()}/codes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codes: codesData }),
        })
        
        if (!codesResponse.ok) {
          const errorData = await codesResponse.text()
          console.error('Failed to save codes:', errorData)
          throw new Error(`Failed to save codes: ${errorData}`)
        }
        
        console.log('Codes saved successfully')

        // Add hashes to contract
        setProcessingStatus("⛓️ Adding hashes to smart contract...")
        await writeContractAsync({
          address: collectionAddress,
          abi: [{ name: 'addValidCodes', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'hashes', type: 'bytes32[]' }], outputs: [] }],
          functionName: 'addValidCodes',
          args: [hashes],
        })

        // Update baseUri to point directly to the CID (no folder structure)
        setProcessingStatus("🔗 Updating contract base URI...")
        await writeContractAsync({
          address: collectionAddress,
          abi: [{ name: 'setBaseUri', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'newBase', type: 'string' }], outputs: [] }],
          functionName: 'setBaseUri',
          args: [`ipfs://${cid}`], // ✅ Direct CID - noimage.png path needed
        })

        setProcessingStatus("✅ ERC1155 collection deployed and processed successfully!")
      } else {
        setProcessingStatus("✅ ERC1155 collection deployed successfully!")
      }

      setTxHash(txHash)
      
    } catch (error: any) {
      console.error(error)
      setProcessingStatus("❌ Error: " + (error.message || "Something went wrong"))
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-fuchsia-50 via-white to-pink-50 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-fuchsia-400/20 to-pink-400/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-pink-400/20 to-rose-400/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-br from-fuchsia-400/10 to-pink-400/10 rounded-full blur-3xl animate-pulse delay-500" />
      </div>

      {/* Header */}
      <header className="relative bg-white/70 backdrop-blur-xl border-b border-white/20 sticky top-0 z-50 shadow-lg shadow-fuchsia-500/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-4 sm:space-y-0">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <div className="relative">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-fuchsia-600 via-pink-600 to-rose-600 rounded-2xl flex items-center justify-center shadow-lg shadow-fuchsia-500/25 rotate-3 hover:rotate-6 transition-transform duration-300">
                  <span className="text-white text-lg sm:text-xl font-bold -rotate-3 hover:-rotate-6 transition-transform duration-300">
                    🎯
                  </span>
                </div>
                <div className="absolute -inset-1 bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-600 rounded-2xl blur opacity-30 animate-pulse" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-xl sm:text-3xl font-bold bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-600 bg-clip-text text-transparent">
                  Deploy ERC1155 Collection
                </h1>
                <p className="text-xs sm:text-sm text-gray-600">Multi-token standard for gaming & utilities</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-4">
              <button 
                onClick={() => router.push('/')}
                className="px-3 py-2 sm:px-4 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-xl hover:from-violet-500 hover:to-purple-500 transition-all duration-300 text-xs sm:text-sm font-semibold"
              >
                ← Dashboard
              </button>
              <button 
                onClick={() => router.push('/my-collections-erc1155')}
                className="px-3 py-2 sm:px-4 bg-white/60 text-gray-700 rounded-xl hover:bg-white transition-all duration-300 text-xs sm:text-sm font-semibold border border-gray-200/50 backdrop-blur-sm"
              >
                My Collections
              </button>
              <button onClick={logout} className="px-4 py-2 sm:px-6 sm:py-3 bg-white/60 text-gray-700 rounded-xl hover:bg-white transition-all duration-300 text-xs sm:text-sm font-semibold border border-gray-200/50 backdrop-blur-sm">
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="relative">
          <div className="absolute -inset-4 bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-600 rounded-3xl blur opacity-20" />
          <div className="relative bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 overflow-hidden">
            <div className="p-4 sm:p-8 lg:p-12">
              {/* Title */}
              <div className="text-center space-y-4 mb-6 sm:mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-fuchsia-500 to-pink-500 rounded-3xl shadow-lg shadow-fuchsia-500/25 mb-4 sm:mb-6">
                  <span className="text-2xl sm:text-3xl">🎯</span>
                </div>
                <h2 className="text-2xl sm:text-4xl font-bold bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-600 bg-clip-text text-transparent">
                  Deploy ERC1155 Collection
                </h2>
                <p className="text-sm sm:text-xl text-gray-600 max-w-2xl mx-auto">
                  Create a multi-token collection with batch operations and gas efficiency
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  {/* Collection Name */}
                  <div className="space-y-3 group">
                    <label className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
                      <span className="w-2 h-2 bg-gradient-to-r from-fuchsia-500 to-pink-500 rounded-full" />
                      <span>Collection Name</span>
                    </label>
                    <input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="My Gaming Collection"
                      className="w-full px-4 py-3 sm:px-5 sm:py-4 border-2 border-gray-200 rounded-2xl focus:ring-4 focus:ring-fuchsia-500/20 focus:border-fuchsia-500 transition-all duration-300 bg-white/50 backdrop-blur-sm hover:bg-white group-hover:border-fuchsia-300 text-sm sm:text-base"
                    />
                  </div>

                  {/* Symbol */}
                  <div className="space-y-3 group">
                    <label className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
                      <span className="w-2 h-2 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full" />
                      <span>Symbol</span>
                    </label>
                    <input
                      required
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value)}
                      placeholder="GAME"
                      className="w-full px-4 py-3 sm:px-5 sm:py-4 border-2 border-gray-200 rounded-2xl focus:ring-4 focus:ring-fuchsia-500/20 focus:border-fuchsia-500 transition-all duration-300 bg-white/50 backdrop-blur-sm hover:bg-white group-hover:border-fuchsia-300 text-sm sm:text-base"
                    />
                  </div>

                  {/* Description */}
                  <div className="space-y-3 group sm:col-span-2">
                    <label className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
                      <span className="w-2 h-2 bg-gradient-to-r from-rose-500 to-orange-500 rounded-full" />
                      <span>Description (Optional)</span>
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe your collection..."
                      rows={3}
                      className="w-full px-4 py-3 sm:px-5 sm:py-4 border-2 border-gray-200 rounded-2xl focus:ring-4 focus:ring-fuchsia-500/20 focus:border-fuchsia-500 transition-all duration-300 bg-white/50 backdrop-blur-sm hover:bg-white group-hover:border-fuchsia-300 text-sm sm:text-base resize-none"
                    />
                  </div>

                  {/* Mint Price */}
                  <div className="space-y-3 group">
                    <label className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
                      <span className="w-2 h-2 bg-gradient-to-r from-orange-500 to-yellow-500 rounded-full" />
                      <span>Mint Price (ETH)</span>
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      value={mintPrice}
                      onChange={(e) => setMintPrice(e.target.value)}
                      placeholder="0.001"
                      className="w-full px-4 py-3 sm:px-5 sm:py-4 border-2 border-gray-200 rounded-2xl focus:ring-4 focus:ring-fuchsia-500/20 focus:border-fuchsia-500 transition-all duration-300 bg-white/50 backdrop-blur-sm hover:bg-white group-hover:border-fuchsia-300 text-sm sm:text-base"
                    />
                  </div>

                  {/* Max Supply */}
                  <div className="space-y-3 group">
                    <label className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
                      <span className="w-2 h-2 bg-gradient-to-r from-yellow-500 to-green-500 rounded-full" />
                      <span>Max Supply</span>
                    </label>
                    <input
                      type="number"
                      value={maxSupply}
                      onChange={(e) => setMaxSupply(e.target.value)}
                      placeholder="1000"
                      className="w-full px-4 py-3 sm:px-5 sm:py-4 border-2 border-gray-200 rounded-2xl focus:ring-4 focus:ring-fuchsia-500/20 focus:border-fuchsia-500 transition-all duration-300 bg-white/50 backdrop-blur-sm hover:bg-white group-hover:border-fuchsia-300 text-sm sm:text-base"
                    />
                    <p className="text-xs text-gray-500">This will generate {maxSupply} unique codes</p>
                  </div>

                  {/* Royalty Recipient */}
                  <div className="space-y-3 group md:col-span-2">
                    <label className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
                      <span className="w-2 h-2 bg-gradient-to-r from-teal-500 to-cyan-500 rounded-full" />
                      <span>Royalty Recipient</span>
                    </label>
                    <input
                      value={royaltyRecipient}
                      readOnly
                      placeholder="Connect wallet to auto-fill"
                      className="w-full px-5 py-4 border-2 border-gray-200 rounded-2xl bg-gray-100/50 backdrop-blur-sm cursor-not-allowed text-gray-600"
                    />
                    <p className="text-xs text-gray-500">Auto-filled from connected wallet</p>
                  </div>
                </div>

                {/* Image Upload */}
                <div className="space-y-3 group">
                  <label className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
                    <span className="w-2 h-2 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full" />
                    <span>Upload Collection Image</span>
                  </label>
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      onChange={handleImageUpload}
                    />
                    <div className="border-2 border-dashed border-gray-300 rounded-2xl p-4 sm:p-8 text-center hover:border-fuchsia-400 transition-all duration-300 bg-white/50 backdrop-blur-sm group-hover:bg-white">
                      <div className="space-y-3">
                        <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-fuchsia-100 to-pink-100 rounded-2xl flex items-center justify-center mx-auto">
                          <span className="text-xl sm:text-2xl">📸</span>
                        </div>
                        <div>
                          <p className="text-sm sm:text-lg font-semibold text-gray-700">
                            {image ? image.name : "Click to upload collection image"}
                          </p>
                          <p className="text-xs sm:text-sm text-gray-500">Single image will be used for all NFTs</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Processing Status */}
                {processingStatus && (
                  <div className="p-4 bg-gradient-to-r from-fuchsia-50 to-pink-50 border-2 border-fuchsia-200/50 rounded-2xl backdrop-blur-sm">
                    <p className="text-fuchsia-800 font-semibold text-center">{processingStatus}</p>
                  </div>
                )}

                {/* Generated Codes Display */}
                {generatedCodes.length > 0 && (
                  <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200/50 rounded-2xl backdrop-blur-sm">
                    <h4 className="font-semibold text-blue-800 mb-2 text-sm sm:text-base">Generated Codes:</h4>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {generatedCodes.slice(0, 10).map((code, i) => (
                        <div key={i} className="text-xs font-mono bg-white/60 px-2 py-1 rounded border">
                          {code}
                        </div>
                      ))}
                    </div>
                    {generatedCodes.length > 10 && (
                      <p className="text-xs text-blue-600 mt-2">... and {generatedCodes.length - 10} more</p>
                    )}
                  </div>
                )}

                {/* Submit Button */}
                {isConnected ? (
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="w-full px-6 py-4 sm:px-8 sm:py-5 bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-600 text-white rounded-2xl font-bold text-base sm:text-lg hover:from-fuchsia-500 hover:via-pink-500 hover:to-rose-500 transition-all duration-300 shadow-xl shadow-fuchsia-500/25 hover:shadow-2xl hover:shadow-fuchsia-500/40 transform hover:-translate-y-1 relative overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <span className="relative z-10 flex items-center justify-center space-x-3">
                      <span>
                        {isProcessing ? "Processing..." : "Deploy ERC1155 Collection"}
                      </span>
                      <span className="text-xl">
                        {isProcessing ? "⏳" : "🎯"}
                      </span>
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={connectWallet}
                    className="w-full px-6 py-4 sm:px-8 sm:py-5 bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-600 text-white rounded-2xl font-bold text-base sm:text-lg hover:from-fuchsia-500 hover:via-pink-500 hover:to-rose-500 transition-all duration-300 shadow-xl shadow-fuchsia-500/25 hover:shadow-2xl hover:shadow-fuchsia-500/40 transform hover:-translate-y-1 relative overflow-hidden group"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <span className="relative z-10 flex items-center justify-center space-x-3">
                      <span>Connect Wallet</span>
                      <span className="text-xl">🔗</span>
                    </span>
                  </button>
                )}
              </form>

              {/* Transaction Hash */}
              {txHash && (
                <div className="mt-6 sm:mt-8 p-4 sm:p-6 bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200/50 rounded-2xl backdrop-blur-sm">
                  <p className="text-emerald-800 flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-3 font-semibold text-sm sm:text-base">
                    <span className="flex items-center space-x-2">
                      <span className="text-xl sm:text-2xl">✅</span>
                      <span>Transaction submitted:</span>
                    </span>
                    <a
                      href={`https://sepolia.basescan.org/tx/${txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-bold underline decoration-emerald-300 hover:decoration-emerald-400 bg-white/50 px-3 py-1 rounded-lg text-xs sm:text-sm break-all"
                    >
                      {txHash.slice(0, 10)}…
                    </a>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
