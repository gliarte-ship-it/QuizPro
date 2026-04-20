'use client';

import { useEffect, useState } from 'react';
import { useFirestore } from '@/hooks/use-firestore';
import { HallOfFameEntry } from '@/lib/types';
import { motion } from 'motion/react';
import { Trophy, Clock, User } from 'lucide-react';

export default function HallOfFame() {
  const { getHallOfFame } = useFirestore();
  const [entries, setEntries] = useState<HallOfFameEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRanking = async () => {
      const data = await getHallOfFame();
      setEntries(data);
      setLoading(false);
    };
    const timer = setTimeout(() => {
      fetchRanking();
    }, 0);
    return () => clearTimeout(timer);
  }, [getHallOfFame]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-center gap-3 mb-8">
        <Trophy className="text-amber-400 w-8 h-8" />
        <h2 className="text-3xl font-bold text-amber-400">Rol da Fama</h2>
      </div>

      {loading ? (
        <div className="text-center py-10">Carregando ranking...</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-10 glass rounded-2xl p-8 italic">
          Ninguém zerou o jogo ainda. Seja o primeiro!
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, index) => (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              key={entry.id}
              className={`flex items-center justify-between p-4 glass rounded-xl border-l-4 ${
                index < 3 ? 'border-amber-400' : 'border-blue-400'
              }`}
            >
              <div className="flex items-center gap-4">
                <span className="text-lg font-bold w-6">{index + 1}º</span>
                <div className="flex flex-col">
                  <span className="flex items-center gap-2 font-medium">
                    <User size={16} /> {entry.playerName}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(entry.date).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-amber-400 font-mono text-xl">
                <Clock size={20} />
                {formatTime(entry.timeInSeconds)}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
