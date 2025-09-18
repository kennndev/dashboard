'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePrivy } from '@privy-io/react-auth'
import { useAccount, useWalletClient, useWriteContract, usePublicClient, useConnect } from 'wagmi'
import { parseEther, keccak256, encodePacked, parseEventLogs } from 'viem'
import axios from 'axios'
import { getFactoryAddress, getFactoryAbi } from '@/lib/erc1155-factory'

const pinataJWT = process.env.NEXT_PUBLIC_PINATA_JWT!

export default function DeployERC721Page() {
  const router = useRouter()
  const { authenticated, user, logout } = usePrivy()
  const { isConnected, address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient()
  const { connect, connectors } = useConnect()

  // Form state
  const [name, setName] = useState("")
  const [symbol, setSymbol] = useState("")
  const [price, setPrice] = useState("0")
  const [royaltyRecipient, setRoyaltyRecipient] = useState("")
  const [royaltyPct, setRoyaltyPct] = useState("500")
  const [images, setImages] = useState<File[]>([])
  const [isProcessingImages, setIsProcessingImages] = useState(false)
  const [processingStatus, setProcessingStatus] = useState("")
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([])
  const [collectionData, setCollectionData] = useState<{cid: string, codes: string[], hashes: string[]} | null>(null)

  // Get factory configuration for ERC721
  const factoryAddress = getFactoryAddress()
  const factoryAbi = getFactoryAbi()

  // Auto-populate royalty recipient when wallet connects
  useEffect(() => {
    if (isConnected && address) {
      setRoyaltyRecipient(address)
    }
  }, [isConnected, address])

  // Helper functions for automated process
  const generateRandomCode = (length: number) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  const encodeIndex = (index: number): string => {
    return index.toString(36).padStart(2, '0') // base36: 0 → '00', 99 → '2r'
  }

  const generateCodesForImages = (count: number) => {
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
    if (e.target.files) {
      const files = Array.from(e.target.files)
      setImages(files)
      generateCodesForImages(files.length)
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isConnected || !walletClient || !publicClient) {
      alert("Wallet or client not ready")
      return
    }

    try {
      /* 1️⃣  Deploy collection contract ---------------------------------------- */
      setProcessingStatus("🚀 Deploying collection contract...")
      
      let txHash: `0x${string}`
      let collectionAddress: `0x${string}`
      
      // ERC721 collection creation
      txHash = await writeContractAsync({
        account: walletClient.account,
        address: factoryAddress,
        abi: factoryAbi,
        functionName: "createCollection",
        args: [
          name,
          symbol,
          BigInt(parseEther(price || "0")),
          royaltyRecipient as `0x${string}`,
          BigInt(royaltyPct || "0"),
        ],
      })

      /* 2️⃣  Wait for inclusion ----------------------------------------------- */
      setProcessingStatus("⏳ Waiting for transaction confirmation...")
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })

      /* 3️⃣  Extract the CollectionDeployed event ----------------------------- */
      const events = parseEventLogs({
        abi: factoryAbi,
        logs: receipt.logs,
        eventName: "CollectionDeployed",
      })

      collectionAddress = (events[0].args as any).collectionAddress as `0x${string}`

      /* 4️⃣  Save in Supabase ------------------------------------------------ */
      setProcessingStatus("💾 Saving collection data...")
      await fetch("/api/collections", {
        method: "POST",
        body: JSON.stringify({
          address: collectionAddress.toLowerCase(),
          owner: walletClient.account.address.toLowerCase(),
          collection_type: 'erc721',
        }),
      })

      /* 5️⃣  Always generate codes and process NFTs ------------------------- */
      setIsProcessingImages(true)
      setProcessingStatus("🔐 Generating codes and processing NFTs...")
      
      // Generate codes if not already generated (for cases without images)
      let codesToUse = generatedCodes
      if (codesToUse.length === 0) {
        // Generate default number of codes (e.g., 10) if no images uploaded
        const defaultCount = 10
        codesToUse = []
        for (let i = 0; i < defaultCount; i++) {
          const randomPart = generateRandomCode(6)
          const indexPart = encodeIndex(i)
          codesToUse.push(randomPart + indexPart)
        }
        setGeneratedCodes(codesToUse)
      }

      // Upload images to IPFS if provided
      const imgCIDs: string[] = []
      if (images.length > 0) {
        setProcessingStatus("📤 Uploading images to IPFS...")
        for (let i = 0; i < images.length; i++) {
          const file = images[i]
          const fd = new FormData()
          fd.append('file', file, file.name)
          const { data } = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', fd, {
            headers: { Authorization: `Bearer ${pinataJWT}` },
          })
          imgCIDs.push(`ipfs://${data.IpfsHash}`)
          setProcessingStatus(`📤 Uploading images... (${i + 1}/${images.length})`)
        }
      }

      // Create and upload metadata
      setProcessingStatus("📝 Creating metadata...")
      const folder = 'metadata'
      const metaFD = new FormData()
      codesToUse.forEach((code, i) => {
        const meta = { 
          name: `${name} #${i + 1}`, 
          description: `Claimed with code: ${code}`, 
          image: imgCIDs[i] || `https://via.placeholder.com/400x400/6366f1/ffffff?text=${name}+%23${i + 1}`, // Use placeholder if no image
          attributes: [
            { trait_type: "Code", value: code },
            { trait_type: "Collection", value: name }
          ]
        }
        metaFD.append('file', new Blob([JSON.stringify(meta)], { type: 'application/json' }), `${folder}/${i}.json`)
      })
      metaFD.append('pinataMetadata', JSON.stringify({ name: 'cardify‑metadata‑folder' }))
      metaFD.append('pinataOptions', JSON.stringify({ wrapWithDirectory: true }))

      const metaRes = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', metaFD, {
        headers: { Authorization: `Bearer ${pinataJWT}` },
      })
      const cid: string = metaRes.data.IpfsHash

      // Generate hashes
      setProcessingStatus("🔐 Generating hashes...")
      const hashes = codesToUse.map((code, i) =>
        keccak256(encodePacked(['string', 'string'], [code, `ipfs://${cid}/metadata/${i}.json`])),
      )

      // Save collection with CID and codes
      await fetch(`/api/collections/${collectionAddress.toLowerCase()}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          cid, 
          owner: walletClient.account.address.toLowerCase(),
          codes: codesToUse,
          hashes: hashes,
          total_nfts: codesToUse.length,
          collection_type: 'erc721'
        }),
      })

      // Also save individual codes to the nft_codes table for detailed tracking
      const codesData = codesToUse.map((code, i) => ({
        code,
        hash: hashes[i],
        token_id: i + 1,
        metadata_uri: `ipfs://${cid}/metadata/${i}.json`
      }))

      await fetch(`/api/collections/${collectionAddress.toLowerCase()}/codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes: codesData }),
      })

      setProcessingStatus("🔐 Hashes generated and saved...")

      // Add hashes to contract
      setProcessingStatus("⛓️ Adding hashes to smart contract...")
      await writeContractAsync({
        address: collectionAddress as `0x${string}`,
        abi: [{ name: 'addValidHashes', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'hashes', type: 'bytes32[]' }], outputs: [] }],
        functionName: 'addValidHashes',
        args: [hashes],
      })

      // Store collection data for display
      setCollectionData({ cid, codes: codesToUse, hashes })
      setProcessingStatus("✅ Collection deployed and NFTs processed successfully!")

      /* 6️⃣  Reset form -------------------------------------- */
      setName("")
      setSymbol("")
      setPrice("0")
      setRoyaltyPct("500")
      setImages([])
      setGeneratedCodes([])
      setCollectionData(null)
      
    } catch (error: any) {
      console.error(error)
      setProcessingStatus("❌ Error: " + (error.message || "Something went wrong"))
    } finally {
      setIsProcessingImages(false)
    }
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please sign in</h1>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-xl"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-violet-400/20 to-purple-400/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-purple-400/20 to-fuchsia-400/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-br from-violet-400/10 to-fuchsia-400/10 rounded-full blur-3xl animate-pulse delay-500" />
      </div>

      {/* Header */}
      <header className="relative bg-white/70 backdrop-blur-xl border-b border-white/20 sticky top-0 z-50 shadow-lg shadow-violet-500/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-4 sm:space-y-0">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <div className="relative">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/25 rotate-3 hover:rotate-6 transition-transform duration-300">
                  <span className="text-white text-lg sm:text-xl font-bold -rotate-3 hover:-rotate-6 transition-transform duration-300">
                    🖼️
                  </span>
                </div>
                <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 rounded-2xl blur opacity-30 animate-pulse" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-xl sm:text-3xl font-bold bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 bg-clip-text text-transparent">
                  Deploy ERC721 Collection
                </h1>
                <p className="text-xs sm:text-sm text-gray-600">Standard NFT collection for unique digital assets</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-4">
              <button 
                onClick={() => router.push('/')}
                className="px-3 py-2 sm:px-4 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-xl hover:from-violet-500 hover:to-purple-500 transition-all duration-300 text-xs sm:text-sm font-semibold"
              >
                ← Home
              </button>
              <button 
                onClick={() => router.push('/my-collections-erc1155')}
                className="px-3 py-2 sm:px-4 bg-white/60 text-gray-700 rounded-xl hover:bg-white transition-all duration-300 text-xs sm:text-sm font-semibold border border-gray-200/50 backdrop-blur-sm"
              >
                My Collections
              </button>
              <button 
                onClick={() => router.push('/deploy-erc1155')}
                className="px-3 py-2 sm:px-4 bg-white/60 text-gray-700 rounded-xl hover:bg-white transition-all duration-300 text-xs sm:text-sm font-semibold border border-gray-200/50 backdrop-blur-sm"
              >
                Deploy ERC1155
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
        <div className="relative bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 overflow-hidden">
          <div className="p-6 sm:p-8 lg:p-12">
            <div className="space-y-8">
              {/* Title */}
              <div className="text-center space-y-4">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-3xl shadow-lg shadow-violet-500/25 mb-4">
                  <span className="text-2xl">🚀</span>
                </div>
                <h2 className="text-3xl font-bold bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 bg-clip-text text-transparent">
                  Deploy New Collection
                </h2>
                <p className="text-gray-600 max-w-md mx-auto">
                  Create your NFT collection with custom parameters and start your journey
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Collection Name */}
                  <div className="space-y-3 group">
                    <label className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
                      <span className="w-2 h-2 bg-gradient-to-r from-violet-500 to-purple-500 rounded-full" />
                      <span>Collection Name</span>
                    </label>
                    <input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="My Awesome Collection"
                      className="w-full px-5 py-4 border-2 border-gray-200 rounded-2xl focus:ring-4 focus:ring-violet-500/20 focus:border-violet-500 transition-all duration-300 bg-white/50 backdrop-blur-sm hover:bg-white group-hover:border-violet-300"
                    />
                  </div>

                  {/* Symbol */}
                  <div className="space-y-3 group">
                    <label className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
                      <span className="w-2 h-2 bg-gradient-to-r from-purple-500 to-fuchsia-500 rounded-full" />
                      <span>Symbol</span>
                    </label>
                    <input
                      required
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value)}
                      placeholder="MAC"
                      className="w-full px-5 py-4 border-2 border-gray-200 rounded-2xl focus:ring-4 focus:ring-violet-500/20 focus:border-violet-500 transition-all duration-300 bg-white/50 backdrop-blur-sm hover:bg-white group-hover:border-violet-300"
                    />
                  </div>

                  {/* Mint Price */}
                  <div className="space-y-3 group">
                    <label className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
                      <span className="w-2 h-2 bg-gradient-to-r from-fuchsia-500 to-pink-500 rounded-full" />
                      <span>Mint Price (ETH)</span>
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      value={price}
                      readOnly
                      className="w-full px-5 py-4 border-2 border-gray-200 rounded-2xl bg-gray-100/50 backdrop-blur-sm cursor-not-allowed text-gray-600"
                    />
                    <p className="text-xs text-gray-500">Fixed at 0 ETH (free minting)</p>
                  </div>

                  {/* Royalty Recipient */}
                  <div className="space-y-3 group">
                    <label className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
                      <span className="w-2 h-2 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full" />
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

                {/* Royalty Percentage */}
                <div className="space-y-3 group">
                  <label className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
                    <span className="w-2 h-2 bg-gradient-to-r from-rose-500 to-orange-500 rounded-full" />
                    <span>Royalty Percentage (basis points)</span>
                  </label>
                  <input
                    type="number"
                    value={royaltyPct}
                    readOnly
                    className="w-full px-5 py-4 border-2 border-gray-200 rounded-2xl bg-gray-100/50 backdrop-blur-sm cursor-not-allowed text-gray-600"
                  />
                  <p className="text-xs text-gray-500">Fixed at 500 basis points (5%)</p>
                </div>

                {/* Image Upload Section */}
                <div className="space-y-3 group">
                  <label className="text-sm font-semibold text-gray-700 flex items-center space-x-2">
                    <span className="w-2 h-2 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full" />
                    <span>Upload NFT Images (Optional)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      onChange={handleImageUpload}
                    />
                    <div className="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center hover:border-emerald-400 transition-all duration-300 bg-white/50 backdrop-blur-sm group-hover:bg-white">
                      <div className="space-y-3">
                        <div className="w-16 h-16 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-2xl flex items-center justify-center mx-auto">
                          <span className="text-2xl">📸</span>
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-gray-700">
                            {images.length > 0 ? `${images.length} images selected` : "Click to upload NFT images"}
                          </p>
                          <p className="text-gray-500">Upload images to automatically generate codes and process NFTs</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  {images.length > 0 && (
                    <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200/50 rounded-2xl backdrop-blur-sm">
                      <p className="text-emerald-800 font-semibold flex items-center space-x-2">
                        <span className="text-xl">✅</span>
                        <span>
                          {images.length} images uploaded - {generatedCodes.length} codes generated automatically
                        </span>
                      </p>
                      <div className="mt-2 text-sm text-emerald-700">
                        <p>Generated codes: {generatedCodes.slice(0, 3).join(', ')}{generatedCodes.length > 3 ? '...' : ''}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Processing Status */}
                {processingStatus && (
                  <div className="p-4 bg-gradient-to-r from-violet-50 to-fuchsia-50 border-2 border-violet-200/50 rounded-2xl backdrop-blur-sm">
                    <p className="text-violet-800 font-semibold text-center">{processingStatus}</p>
                  </div>
                )}

                {/* Action Button */}
                {isConnected ? (
                  <button
                    type="submit"
                    disabled={isProcessingImages}
                    className="w-full px-8 py-5 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-white rounded-2xl font-bold text-lg hover:from-violet-500 hover:via-purple-500 hover:to-fuchsia-500 transition-all duration-300 shadow-xl shadow-violet-500/25 hover:shadow-2xl hover:shadow-violet-500/40 transform hover:-translate-y-1 relative overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <span className="relative z-10 flex items-center justify-center space-x-3">
                      <span>
                        {isProcessingImages ? "Processing..." : images.length > 0 ? "Deploy & Process NFTs" : "Deploy Collection"}
                      </span>
                      <span className="text-xl">
                        {isProcessingImages ? "⏳" : images.length > 0 ? "🚀" : "✨"}
                      </span>
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={connectWallet}
                    className="w-full px-8 py-5 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-white rounded-2xl font-bold text-lg hover:from-violet-500 hover:via-purple-500 hover:to-fuchsia-500 transition-all duration-300 shadow-xl shadow-violet-500/25 hover:shadow-2xl hover:shadow-violet-500/40 transform hover:-translate-y-1 relative overflow-hidden group"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <span className="relative z-10 flex items-center justify-center space-x-3">
                      <span>Connect Wallet</span>
                      <span className="text-xl">🔗</span>
                    </span>
                  </button>
                )}
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
