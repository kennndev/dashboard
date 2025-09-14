'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';

export default function AccessPage() {
  const { user } = usePrivy();
const userEmail = user?.google?.email;
const [loading, setLoading] = useState(true);

  const [list, setList] = useState<
    { id: number; email: string; role: 'super_admin' | 'admin' }[]
  >([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'super_admin'>('admin');
  const [userRole, setUserRole] = useState<'super_admin' | 'admin' | null>(null);



  async function load() {
  setLoading(true);
  const res = await fetch('/api/roles');
  const data = await res.json();
  setList(data);

  const currentUser = data.find((u: any) => u.email === userEmail);
  setUserRole(currentUser?.role || null);
  setLoading(false);
}


  async function add() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      alert('Email is required');
      return;
    }

    const res = await fetch('/api/roles', {
      method: 'POST',
      body: JSON.stringify({ email: trimmedEmail, role }),
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await res.json();
    if (!res.ok) {
      alert('Add failed: ' + result.error);
      return;
    }

    setList((prev) => [...prev, result]);
    setEmail('');
  }

  async function remove(id: number) {
    const res = await fetch('/api/roles', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await res.json();
    if (!res.ok) {
      alert('Failed to delete: ' + result.error);
      return;
    }

    setList((prev) => prev.filter((user) => user.id !== id));
  }

  useEffect(() => {
    if (userEmail) load();
  }, [userEmail]);

 return (
  <div className="max-w-xl mx-auto p-8 space-y-8">
    <Link
      href="/"
      className="inline-block px-4 py-2 rounded-xl bg-white/80 text-purple-700 hover:bg-white transition shadow-sm"
    >
      🏠
    </Link>

    <h1 className="text-3xl font-bold">Dashboard Access</h1>

    {loading ? (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-violet-400 border-t-transparent"></div>
      </div>
    ) : (
      <>
        {userRole === 'super_admin' && (
          <div className="flex space-x-4">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="flex-1 px-4 py-2 border rounded-xl"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className="px-4 py-2 border rounded-xl"
            >
              <option value="admin">admin</option>
              <option value="super_admin">super_admin</option>
            </select>
            <button
              onClick={add}
              className="px-6 py-2 bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition"
            >
              Add
            </button>
          </div>
        )}

        <ul className="space-y-2">
          {list.map((u) => (
            <li
              key={u.id}
              className="flex justify-between items-center bg-white/70 p-3 rounded-xl"
            >
              <span>
                {u.email} ({u.role})
              </span>

              {userRole === 'super_admin' && (
                <button
                  onClick={() => remove(u.id)}
                  title="Remove"
                  className="hover:text-red-600 transition"
                >
                  🗑️
                </button>
              )}
            </li>
          ))}
        </ul>
      </>
    )}
  </div>
);

}
