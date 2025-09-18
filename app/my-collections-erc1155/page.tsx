'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePrivy } from '@privy-io/react-auth'
import { useAccount, useReadContract } from 'wagmi'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function MyCollectionsERC1155Page() {
  const router = useRouter()
  const { authenticated, user, logout } = usePrivy()
  const { address } = useAccount()
  const [filter, setFilter] = useState<'all' | 'erc721' | 'erc1155'>('erc1155')

  // Fetch collections
  const { data: collections, error, mutate } = useSWR(
    address ? `/api/collections?owner=${address}` : null,
    fetcher
  )

  // Filter collections by type
  const filteredCollections = collections?.filter((collection: any) => 
    filter === 'all' || collection.collection_type === filter
  ) || []

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
    <div className="min-h-screen bg-gradient-to-br from-fuchsia-50 via-white to-pink-50 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-fuchsia-400/20 to-pink-400/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-pink-400/20 to-rose-400/20 rounded-full blur-3xl animate-pulse delay-1000" />
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
                  My ERC1155 Collections
                </h1>
                <p className="text-xs sm:text-sm text-gray-600">Manage your multi-token collections</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-4">
              <button 
                onClick={() => router.push('/deploy-erc1155')}
                className="px-3 py-2 sm:px-4 bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white rounded-xl hover:from-fuchsia-500 hover:to-pink-500 transition-all duration-300 text-xs sm:text-sm font-semibold"
              >
                + Deploy New
              </button>
              <button 
                onClick={() => router.push('/')}
                className="px-3 py-2 sm:px-4 bg-white/60 text-gray-700 rounded-xl hover:bg-white transition-all duration-300 text-xs sm:text-sm font-semibold border border-gray-200/50 backdrop-blur-sm"
              >
                ← Home
              </button>
              <button onClick={logout} className="px-4 py-2 sm:px-6 sm:py-3 bg-white/60 text-gray-700 rounded-xl hover:bg-white transition-all duration-300 text-xs sm:text-sm font-semibold border border-gray-200/50 backdrop-blur-sm">
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Filter Tabs */}
        <div className="mb-8">
          <div className="flex space-x-1 bg-white/60 backdrop-blur-sm rounded-2xl p-1 border border-white/20">
            {[
              { key: 'erc1155', label: 'ERC1155', icon: '🎯' },
              { key: 'erc721', label: 'ERC721', icon: '🖼️' },
              { key: 'all', label: 'All', icon: '📚' }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key as any)}
                className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-all duration-300 ${
                  filter === tab.key
                    ? 'bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white shadow-lg'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-white/50'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Collections Grid */}
        {error ? (
          <div className="text-center py-12">
            <div className="text-red-500 text-lg font-semibold mb-4">Error loading collections</div>
            <button
              onClick={() => mutate()}
              className="px-6 py-3 bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white rounded-xl hover:from-fuchsia-500 hover:to-pink-500 transition-all duration-300"
            >
              Try Again
            </button>
          </div>
        ) : filteredCollections.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-24 h-24 bg-gradient-to-br from-fuchsia-100 to-pink-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <span className="text-4xl">🎯</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              {filter === 'erc1155' ? 'No ERC1155 Collections' : 
               filter === 'erc721' ? 'No ERC721 Collections' : 'No Collections Found'}
            </h3>
            <p className="text-gray-500 mb-6">
              {filter === 'erc1155' ? 'Deploy your first ERC1155 collection to get started' :
               filter === 'erc721' ? 'Deploy your first ERC721 collection to get started' :
               'You haven\'t deployed any collections yet'}
            </p>
            <button
              onClick={() => router.push('/deploy-erc1155')}
              className="px-8 py-4 bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white rounded-2xl font-semibold hover:from-fuchsia-500 hover:to-pink-500 transition-all duration-300 shadow-lg"
            >
              Deploy Your First Collection
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCollections.map((collection: any) => (
              <CollectionCard key={collection.address} collection={collection} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function CollectionCard({ collection }: { collection: any }) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  // Fetch name and symbol from the smart contract
  const { data: name } = useReadContract({
    address: collection.address as `0x${string}`,
    abi: [
      {
        name: "name",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "string" }]
      }
    ],
    functionName: "name",
  })

  const { data: symbol } = useReadContract({
    address: collection.address as `0x${string}`,
    abi: [
      {
        name: "symbol", 
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "string" }]
      }
    ],
    functionName: "symbol",
  })
  
  return (
    <div className="relative bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 overflow-hidden hover:shadow-2xl transition-all duration-300 group">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-br from-fuchsia-500 to-pink-500 rounded-2xl flex items-center justify-center">
              <span className="text-white text-xl">
                {collection.collection_type === 'erc1155' ? '🎯' : '🖼️'}
              </span>
            </div>
            <div>
              <h3 className="font-bold text-gray-800 text-lg">
                {name || 'Loading...'}
              </h3>
              <p className="text-sm text-gray-500">
                {symbol ? `${symbol} • ` : ''}{collection.collection_type?.toUpperCase() || 'ERC721'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <span className="text-gray-400">
              {isExpanded ? '▼' : '▶'}
            </span>
          </button>
        </div>

        {/* Address */}
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-1">Contract Address</p>
          <p className="font-mono text-sm bg-gray-100 px-3 py-2 rounded-lg break-all">
            {collection.address}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-fuchsia-600">
              {collection.total_nfts || 0}
            </p>
            <p className="text-xs text-gray-500">Total NFTs</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-pink-600">
              {collection.codes?.length || 0}
            </p>
            <p className="text-xs text-gray-500">Codes Generated</p>
          </div>
        </div>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="border-t border-gray-200 pt-4 space-y-3">
            {collection.cid && (
              <div>
                <p className="text-xs text-gray-500 mb-1">IPFS CID</p>
                <p className="font-mono text-sm bg-gray-100 px-3 py-2 rounded-lg break-all">
                  {collection.cid}
                </p>
              </div>
            )}
            
            {collection.codes && collection.codes.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Sample Codes</p>
                <div className="grid grid-cols-3 gap-2">
                  {collection.codes.slice(0, 6).map((code: string, i: number) => (
                    <div key={i} className="text-xs font-mono bg-fuchsia-100 text-fuchsia-800 px-2 py-1 rounded text-center">
                      {code}
                    </div>
                  ))}
                </div>
                {collection.codes.length > 6 && (
                  <p className="text-xs text-gray-500 mt-2">
                    +{collection.codes.length - 6} more codes
                  </p>
                )}
              </div>
            )}

            <div className="flex space-x-2">
              <button
                onClick={() => window.open(`https://sepolia.basescan.org/address/${collection.address}`, '_blank')}
                className="flex-1 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm font-semibold"
              >
                View on Explorer
              </button>
              {collection.cid && (
                <button
                  onClick={() => window.open(`https://gateway.pinata.cloud/ipfs/${collection.cid}`, '_blank')}
                  className="flex-1 px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm font-semibold"
                >
                  View Metadata
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
