'use client'

import React, { useState, useEffect, Suspense } from 'react'
import axios from 'axios'
import { keccak256, encodePacked } from 'viem'
import { useReadContract, useWriteContract } from 'wagmi'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

const pinataJWT = process.env.NEXT_PUBLIC_PINATA_JWT!

type Combined = { code: string; uri: string; hash: string }

function GenerateHashesContent() {
  const searchParams = useSearchParams()
  const [images, setImages] = useState<File[]>([])
  const [addressInput, setAddressInput] = useState('')
  const [selectedAddress, setSelectedAddress] = useState<`0x${string}` | undefined>(undefined)
  const [hashesOutput, setHashesOutput] = useState<string[]>([])
  const [combinedOutput, setCombinedOutput] = useState<Combined[]>([])
  const [status, setStatus] = useState('')
  const [metaCID, setMetaCID] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([])
  const { writeContractAsync } = useWriteContract()

  // Initialize address from URL parameter
  useEffect(() => {
    const addressParam = searchParams.get('address')
    if (addressParam && addressParam.startsWith('0x') && addressParam.length === 42) {
      setAddressInput(addressParam)
      setSelectedAddress(addressParam as `0x${string}`)
    }
  }, [searchParams])

  useEffect(() => {
    const v = addressInput.trim()
    setSelectedAddress(v.startsWith('0x') && v.length === 42 ? (v as `0x${string}`) : undefined)
  }, [addressInput])

  const nameResult = useReadContract(
    selectedAddress
      ? {
          address: selectedAddress,
          abi: [{ name: 'name', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] }],
          functionName: 'name',
        }
      : undefined,
  )
  const symbolResult = useReadContract(
    selectedAddress
      ? {
          address: selectedAddress,
          abi: [{ name: 'symbol', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] }],
          functionName: 'symbol',
        }
      : undefined,
  )

  const name  = nameResult.data
  const symbol = symbolResult.data

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files)
      setImages(files)
      // Auto-generate codes when images are uploaded
      generateCodesForImages(files.length)
    }
  }

  // Auto-generate codes based on number of images
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

  async function handleAutomatedProcess() {
    if (!images.length) return alert('Please upload images first')
    if (!selectedAddress) return alert('Please select a valid collection address')

    setIsProcessing(true)
    setStatus('🚀 Starting automated process...')

    try {
      // Step 1: Upload images to IPFS
      setStatus('📤 Uploading images to IPFS...')
      const imgCIDs: string[] = []
      for (let i = 0; i < images.length; i++) {
        const file = images[i]
        const fd = new FormData()
        fd.append('file', file, file.name)
        const { data } = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', fd, {
          headers: { Authorization: `Bearer ${pinataJWT}` },
        })
        imgCIDs.push(`ipfs://${data.IpfsHash}`)
        setStatus(`📤 Uploading images to IPFS... (${i + 1}/${images.length})`)
      }

      // Step 2: Create and upload metadata
      setStatus('📝 Creating metadata...')
      const folder = 'metadata'
      const metaFD = new FormData()
      generatedCodes.forEach((code, i) => {
        const meta = { 
          name: `${name} #${i + 1}`, 
          description: `Claimed with code: ${code}`, 
          image: imgCIDs[i],
          attributes: [
            { trait_type: "Code", value: code },
            { trait_type: "Collection", value: name || "Cardify Collection" }
          ]
        }
        metaFD.append('file', new Blob([JSON.stringify(meta)], { type: 'application/json' }), `${folder}/${i}.json`)
      })
      metaFD.append('pinataMetadata', JSON.stringify({ name: 'cardify‑metadata‑folder' }))
      metaFD.append('pinataOptions', JSON.stringify({ wrapWithDirectory: true }))

      setStatus('📤 Uploading metadata to IPFS...')
      const metaRes = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', metaFD, {
        headers: { Authorization: `Bearer ${pinataJWT}` },
      })
      const cid: string = metaRes.data.IpfsHash
      setMetaCID(cid)

      // Step 3: Save collection data
      setStatus('💾 Saving collection data...')
      await fetch(`/api/collections/${selectedAddress.toLowerCase()}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid, owner: selectedAddress.toLowerCase() }),
      })

      // Step 4: Generate hashes
      setStatus('🔐 Generating hashes...')
      const hashes = generatedCodes.map((code, i) =>
        keccak256(encodePacked(['string', 'string'], [code, `ipfs://${cid}/metadata/${i}.json`])),
      )
      setHashesOutput(hashes)
      setCombinedOutput(generatedCodes.map((code, i) => ({
        code,
        uri: `ipfs://${cid}/metadata/${i}.json`,
        hash: hashes[i]
      })))

      // Step 5: Add hashes to contract
      setStatus('⛓️ Adding hashes to smart contract...')
      const txHash = await writeContractAsync({
        address: selectedAddress,
        abi: [{ name: 'addValidHashes', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'hashes', type: 'bytes32[]' }], outputs: [] }],
        functionName: 'addValidHashes',
        args: [hashes],
      })

      setStatus('✅ Process completed successfully!')
      setTimeout(() => {
        setStatus('🎉 All done! Your collection is ready with ' + images.length + ' NFTs and codes.')
      }, 2000)

    } catch (err: any) {
      console.error(err)
      setStatus('❌ Process failed: ' + (err?.response?.data?.error || err.message))
    } finally {
      setIsProcessing(false)
    }
  }

    const copyHashes = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(hashesOutput, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

  
return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-violet-400/20 to-fuchsia-400/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-br from-fuchsia-400/10 to-violet-400/10 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      {/* Header */}
      <header className="relative bg-white/70 backdrop-blur-xl border-b border-white/20 shadow-lg shadow-violet-500/5">
        <div className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <div className="w-12 h-12 bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/25 transform rotate-3 hover:rotate-6 transition-transform duration-300">
                <span className="text-white text-xl font-bold transform -rotate-3 hover:-rotate-6 transition-transform duration-300">
                  🎯
                </span>
              </div>
              <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 rounded-2xl blur opacity-30 animate-pulse"></div>
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 bg-clip-text text-transparent">
              Generate Hashes
            </h1>
          </div>
          <Link href="/">
            <button className="px-8 py-3 bg-white/60 text-gray-700 rounded-2xl font-semibold hover:bg-white transition-all duration-300 border border-white/20 backdrop-blur-sm hover:shadow-lg transform hover:-translate-y-0.5">
              ← Back to Dashboard
            </button>
          </Link>
        </div>
      </header>

      <main className="relative max-w-5xl mx-auto px-6 py-12">
        <div className="relative">
          <div className="absolute -inset-4 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 rounded-3xl blur opacity-20"></div>
          <div className="relative bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 overflow-hidden">
            <div className="p-12 space-y-10">
              {/* Header Section */}
              <div className="text-center space-y-4">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-3xl shadow-lg shadow-violet-500/25 mb-6">
                  <span className="text-3xl">🎯</span>
                </div>
                <h2 className="text-4xl font-bold bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 bg-clip-text text-transparent">
                  Generate Hashes for Your NFT Collection
                </h2>
                <p className="text-gray-600 max-w-2xl mx-auto text-lg">
                  Upload your images and pass codes to generate the necessary hashes for your NFT collection
                </p>
              </div>

              {/* Collection Address Input */}
              <div className="space-y-4 group">
                <label className="text-lg font-semibold text-gray-700 flex items-center space-x-3">
                  <span className="w-3 h-3 bg-gradient-to-r from-violet-500 to-purple-500 rounded-full"></span>
                  <span>NFT Collection Address</span>
                </label>
                <input
                  className="w-full px-6 py-4 border-2 border-gray-200 rounded-2xl focus:ring-4 focus:ring-violet-500/20 focus:border-violet-500 transition-all duration-300 bg-white/50 backdrop-blur-sm hover:bg-white group-hover:border-violet-300 text-lg font-mono"
                  placeholder="0x..."
                  value={addressInput}
                  onChange={(e) => setAddressInput(e.target.value)}
                />
                {name && symbol && (
                  <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200/50 rounded-2xl backdrop-blur-sm">
                    <p className="text-emerald-800 font-semibold flex items-center space-x-2">
                      <span className="text-xl">✅</span>
                      <span>
                        Loaded Collection: <span className="font-bold">{name}</span> ({symbol})
                      </span>
                    </p>
                  </div>
                )}
              </div>

              {/* Upload Section */}
              <div className="grid md:grid-cols-2 gap-8">
                {/* Images Upload */}
                <div className="space-y-4 group">
                  <label className="text-lg font-semibold text-gray-700 flex items-center space-x-3">
                    <span className="w-3 h-3 bg-gradient-to-r from-fuchsia-500 to-pink-500 rounded-full"></span>
                    <span>Upload Images</span>
                  </label>
                  <div className="relative">
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      onChange={handleImageUpload}
                    />
                    <div className="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center hover:border-violet-400 transition-all duration-300 bg-white/50 backdrop-blur-sm group-hover:bg-white">
                      <div className="space-y-3">
                        <div className="w-16 h-16 bg-gradient-to-br from-violet-100 to-fuchsia-100 rounded-2xl flex items-center justify-center mx-auto">
                          <span className="text-2xl">📸</span>
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-gray-700">
                            {images.length > 0 ? `${images.length} images selected` : "Click to upload images"}
                          </p>
                          <p className="text-gray-500">Support multiple image formats</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pass Codes */}
                <div className="space-y-4 group">
                  <label className="text-lg font-semibold text-gray-700 flex items-center space-x-3">
                    <span className="w-3 h-3 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full"></span>
                    <span>Pass Codes (one per line)</span>
                  </label>
                  <textarea
                    className="w-full px-6 py-4 border-2 border-gray-200 rounded-2xl focus:ring-4 focus:ring-violet-500/20 focus:border-violet-500 transition-all duration-300 bg-white/50 backdrop-blur-sm hover:bg-white group-hover:border-violet-300 font-mono"
                    rows={8}
                    value={passes}
                    onChange={(e) => setPasses(e.target.value)}
                    placeholder="PASS001&#10;PASS002&#10;PASS003&#10;..."
                  />
                </div>
              </div>

              {/* Generate Button */}
              <div className="text-center">
                <button
                  onClick={handleGenerate}
                  disabled={!images.length || !passes.trim() || !selectedAddress}
                  className="px-12 py-5 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-white rounded-2xl font-bold text-xl disabled:opacity-50 disabled:cursor-not-allowed hover:from-violet-500 hover:via-purple-500 hover:to-fuchsia-500 transition-all duration-300 shadow-xl shadow-violet-500/25 hover:shadow-2xl hover:shadow-violet-500/40 transform hover:-translate-y-1 relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <span className="relative z-10 flex items-center justify-center space-x-3">
                    <span>🚀</span>
                    <span>Generate & Upload</span>
                    <span>✨</span>
                  </span>
                </button>
              </div>

              {/* Status */}
              {status && (
                <div className="text-center">
                  <div className="inline-block p-4 bg-gradient-to-r from-violet-50 to-fuchsia-50 border-2 border-violet-200/50 rounded-2xl backdrop-blur-sm">
                    <p className="text-violet-800 font-semibold text-lg">{status}</p>
                  </div>
                </div>
              )}

              {/* Metadata CID */}
              {metaCID && (
                <div className="p-6 bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200/50 rounded-2xl backdrop-blur-sm">
                  <p className="text-emerald-800 font-semibold text-center flex items-center justify-center space-x-3">
                    <span className="text-xl">✅</span>
                    <span>Metadata root CID:</span>
                    <code className="bg-white/60 px-4 py-2 rounded-xl font-mono border border-emerald-200/50">
                      {metaCID}
                    </code>
                  </p>
                </div>
              )}

              {/* Hashes Output */}
       {hashesOutput.length > 0 && (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <h3 className="text-2xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent flex items-center space-x-3">
        <span className="w-3 h-3 bg-gradient-to-r from-violet-500 to-purple-500 rounded-full"></span>
        <span>🧮 Hashes (for `addValidHashes`)</span>
      </h3>
      <button
        onClick={copyHashes}
        className="text-xl transition-transform hover:scale-110 focus:outline-none"
        title="Copy all hashes"
      >
        {copied ? "✅" : "📋"}
      </button>
    </div>

    <div className="relative group">
      <div className="absolute -inset-2 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 rounded-2xl blur opacity-20 group-hover:opacity-30 transition-opacity duration-300"></div>
      <pre className="relative whitespace-pre-wrap break-words border-2 border-gray-200/50 p-6 bg-white/60 backdrop-blur-sm rounded-2xl text-sm overflow-x-auto font-mono hover:bg-white transition-all duration-300">
        {JSON.stringify(hashesOutput, null, 2)}
      </pre>
    </div>
  </div>
)}

              {/* Combined Output */}
              {combinedOutput.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-2xl font-bold bg-gradient-to-r from-fuchsia-600 to-pink-600 bg-clip-text text-transparent flex items-center space-x-3">
                    <span className="w-3 h-3 bg-gradient-to-r from-fuchsia-500 to-pink-500 rounded-full"></span>
                    <span>📦 Code / URI / Hash</span>
                  </h3>
                  <div className="relative group">
                    <div className="absolute -inset-2 bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-600 rounded-2xl blur opacity-20 group-hover:opacity-30 transition-opacity duration-300"></div>
                    <pre className="relative whitespace-pre-wrap break-words border-2 border-gray-200/50 p-6 bg-white/60 backdrop-blur-sm rounded-2xl text-sm overflow-x-auto font-mono hover:bg-white transition-all duration-300">
                      {JSON.stringify(combinedOutput, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function GenerateHashesTab() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-3xl flex items-center justify-center mx-auto animate-pulse">
            <span className="text-2xl">🎯</span>
          </div>
          <p className="text-gray-600 font-semibold">Loading Generate Hashes...</p>
        </div>
      </div>
    }>
      <GenerateHashesContent />
    </Suspense>
  )
}
