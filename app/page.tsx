"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { useReadContract, useWriteContract, useWalletClient, useAccount, usePublicClient, useConnect } from "wagmi"
import { parseEther, formatEther, keccak256, encodePacked, parseEventLogs } from "viem"
import Link from "next/link"
import { useRouter } from "next/navigation"
import useSWR from 'swr';
import axios from 'axios';

const pinataJWT = process.env.NEXT_PUBLIC_PINATA_JWT!

// ────────────────────────────────────────────────────────────────────────────────
// Factory contract
// ────────────────────────────────────────────────────────────────────────────────
const factoryAddress = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as `0x${string}`

const factoryAbi = [
  /* ─── functions ─── */
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
  /* ─── event we forgot ─── */
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

// Minimal ABI for CardifyNFT metadata + admin
const nftAbi = [
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "mintPrice", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    name: "addValidHashes",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "hashes", type: "bytes32[]" }],
    outputs: [],
  },
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-3 rounded-2xl font-semibold transition-all duration-300 relative overflow-hidden group ${
        active
          ? "bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-white shadow-lg shadow-violet-500/25 transform scale-105"
          : "text-gray-600 hover:text-gray-800 hover:bg-white/60 backdrop-blur-sm border border-white/20"
      }`}
    >
      {active && (
        <div className="absolute inset-0 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 opacity-75 animate-pulse"></div>
      )}
      <span className="relative z-10">{label}</span>
    </button>
  )
}

function DeployForm({ onDeployed }: { onDeployed: (hash: string) => void }) {
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

  /* ───── hooks ───── */
  const { user } = usePrivy() // gives Supabase user_id
  const { isConnected, address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient()

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


  /* NEW – wallet connector */
  const { connect, connectors, isPending: isConnecting } = useConnect()

  /* open connector modal / silently connect first available */
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
    const txHash = await writeContractAsync({
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

    const collectionAddress = events[0].args.collectionAddress as `0x${string}`

      /* 4️⃣  Save in Supabase ------------------------------------------------ */
      setProcessingStatus("💾 Saving collection data...")
    await fetch("/api/collections", {
      method: "POST",
      body: JSON.stringify({
        address: collectionAddress.toLowerCase(),
        owner: walletClient.account.address.toLowerCase(),
      }),
    })

      /* 5️⃣  Process images if uploaded -------------------------------------- */
      if (images.length > 0 && generatedCodes.length > 0) {
        setIsProcessingImages(true)
        setProcessingStatus("📤 Processing images and generating NFTs...")
        
        // Upload images to IPFS
        const imgCIDs: string[] = []
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

        // Create and upload metadata
        setProcessingStatus("📝 Creating metadata...")
        const folder = 'metadata'
        const metaFD = new FormData()
        generatedCodes.forEach((code, i) => {
          const meta = { 
            name: `${name} #${i + 1}`, 
            description: `Claimed with code: ${code}`, 
            image: imgCIDs[i],
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
        const hashes = generatedCodes.map((code, i) =>
          keccak256(encodePacked(['string', 'string'], [code, `ipfs://${cid}/metadata/${i}.json`])),
        )

        // Save collection with CID and codes
        await fetch(`/api/collections/${collectionAddress.toLowerCase()}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            cid, 
            owner: walletClient.account.address.toLowerCase(),
            codes: generatedCodes,
            hashes: hashes,
            total_nfts: generatedCodes.length
          }),
        })

        // Also save individual codes to the nft_codes table for detailed tracking
        const codesData = generatedCodes.map((code, i) => ({
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
          address: collectionAddress,
          abi: [{ name: 'addValidHashes', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'hashes', type: 'bytes32[]' }], outputs: [] }],
          functionName: 'addValidHashes',
          args: [hashes],
        })

        // Store collection data for display
        setCollectionData({ cid, codes: generatedCodes, hashes })
        setProcessingStatus("✅ Collection deployed and NFTs processed successfully!")
      } else {
        setProcessingStatus("✅ Collection deployed successfully!")
      }

      /* 6️⃣  Notify parent + reset form -------------------------------------- */
    onDeployed(txHash)
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

  return (
  <div className="space-y-8">
    {/* ───────── title ───────── */}
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

    {/* ───────── form ───────── */}
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* collection name */}
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

        {/* symbol */}
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

        {/* mint price */}
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

        {/* royalty recipient */}
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

      {/* royalty percentage */}
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

      {/* ───────── action button ───────── */}
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
)

}

interface CollectionRowProps {
  addr: `0x${string}`
  viewer: string
}


function CollectionRow({ addr, viewer }: CollectionRowProps) {
  const publicClient = usePublicClient()
  const { data: name } = useReadContract({ address: addr, abi: nftAbi, functionName: "name" })
  const { data: symbol } = useReadContract({ address: addr, abi: nftAbi, functionName: "symbol" })
  const { data: price } = useReadContract({ address: addr, abi: nftAbi, functionName: "mintPrice" })
  const { data: owner } = useReadContract({ address: addr, abi: nftAbi, functionName: "owner" })

  const isOwner = owner?.toLowerCase() === viewer.toLowerCase()
  const [copied, setCopied] = useState(false)
  const [collectionInfo, setCollectionInfo] = useState<{cid: string, codes: string[], hashes: string[], total_nfts: number} | null>(null)
  const [showCodes, setShowCodes] = useState(false)
  const [showAllCodes, setShowAllCodes] = useState(false)


  const { writeContractAsync, isPending } = useWriteContract()
  const addrLc = addr.toLowerCase()

  // Fetch collection information
  useEffect(() => {
    const fetchCollectionInfo = async () => {
      try {
        const res = await fetch(`/api/collections/${addrLc}`)
        if (res.ok) {
          const { cid, codes, hashes, total_nfts } = await res.json()
          if (cid) {
            setCollectionInfo({ 
              cid, 
              codes: codes || [], 
              hashes: hashes || [],
              total_nfts: total_nfts || 0
            })
          }
        }
      } catch (error) {
        console.error('Failed to fetch collection info:', error)
      }
    }
    fetchCollectionInfo()
  }, [addrLc])

  const copyCodes = async (codes: string[]) => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

  // Temporarily commented out - Add to Frontend function
  /*
  async function handleAddToFrontend() {
    try {
      setPushing(true)
      // ... rest of the function
    } catch (e: any) {
      alert(e.message || "Failed")
    } finally {
      setPushing(false)
    }
  }
  */


  const gradients = [
    "from-violet-500 to-purple-600",
    "from-purple-500 to-fuchsia-600",
    "from-fuchsia-500 to-pink-600",
    "from-pink-500 to-rose-600",
    "from-rose-500 to-orange-500",
  ]
  const gradient = gradients[Math.abs(addr.charCodeAt(0)) % gradients.length]

  return (
    <div className="group relative">
      {/* Floating background decoration */}
      <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 rounded-3xl blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200 animate-pulse"></div>

      <div className="relative bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 overflow-hidden hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2">
        <div className="p-8 space-y-6">
          <div className="flex flex-col lg:flex-row justify-between lg:items-start gap-6">
            <div className="space-y-4 flex-1">
              <div className="flex items-center space-x-4">
                <div
                  className={`w-16 h-16 bg-gradient-to-br ${gradient} rounded-2xl flex items-center justify-center shadow-lg transform rotate-3 group-hover:rotate-6 transition-transform duration-300`}
                >
                  <span className="text-white text-2xl font-bold transform -rotate-3 group-hover:-rotate-6 transition-transform duration-300">
                    {(name ?? "C")[0].toUpperCase()}
                  </span>
                </div>
                <div className="space-y-1">
                  <h3 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
                    {name ?? "Loading..."}
                  </h3>
                  <p className="text-gray-500 font-semibold text-lg">{symbol ?? "..."}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center space-x-3 p-3 bg-gray-50/50 rounded-xl backdrop-blur-sm">
                  <div className="w-2 h-2 bg-gradient-to-r from-violet-500 to-purple-500 rounded-full"></div>
                  <span className="text-sm font-semibold text-gray-600">Address:</span>
<div className="flex items-center space-x-2">
  <code className="text-xs bg-white/60 px-3 py-1.5 rounded-lg text-gray-700 font-mono border border-gray-200/50">
    {addr}
  </code>
  <button
    onClick={() => {
      navigator.clipboard.writeText(addr)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }}
    title="Copy Address"
    className="text-gray-500 hover:text-gray-700 text-sm transition"
  >
    {copied ? "✅" : "📋"}
  </button>
</div>


                </div>
                <div className="flex items-center space-x-3 p-3 bg-gray-50/50 rounded-xl backdrop-blur-sm">
                  <div className="w-2 h-2 bg-gradient-to-r from-fuchsia-500 to-pink-500 rounded-full"></div>
                  <span className="text-sm font-semibold text-gray-600">Price:</span>
                  <span className="bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white px-3 py-1.5 rounded-lg font-bold text-sm shadow-md">
                    {price ? formatEther(price as bigint) : "..."} ETH
                  </span>
                </div>
                {collectionInfo && (
                  <div className="flex items-center space-x-3 p-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl backdrop-blur-sm border border-emerald-200/50">
                    <div className="w-2 h-2 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"></div>
                    <span className="text-sm font-semibold text-emerald-700">Status:</span>
                    <span className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-3 py-1.5 rounded-lg font-bold text-sm shadow-md">
                      ✅ NFTs Processed
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <a
href={`https://sepolia.basescan.org/address/${addr}`}
                target="_blank"
                rel="noreferrer"
                className="px-5 py-2.5 bg-white/60 text-gray-700 rounded-xl hover:bg-white transition-all duration-300 text-sm font-semibold border border-gray-200/50 backdrop-blur-sm hover:shadow-lg transform hover:-translate-y-0.5"
              >
                View on Base
              </a>
              {collectionInfo && (
                <button
                  onClick={() => {
                    setShowCodes(!showCodes)
                    if (!showCodes) setShowAllCodes(false) // Reset to show only first 5 when opening
                  }}
                  className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl hover:from-blue-400 hover:to-indigo-400 transition-all duration-300 text-sm font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  {showCodes ? "Hide Codes" : "View Codes"}
                </button>
              )}
              {isOwner && (
                <>
                  {/* Temporarily commented out - Add to Frontend button */}
                  {/* <button
                    onClick={handleAddToFrontend}
                    disabled={pushing}
                    className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-xl hover:from-violet-500 hover:to-fuchsia-500 transition-all duration-300 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                  >
                    {pushing ? "Sending…" : "Add to Frontend"}
                  </button> */}
                </>
              )}
            </div>
          </div>

          {/* Codes Display Section */}
          {showCodes && collectionInfo && (
            <div className="pt-6 border-t border-gray-200/50">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-semibold text-gray-700 flex items-center space-x-2">
                    <span className="w-2 h-2 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"></span>
                    <span>Generated Codes & Collection Info</span>
                  </h4>
                  <button
                    onClick={() => copyCodes(collectionInfo.codes)}
                    className="text-sm text-blue-600 hover:text-blue-800 transition"
                    title="Copy all codes"
                  >
                    {copied ? '✅' : '📋'} Copy Codes
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200/50 rounded-2xl backdrop-blur-sm">
                    <h5 className="font-semibold text-blue-800 mb-2">📋 Generated Codes</h5>
                    <div className="space-y-1">
                      {collectionInfo.codes.length > 0 ? (
                        (showAllCodes ? collectionInfo.codes : collectionInfo.codes.slice(0, 5)).map((code, i) => (
                          <div key={i} className="text-sm font-mono bg-white/60 px-2 py-1 rounded border">
                            {code}
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-blue-600">No codes available</p>
                      )}
                      {collectionInfo.codes.length > 5 && !showAllCodes && (
                        <button
                          onClick={() => setShowAllCodes(true)}
                          className="text-xs text-blue-500 hover:text-blue-700 hover:underline transition cursor-pointer"
                        >
                          ... and {collectionInfo.codes.length - 5} more
                        </button>
                      )}
                      {showAllCodes && collectionInfo.codes.length > 5 && (
                        <button
                          onClick={() => setShowAllCodes(false)}
                          className="text-xs text-blue-500 hover:text-blue-700 hover:underline transition cursor-pointer"
                        >
                          Show less
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200/50 rounded-2xl backdrop-blur-sm">
                    <h5 className="font-semibold text-emerald-800 mb-2">🔗 Collection Details</h5>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-semibold text-emerald-700">IPFS CID:</span>
                        <div className="font-mono bg-white/60 px-2 py-1 rounded border text-xs break-all">
                          {collectionInfo.cid}
                        </div>
                      </div>
                      <div>
                        <span className="font-semibold text-emerald-700">Total NFTs:</span>
                        <span className="ml-2 text-emerald-600">{collectionInfo.total_nfts}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

    </div>
  )
}

function MyCollections({ addresses, viewer }: { addresses: string[]; viewer: string }) {
  if (!addresses.length) {
    return (
      <div className="text-center py-16 space-y-6">
        <div className="relative">
          <div className="w-24 h-24 bg-gradient-to-br from-violet-100 to-fuchsia-100 rounded-3xl flex items-center justify-center mx-auto transform rotate-3 hover:rotate-6 transition-transform duration-300">
            <span className="text-4xl transform -rotate-3 hover:-rotate-6 transition-transform duration-300">📦</span>
          </div>
          <div className="absolute -inset-2 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 rounded-3xl blur opacity-20 animate-pulse"></div>
        </div>
        <div className="space-y-3">
          <h3 className="text-2xl font-bold bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 bg-clip-text text-transparent">
            No Collections Yet
          </h3>
          <p className="text-gray-600 max-w-md mx-auto">
            Deploy your first collection to get started on your NFT journey
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-3xl shadow-lg shadow-violet-500/25 mb-4">
          <span className="text-2xl">🎨</span>
        </div>
        <h2 className="text-3xl font-bold bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 bg-clip-text text-transparent">
          My Collections
        </h2>
        <p className="text-gray-600 max-w-md mx-auto">Manage your deployed NFT collections</p>
      </div>

      <div className="space-y-8">
        {addresses.map((addr) => (
          <CollectionRow key={addr} addr={addr as `0x${string}`} viewer={viewer} />
        ))}
      </div>
    </div>
  )
}


function CodeGenerator() {
  const [count, setCount] = useState(10)
  const [output, setOutput] = useState<string[]>([])
  const [copied, setCopied] = useState(false)

  function generateRandomCode(length: number) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  function encodeIndex(index: number): string {
    return index.toString(36).padStart(2, '0') // base36: 0 → '00', 99 → '2r'
  }

  function generateCodes() {
    const results: string[] = []
    for (let i = 0; i < count; i++) {
      const randomPart = generateRandomCode(6)
      const indexPart = encodeIndex(i)
      const finalCode = randomPart + indexPart
      results.push(finalCode)
    }
    setOutput(results)
  }

  function handleCopyAll() {
    const text = output.join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold text-center text-violet-700">🎲 Code Generator</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 justify-center">
        <input
          type="number"
          placeholder="Number of codes (e.g. 100)"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="p-3 border rounded-xl w-full"
        />

        <button
          onClick={generateCodes}
          className="bg-violet-600 hover:bg-violet-500 text-white font-semibold py-3 px-6 rounded-xl"
        >
          Generate
        </button>
      </div>

      {output.length > 0 && (
        <div className="mt-6 space-y-2">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Generated Codes:</h3>
            <button
              onClick={handleCopyAll}
              className="text-sm text-violet-600 hover:text-violet-800 transition"
              title="Copy all codes"
            >
              {copied ? '✅' : '📋'} Copy All
            </button>
          </div>

          <textarea
            readOnly
            value={output.join('\n')}
            rows={10}
            className="w-full p-4 border rounded-xl font-mono text-sm"
          />
        </div>
      )}
    </div>
  )
}



// ────────────────────────────────────────────────────────────────────────────────
// Dashboard Page
// ────────────────────────────────────────────────────────────────────────────────
export default function DashboardPage() {

  const router = useRouter();
  const { ready, authenticated, user, login, logout } = usePrivy();

  const [tab, setTab] = useState<"deploy" | "mine" | "generate">("deploy");
  const [collections, setCollections] = useState<string[]>([]);
  const [txHash, setTxHash] = useState<string | null>(null);
    const email = (user?.google?.email ?? user?.email?.address ?? '').toLowerCase();
  const { connect, connectors, isPending: isConnPending } = useConnect()
// wagmi account
const { isConnected, address } = useAccount()

// pick whichever address is actually connected
const connectedAddress = isConnected ? (address as `0x${string}`) : undefined


  /* open connector modal / silently connect first available */
  const connectWallet = async () => {
    try {
      const preferred = connectors[0]
      await connect({ connector: preferred })
    } catch (e) {
      alert("Could not connect wallet")
    }
  }

  /* factory query */
  const userAddress =
    authenticated && user?.wallet?.address?.startsWith("0x")
      ? (user.wallet.address as `0x${string}`)
      : undefined;

const { data: collectionsData, refetch } = useReadContract(
  connectedAddress
    ? {
        address: factoryAddress,
        abi: factoryAbi,
        functionName: "getUserCollections",
        args: [connectedAddress],
      }
    : {
        address: factoryAddress,
        abi: factoryAbi,
        functionName: "getUserCollections",
        args: ["0x0000000000000000000000000000000000000000"],
      }
);


  useEffect(() => {
    if (collectionsData) setCollections(collectionsData as string[]);
  }, [collectionsData]);

const fetcher = (url: string) => fetch(url).then(r => r.json());
  const { data: roles, isLoading: rolesLoading } = useSWR(
    authenticated ? '/api/roles' : null,
    fetcher
  );

  /* keep React happy until both Privy and SWR are done */
  if (!ready || (authenticated && rolesLoading)) {
    return <div className="min-h-screen flex items-center justify-center">Loading…</div>;
  }

  /* email must exist in dashboard_roles */
  const allowed =
    authenticated &&
    roles?.some((r: { email: string }) => r.email.toLowerCase() === email);

  if (!allowed) {
    if (authenticated) logout();      // signed‑in but not on the list
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-6">
        <h1 className="text-2xl font-semibold">Restricted dashboard</h1>
        <button
          onClick={login}
          className="px-8 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-2xl"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

 return (
  <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 relative overflow-hidden">
    {/* ───────── animated pastel blobs ───────── */}
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-violet-400/20 to-fuchsia-400/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-full blur-3xl animate-pulse delay-1000" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-br from-fuchsia-400/10 to-violet-400/10 rounded-full blur-3xl animate-pulse delay-500" />
    </div>

    {/* ───────── sticky header ───────── */}
    <header className="relative bg-white/70 backdrop-blur-xl border-b border-white/20 sticky top-0 z-50 shadow-lg shadow-violet-500/5">
      <div className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center">
        {/* brand mark */}
        <div className="flex items-center space-x-4">
          <div className="relative">
            <div className="w-12 h-12 bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/25 rotate-3 hover:rotate-6 transition-transform duration-300">
              <span className="text-white text-xl font-bold -rotate-3 hover:-rotate-6 transition-transform duration-300">
                🎨
              </span>
            </div>
            <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 rounded-2xl blur opacity-30 animate-pulse" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 bg-clip-text text-transparent">
            Cardify Collections
          </h1>
        </div>

{/* auth / wallet controls */}
{!authenticated && (
  <button onClick={login} className="btn‑gradient">Sign in with Google</button>
)}

{authenticated && !isConnected && (
  <button
    onClick={connectWallet}
    disabled={isConnPending}
    className="btn‑gradient disabled:opacity-50"
  >
    {isConnPending ? "Connecting…" : "Connect Wallet"}
  </button>
)}

{authenticated && isConnected && (
  <div className="flex items-center space-x-4">
    <Link href="/access" className="btn‑plain">Access</Link>
    <button onClick={logout} className="btn‑plain">Logout</button>
  </div>
)}


      </div>
    </header>

    {/* ───────── body (visible after Google auth) ───────── */}
    {authenticated && (
      <main className="relative max-w-6xl mx-auto px-6 py-12">
        {/* tabs */}
        <div className="flex flex-wrap gap-4 mb-12 items-center">
          <div className="flex bg-white/60 backdrop-blur-xl rounded-3xl p-2 shadow-xl border border-white/20">
            <Tab label="Deploy" active={tab === "deploy"} onClick={() => setTab("deploy")} />
            <Tab
              label="My Collections"
              active={tab === "mine"}
              onClick={() => {
                setTab("mine")
                refetch()
              }}
            />
            <Tab
              label="Code Generator"
              active={tab === "generate"}
              onClick={() => setTab("generate")}
            />
          </div>
        </div>

        {/* main card */}
        <div className="relative">
          <div className="absolute -inset-4 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 rounded-3xl blur opacity-20" />
          <div className="relative bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 overflow-hidden">
            <div className="p-12">
              {tab === "deploy" && (
                <DeployForm
                  onDeployed={(hash) => {
                    setTxHash(hash)
                    refetch()
                  }}
                />
              )}
{tab === "mine" &&
  (isConnected ? (
    <MyCollections addresses={collections} viewer={connectedAddress!.toLowerCase()} />
  ) : (
    <p className="text-center text-lg font-semibold">
      Connect a wallet to view your collections
    </p>
  ))}


              {tab === "generate" && <CodeGenerator />}
            </div>
          </div>
        </div>

        {/* tx banner */}
        {txHash && (
          <div className="mt-8 relative">
            <div className="absolute -inset-2 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl blur opacity-20" />
            <div className="relative p-6 bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200/50 rounded-2xl backdrop-blur-sm">
              <p className="text-emerald-800 flex items-center space-x-3 font-semibold">
                <span className="text-2xl">✅</span>
                <span>Transaction submitted:</span>
                <a
                  href={`https://sepolia.basescan.org/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold underline decoration-emerald-300 hover:decoration-emerald-400 bg-white/50 px-3 py-1 rounded-lg"
                >
                  {txHash.slice(0, 10)}…
                </a>
              </p>
            </div>
          </div>
        )}
      </main>
    )}
  </div>
)

}
