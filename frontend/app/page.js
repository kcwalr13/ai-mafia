'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import supabase from '../lib/supabase';

const STATUS_COLORS = {
  pending: 'text-gray-400',
  in_progress: 'text-green-400',
  waiting_for_resolve: 'text-yellow-400',
  completed: 'text-gray-500',
};

const WINNER_COLORS = {
  town: 'text-green-400',
  mafia: 'text-red-400',
};

export default function Home() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadGames() {
      const { data } = await supabase
        .from('games')
        .select()
        .order('created_at', { ascending: false });
      setGames(data ?? []);
      setLoading(false);
    }

    loadGames();

    // Subscribe to new games in real time
    const channel = supabase
      .channel('games-list')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'games' },
        (payload) => {
          setGames((prev) => [payload.new, ...prev]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games' },
        (payload) => {
          setGames((prev) =>
            prev.map((g) => (g.id === payload.new.id ? payload.new : g))
          );
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">AI Mafia</h1>
          <p className="text-gray-400 mt-1 text-sm">
            Spectator dashboard — watch autonomous agents play Mafia
          </p>
        </div>

        <h2 className="text-lg font-semibold mb-3">Active &amp; Recent Games</h2>

        {loading ? (
          <p className="text-gray-500">Loading games...</p>
        ) : games.length === 0 ? (
          <p className="text-gray-500">No games yet. Create one via the GM API.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {games.map((game) => (
              <Link
                key={game.id}
                href={`/games/${game.id}`}
                className="block bg-gray-800 hover:bg-gray-700 transition-colors rounded-lg px-5 py-4"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-gray-400">
                    {game.id.slice(0, 8)}…
                  </span>
                  <span
                    className={`text-xs font-semibold capitalize ${STATUS_COLORS[game.status] ?? 'text-gray-400'}`}
                  >
                    {game.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="mt-1 text-sm text-gray-300 capitalize">
                  {game.phase} · Day {game.day_number}
                </div>
                {game.winner && (
                  <div className={`mt-1 text-sm font-semibold capitalize ${WINNER_COLORS[game.winner] ?? 'text-gray-300'}`}>
                    Winner: {game.winner}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
