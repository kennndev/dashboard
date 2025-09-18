"use client"

import { useState, useEffect } from "react"
import { usePrivy } from "@privy-io/react-auth"
import { useRouter } from "next/navigation"
import Link from "next/link"
import useSWR from 'swr'

export default function HomePage() {
  const router = useRouter()
  const { ready, authenticated, user, login, logout } = usePrivy()
  const [hasSelectedType, setHasSelectedType] = useState<boolean | null>(null)
  
  const email = (user?.google?.email ?? user?.email?.address ?? '').toLowerCase()

  // SWR hook for roles
  const fetcher = (url: string) => fetch(url).then(r => r.json());
  const { data: roles, isLoading: rolesLoading } = useSWR(
    authenticated ? '/api/roles' : null,
    fetcher
  );

  // Check if user has selected collection type
  useEffect(() => {
    if (authenticated && typeof window !== 'undefined') {
      const collectionType = localStorage.getItem('collectionType')
      setHasSelectedType(!!collectionType)
    } else if (!authenticated) {
      setHasSelectedType(null) // Reset when not authenticated
    }
  }, [authenticated])

  // Check if user has proper role
  const allowed = authenticated && roles?.some((r: { email: string }) => r.email.toLowerCase() === email);

  // Show loading while checking authentication and roles
  if (!ready || (authenticated && rolesLoading)) {
    return <div className="min-h-screen flex items-center justify-center">Loading…</div>
  }

  // Show login if not authenticated or not authorized
  if (!authenticated || !allowed) {
    if (authenticated && !allowed) {
      logout(); // Log out if authenticated but not authorized
    }
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 flex flex-col items-center justify-center space-y-6">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-3xl shadow-lg shadow-violet-500/25 mb-6">
            <span className="text-3xl">🎨</span>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 bg-clip-text text-transparent">
            Welcome to Cardify Collections
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Deploy and manage your NFT collections with ease
          </p>
        </div>
        <button
          onClick={login}
          className="px-12 py-5 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-white rounded-2xl font-bold text-lg hover:from-violet-500 hover:via-purple-500 hover:to-fuchsia-500 transition-all duration-300 shadow-xl shadow-violet-500/25 hover:shadow-2xl hover:shadow-violet-500/40 transform hover:-translate-y-1"
        >
          Sign in with Google
        </button>
      </div>
    )
  }

  // Show collection type selection page for authenticated users
  if (authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 relative overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-violet-400/20 to-fuchsia-400/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-full blur-3xl animate-pulse delay-1000" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-br from-fuchsia-400/10 to-violet-400/10 rounded-full blur-3xl animate-pulse delay-500" />
        </div>

        {/* Header */}
        <header className="relative bg-white/70 backdrop-blur-xl border-b border-white/20 sticky top-0 z-50 shadow-lg shadow-violet-500/5">
          <div className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center">
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
                Cardify Collections
              </h1>
            </div>
            <button onClick={logout} className="px-6 py-3 bg-white/60 text-gray-700 rounded-xl hover:bg-white transition-all duration-300 font-semibold border border-gray-200/50 backdrop-blur-sm">
              Logout
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="relative max-w-4xl mx-auto px-6 py-12">
          <div className="text-center space-y-6 mb-12">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-3xl shadow-lg shadow-violet-500/25 mb-6">
              <span className="text-3xl">🚀</span>
            </div>
            <h2 className="text-4xl font-bold bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 bg-clip-text text-transparent">
              Choose Collection Type
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Select the type of NFT collection you want to deploy. Each type has different features and use cases.
            </p>
          </div>

          {/* Collection Type Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            {/* ERC721 Card */}
            <div 
              className="relative cursor-pointer transition-all duration-300 transform hover:scale-105"
              onClick={() => {
                localStorage.setItem('collectionType', 'erc721')
                router.push('/deploy-erc721')
              }}
            >
              <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 rounded-3xl blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200 animate-pulse"></div>
              <div className="relative bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 overflow-hidden hover:shadow-2xl transition-all duration-500">
                <div className="p-8 space-y-6">
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-purple-500 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
                      <span className="text-2xl">🎨</span>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-800">ERC721 Collection</h3>
                    <p className="text-gray-600">
                      Traditional NFT collection where each token is unique and indivisible
                    </p>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3 p-3 bg-violet-50/50 rounded-xl">
                      <div className="w-2 h-2 bg-violet-500 rounded-full"></div>
                      <span className="text-sm font-semibold text-violet-700">Unique tokens</span>
                    </div>
                    <div className="flex items-center space-x-3 p-3 bg-violet-50/50 rounded-xl">
                      <div className="w-2 h-2 bg-violet-500 rounded-full"></div>
                      <span className="text-sm font-semibold text-violet-700">Individual metadata</span>
                    </div>
                    <div className="flex items-center space-x-3 p-3 bg-violet-50/50 rounded-xl">
                      <div className="w-2 h-2 bg-violet-500 rounded-full"></div>
                      <span className="text-sm font-semibold text-violet-700">Art & collectibles</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ERC1155 Card */}
            <div 
              className="relative cursor-pointer transition-all duration-300 transform hover:scale-105"
              onClick={() => {
                localStorage.setItem('collectionType', 'erc1155')
                router.push('/deploy-erc1155')
              }}
            >
              <div className="absolute -inset-1 bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-600 rounded-3xl blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200 animate-pulse"></div>
              <div className="relative bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 overflow-hidden hover:shadow-2xl transition-all duration-500">
                <div className="p-8 space-y-6">
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-fuchsia-500 to-pink-500 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
                      <span className="text-2xl">🎯</span>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-800">ERC1155 Collection</h3>
                    <p className="text-gray-600">
                      Multi-token standard supporting both fungible and non-fungible tokens
                    </p>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3 p-3 bg-fuchsia-50/50 rounded-xl">
                      <div className="w-2 h-2 bg-fuchsia-500 rounded-full"></div>
                      <span className="text-sm font-semibold text-fuchsia-700">Batch operations</span>
                    </div>
                    <div className="flex items-center space-x-3 p-3 bg-fuchsia-50/50 rounded-xl">
                      <div className="w-2 h-2 bg-fuchsia-500 rounded-full"></div>
                      <span className="text-sm font-semibold text-fuchsia-700">Gas efficient</span>
                    </div>
                    <div className="flex items-center space-x-3 p-3 bg-fuchsia-50/50 rounded-xl">
                      <div className="w-2 h-2 bg-fuchsia-500 rounded-full"></div>
                      <span className="text-sm font-semibold text-fuchsia-700">Gaming & utilities</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation to existing dashboard */}
          <div className="text-center">
            <Link
              href="/dashboard"
              className="px-8 py-4 bg-white/60 text-gray-700 rounded-2xl font-semibold text-lg hover:bg-white transition-all duration-300 shadow-lg border border-gray-200/50 backdrop-blur-sm hover:shadow-xl transform hover:-translate-y-1"
            >
              View All Collections
            </Link>
          </div>
        </main>
      </div>
    )
  }

  // Show collection type selection page for authenticated users
  // (removed automatic redirect to allow users to choose)

  return <div className="min-h-screen flex items-center justify-center">Loading...</div>
}
