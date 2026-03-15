'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import supabase from '../../../lib/supabase';

const ROLE_COLORS = {
  mafia: 'bg-red-900 text-red-200',
  town: 'bg-green-900 text-green-200',
  unassigned: 'bg-gray-700 text-gray-300',
};

export default function GamePage() {
  const { id } = useParams();
  const [game, setGame] = useState(null);
  const [players, setPlayers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadGame() {
      const [{ data: gameData }, { data: playersData }, { data: logsData }] =
        await Promise.all([
          supabase.from('games').select().eq('id', id).single(),
          supabase.from('players').select().eq('game_id', id).order('created_at'),
          supabase
            .from('action_logs')
            .select()
            .eq('game_id', id)
            .order('created_at'),
        ]);

      setGame(gameData);
      setPlayers(playersData ?? []);
      setLogs(logsData ?? []);
      setLoading(false);
    }

    loadGame();

    // Subscribe to new action_log entries in real time
    const channel = supabase
      .channel(`game-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'action_logs',
          filter: `game_id=eq.${id}`,
        },
        (payload) => {
          setLogs((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Loading game...</p>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-red-400">Game not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">AI Mafia — Spectator View</h1>
        <p className="text-gray-400 text-sm mt-1">
          Game <span className="font-mono">{id}</span> &middot; Phase:{' '}
          <span className="capitalize">{game.phase}</span> &middot; Day{' '}
          {game.day_number} &middot;{' '}
          <span
            className={
              game.status === 'completed' ? 'text-yellow-400' : 'text-green-400'
            }
          >
            {game.status}
          </span>
        </p>
      </div>

      <div className="flex gap-6">
        {/* Player roster */}
        <div className="w-64 shrink-0">
          <h2 className="text-lg font-semibold mb-3">Players</h2>
          <div className="flex flex-col gap-2">
            {players.map((player) => (
              <div
                key={player.id}
                className={`rounded-lg px-3 py-2 flex items-center justify-between ${
                  player.is_alive ? 'opacity-100' : 'opacity-40'
                }`}
              >
                <div>
                  <p className="font-medium">{player.agent_name}</p>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      ROLE_COLORS[player.role] ?? ROLE_COLORS.unassigned
                    }`}
                  >
                    {player.role}
                  </span>
                </div>
                {!player.is_alive && (
                  <span className="text-xs text-gray-500">dead</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Event feed */}
        <div className="flex-1">
          <h2 className="text-lg font-semibold mb-3">Event Feed</h2>
          {logs.length === 0 ? (
            <p className="text-gray-500">No events yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="bg-gray-800 rounded-lg px-4 py-3 text-sm"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-gray-400 font-mono text-xs">
                      {log.entry_type}
                    </span>
                    <span className="text-gray-600 text-xs">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className="text-gray-200 whitespace-pre-wrap break-all text-xs">
                    {JSON.stringify(log.payload, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
