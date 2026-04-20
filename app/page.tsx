'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { auth, loginWithGoogle, logout } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { GameStatus } from '@/lib/types';
import QuizGame from '@/components/QuizGame';
import AdminDashboard from '@/components/AdminDashboard';
import HallOfFame from '@/components/HallOfFame';
import { useFirestore } from '@/hooks/use-firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Play, Settings, LogOut, BrainCircuit, Timer, ShieldCheck } from 'lucide-react';

// Componente auxiliar para detectar o modo admin via URL de forma segura para o Next.js
function AdminModeDetector({ onAdminDetected }: { onAdminDetected: () => void }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get('mode') === 'admin') {
      onAdminDetected();
    }
  }, [searchParams, onAdminDetected]);
  return null;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<GameStatus>('welcome');
  const [playerName, setPlayerName] = useState('');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const { saveToHallOfFame } = useFirestore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
      if (u) {
        setPlayerName(u.displayName || 'Jogador Anônimo');
      }
    });
    return () => unsubscribe();
  }, []);

  const isAdmin = user?.email === 'gliarte@gmail.com';

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      if (err.code === 'auth/cancelled-popup-request' || err.code === 'auth/popup-closed-by-user') {
        console.warn('Login popup was closed or cancelled.');
      } else {
        console.error('Login error:', err);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleWin = (totalTime: number) => {
    setStatus('ranking');
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-bg-deep text-[#F8FAFC] selection:bg-primary/30">
      <Suspense fallback={null}>
        <AdminModeDetector onAdminDetected={() => setStatus('admin')} />
      </Suspense>
      {/* Navigation */}
      <nav className="px-6 py-5 flex justify-between items-center bg-bg-deep border-b-2 border-border sticky top-0 z-40">
        <div 
          onClick={() => setStatus('welcome')} 
          className="flex items-center gap-3 cursor-pointer group"
        >
          <div className="bg-primary p-2 rounded-xl shadow-lg shadow-primary/20 transition-transform group-hover:scale-110">
            <BrainCircuit className="text-slate-950" size={24} />
          </div>
          <span className="text-2xl font-black tracking-tighter uppercase italic">
            QUIZ<span className="text-primary">PRO</span>
          </span>
        </div>

        {/* Centralized Credits */}
        <div className="hidden md:flex flex-col items-center justify-center text-[10px] uppercase font-black tracking-[0.2em] space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-muted">Desenvolvedor:</span>
            <span className="text-primary">Gustavo Liarte</span>
          </div>
          <div className="flex items-center gap-3 text-muted/60">
            <span className="flex items-center gap-1 hover:text-white transition-colors cursor-default">
              gliarte@gmail.com
            </span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span className="hover:text-white transition-colors cursor-default">86 98108-0438</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline-block text-muted">{user.email}</span>
              <button 
                onClick={logout} 
                className="w-10 h-10 flex items-center justify-center bg-bg-surface border-2 border-border rounded-xl text-muted hover:text-white hover:border-white/20 transition-all"
                title="Sair"
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <button 
              onClick={handleLogin} 
              disabled={isLoggingIn}
              className={`text-xs font-black uppercase tracking-[0.2em] bg-bg-surface hover:bg-slate-700 px-6 py-3 rounded-xl border-2 border-border transition-all ${isLoggingIn ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isLoggingIn ? 'Entrando...' : 'Entrar'}
            </button>
          )}
        </div>
      </nav>

      <div className="container mx-auto pt-4 pb-4 px-6">
        <AnimatePresence mode="wait">
          {status === 'welcome' && (
            <motion.div 
              key="welcome"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              className="max-w-5xl mx-auto flex flex-col items-center text-center space-y-8 py-6"
            >
              <div className="flex flex-col gap-14">
                <div className="difficulty-badge mx-auto">Mestre do Conhecimento</div>
                <motion.h1 
                  className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tighter whitespace-nowrap leading-tight"
                >
                  VOCÊ É UM <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">GÊNIO?</span>
                </motion.h1>
                <p className="text-muted text-lg sm:text-2xl font-bold max-w-2xl mx-auto leading-relaxed mt-[-1rem]">
                  Desafie seu intelecto em 15 níveis de pura estratégia e conhecimento. 
                  Entre para a elite do QuizPro.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 w-full max-w-2xl">
                <button 
                  onClick={() => setStatus('playing')}
                  className="btn-primary py-8 text-2xl flex items-center justify-center gap-4 group"
                >
                  <Play size={24} fill="currentColor" className="group-hover:translate-x-1 transition-transform" /> 
                  INICIAR JOGO
                </button>
                <button 
                  onClick={() => setStatus('ranking')}
                  className="btn-secondary py-8 text-2xl flex items-center justify-center gap-4 group"
                >
                  <Trophy size={24} className="group-hover:scale-110 transition-transform" /> 
                  RANKING
                </button>
              </div>

              {isAdmin && (
                <button 
                  onClick={() => setStatus('admin')}
                  className="flex items-center gap-3 px-6 py-3 bg-bg-surface/50 border-2 border-dashed border-border rounded-2xl text-muted hover:text-amber-500 hover:border-amber-500/50 transition-all font-bold text-sm"
                >
                  <ShieldCheck size={20} /> Painel Administrativo
                </button>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-12 pt-8 w-full">
                {[
                  { icon: <BrainCircuit />, label: "15 Níveis", color: "text-primary" },
                  { icon: <Timer />, label: "Precisão", color: "text-secondary" },
                  { icon: <Trophy />, label: "Hall Global", color: "text-emerald-500" }
                ].map((item, id) => (
                  <div key={id} className="flex flex-col items-center gap-4 group">
                    <div className={`w-20 h-20 bg-bg-surface border-2 border-border rounded-3xl flex items-center justify-center ${item.color} shadow-xl transition-all group-hover:-translate-y-2 group-hover:border-white/10`}>
                      {item.icon}
                    </div>
                    <span className="text-[10px] uppercase font-black tracking-[0.3em] text-muted">{item.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {status === 'playing' && (
            <motion.div key="playing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <QuizGame 
                onGameOver={handleWin} 
                onExit={() => setStatus('welcome')} 
              />
            </motion.div>
          )}

          {status === 'ranking' && (
            <motion.div key="ranking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <HallOfFame />
              <div className="text-center mt-8">
                <button onClick={() => setStatus('welcome')} className="btn-primary">Voltar ao Início</button>
              </div>
            </motion.div>
          )}

          {status === 'admin' && isAdmin && (
            <motion.div key="admin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <AdminDashboard />
              <div className="text-center mt-8">
                <button onClick={() => setStatus('welcome')} className="btn-primary">Sair do Painel</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer info */}
      <footer className="py-4 text-center text-slate-600 text-xs uppercase tracking-widest font-mono">
        &copy; 2026 Quiz Show Brasil - Desafio Conhecimento
      </footer>
    </main>
  );
}
