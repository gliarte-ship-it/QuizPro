'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useFirestore } from '@/hooks/use-firestore';
import { Question, GameStatus } from '@/lib/types';
import { motion, AnimatePresence } from 'motion/react';
import { SkipForward, Scissors, Clock, Trophy, AlertCircle, RefreshCw, LogOut, CheckCircle2, XCircle, AlertTriangle, Send } from 'lucide-react';
import Image from 'next/image';
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || '' });

interface QuizGameProps {
  onGameOver: (totalTime: number) => void;
  onExit: () => void;
}

// Utility to enforce the user's provided images (expected in /public/thinking/1.jpg to 16.jpg)
const getThinkingImageUrl = (q: Partial<Question>) => {
  if (!q.text) return "/thinking/1.jpg";
  const imageIndex = (q.text.length % 16) + 1;
  return `/thinking/${imageIndex}.jpg`;
};

// Sound utility for local/remote royalty-free sounds
const playSound = (type: 'correct' | 'wrong' | 'win') => {
  const sounds = {
    correct: 'https://cdn.pixabay.com/audio/2022/03/15/audio_7833388701.mp3', // Short chime
    wrong: 'https://cdn.pixabay.com/audio/2021/08/04/audio_06d691060c.mp3',   // Error buzz
    win: 'https://cdn.pixabay.com/audio/2021/08/04/audio_cbb0924976.mp3'     // Long fanfare
  };
  
  const audio = new Audio(sounds[type]);
  audio.volume = 0.5;
  audio.play().catch(e => console.warn('Audio play failed:', e));
};

export default function QuizGame({ onGameOver, onExit }: QuizGameProps) {
  const { getQuestionsByLevel, addQuestion, updateQuestion, saveToHallOfFame, saveReport } = useFirestore();
  const [currentLevel, setCurrentLevel] = useState(1);
  const [question, setQuestion] = useState<Question | null>(null);
  const [loading, setLoading] = useState(true);
  const [time, setTime] = useState(0);
  const [usedSkip, setUsedSkip] = useState(false);
  const [used5050, setUsed5050] = useState(false);
  const [status, setStatus] = useState<'playing' | 'feedback' | 'finished'>('playing');
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [hiddenOptions, setHiddenOptions] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [askedIds, setAskedIds] = useState<string[]>([]);
  const [dbUsedCount, setDbUsedCount] = useState(0);
  const [usedCategories, setUsedCategories] = useState<string[]>([]);
  const [winnerName, setWinnerName] = useState('');
  const [winnerEmail, setWinnerEmail] = useState('');
  const [saving, setSaving] = useState(false);

  // Reporting state
  const [isReporting, setIsReporting] = useState(false);
  const [reportFeedback, setReportFeedback] = useState('');
  const [reportEmail, setReportEmail] = useState('');
  const [isSendingReport, setIsSendingReport] = useState(false);
  const [reportSent, setReportSent] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const loadQuestion = useCallback(async (level: number) => {
    setLoading(true);
    setHiddenOptions([]);
    setSelectedOption(null);
    setFeedback(null);
    setStatus('playing');

    // Cross-game tracking for Level 1
    let recentStarts: string[] = [];
    try {
      const stored = localStorage.getItem('quiz_recent_starts');
      if (stored) recentStarts = JSON.parse(stored);
    } catch (e) {
      console.error("Error reading recent starts", e);
    }

    // Lógica para decidir se usa Banco de Dados ou IA (Máximo 2 do banco por jogo)
    // Calculamos uma probabilidade baseada nos níveis restantes para que as 2 questões 
    // do banco possam aparecer em qualquer lugar (início, meio ou fim) de forma equilibrada.
    const levelsRemaining = 16 - level; 
    const dbRemaining = 2 - dbUsedCount;
    const dbProbability = dbRemaining > 0 ? dbRemaining / levelsRemaining : 0;
    
    const shouldTryDb = Math.random() < dbProbability;
    const available = shouldTryDb ? await getQuestionsByLevel(level) : [];
    
    // Filtro rigoroso: Não repetir questão e NÃO repetir categoria no mesmo jogo
    const pool = available.filter(q => 
      !askedIds.includes(q.id!) && 
      !usedCategories.includes(q.category || '')
    );

    if (pool.length > 0 && dbUsedCount < 2) {
      // Pick a random one from the level
      const randomQ = pool[Math.floor(Math.random() * pool.length)];
      
      // Auto-fix DB image if needed in the background
      const correctUrl = getThinkingImageUrl(randomQ);
      if (randomQ.imageUrl !== correctUrl && randomQ.id) {
        updateQuestion(randomQ.id, { imageUrl: correctUrl });
        randomQ.imageUrl = correctUrl;
      }

      setQuestion(randomQ);
      
      if (level === 1) {
        const updatedStarts = [randomQ.text, ...recentStarts].slice(0, 4);
        localStorage.setItem('quiz_recent_starts', JSON.stringify(updatedStarts));
      }

      if (randomQ.id) {
        setAskedIds(prev => [...prev, randomQ.id!]);
        setUsedCategories(prev => [...prev, randomQ.category || '']);
        setDbUsedCount(prev => prev + 1);
      }
    } else {
      // Gerar via IA se não houver no banco ou se a sorte/lógica decidiu pela IA
      let attempts = 0;
      const maxAttempts = 3;
      let success = false;

      while (attempts < maxAttempts && !success) {
        try {
          const excludeCats = usedCategories.length > 0 
            ? `\nREGRAS CRÍTICAS:\n1. A categoria deve ser OBRIGATORIAMENTE diferente de: ${usedCategories.join(', ')}.\n2. Não priorize nenhum tema específico, use conhecimentos gerais variados.` 
            : '\nREGRA CRÍTICA: Use conhecimentos gerais variados, sem priorizar nenhum tema específico.';
          
          const response = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: `Gere uma pergunta de quiz de altíssima qualidade em Português do Brasil para o nível ${level} (escala 1-15). 
            O assunto deve ser totalmente variado (História, Ciência, Geografia, Artes, Esportes, Entretenimento, etc).${excludeCats}
            Retorne em JSON com: text, options (array de 4 strings), correctIndex (0-3), source (nome da fonte) e category (em uma ou duas palavras).`,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctIndex: { type: Type.INTEGER },
                  source: { type: Type.STRING },
                  category: { type: Type.STRING }
                },
                required: ["text", "options", "correctIndex", "source", "category"]
              }
            }
          });

          const resText = response.text;
          if (resText) {
            const data = JSON.parse(resText);
            const aiQuestion = {
              ...data,
              imageUrl: getThinkingImageUrl({ text: data.text }),
              level: level
            } as Question;
            
            if (level === 1) {
              const updatedStarts = [aiQuestion.text, ...recentStarts].slice(0, 4);
              localStorage.setItem('quiz_recent_starts', JSON.stringify(updatedStarts));
            }

            setUsedCategories(prev => [...prev, aiQuestion.category || '']);
            setQuestion(aiQuestion);
            success = true;
            
            // Grava no acervo de questões (Firestore) para futuras rodadas
            addQuestion(aiQuestion);
          }
        } catch (err) {
          attempts++;
          console.error(`Erro ao gerar via IA (Tentativa ${attempts}):`, err);
          if (attempts === maxAttempts) {
            setQuestion(null);
          } else {
            await new Promise(resolve => setTimeout(resolve, 800 * attempts));
          }
        }
      }
    }
    setLoading(false);
  }, [getQuestionsByLevel, addQuestion, updateQuestion, askedIds, dbUsedCount, usedCategories]);

  const initialLoadRef = useRef(false);

  useEffect(() => {
    if (!initialLoadRef.current) {
      const timer = setTimeout(() => {
        loadQuestion(1);
      }, 0);
      initialLoadRef.current = true;
    }

    timerRef.current = setInterval(() => {
      setTime(prev => prev + 1);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loadQuestion]);

  const handleAnswer = (index: number) => {
    if (status !== 'playing') return;

    setSelectedOption(index);
    if (index === question?.correctIndex) {
      setFeedback('correct');
      setStatus('feedback');
      
      if (currentLevel === 15) {
        playSound('win');
      } else {
        playSound('correct');
      }

      setTimeout(() => {
        if (currentLevel === 15) {
          if (timerRef.current) clearInterval(timerRef.current);
          setStatus('finished');
        } else {
          setCurrentLevel(prev => prev + 1);
          loadQuestion(currentLevel + 1);
        }
      }, 2000);
    } else {
      playSound('wrong');
      setFeedback('wrong');
      setStatus('feedback');
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const useSkip = () => {
    if (usedSkip || status !== 'playing') return;
    setUsedSkip(true);
    if (currentLevel === 15) {
      if (timerRef.current) clearInterval(timerRef.current);
      setStatus('finished');
    } else {
      setCurrentLevel(prev => prev + 1);
      loadQuestion(currentLevel + 1);
    }
  };

  const use5050 = () => {
    if (used5050 || status !== 'playing' || !question) return;
    setUsed5050(true);
    
    // Find incorrect indices
    const incorrectIndices = question.options
      .map((_, i) => i)
      .filter(i => i !== question.correctIndex);
    
    // Shuffle and pick 2 to hide
    const toHide = incorrectIndices.sort(() => Math.random() - 0.5).slice(0, 2);
    setHiddenOptions(toHide);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSendReport = async () => {
    if (!question || isSendingReport) return;
    setIsSendingReport(true);
    try {
      await saveReport({
        questionId: question.id || 'ai-gen',
        questionText: question.text,
        userFeedback: reportFeedback,
        userEmail: reportEmail || 'Anônimo',
        date: new Date().toISOString()
      });
      setReportSent(true);
      setTimeout(() => {
        setIsReporting(false);
        setReportSent(false);
        setReportFeedback('');
      }, 3000);
    } catch (e) {
      console.error(e);
      alert("Erro ao enviar denúncia. Tente novamente.");
    } finally {
      setIsSendingReport(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <RefreshCw className="animate-spin text-amber-500 w-12 h-12" />
        <p className="text-xl font-bold animate-pulse">Carregando Desafio...</p>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center p-6 glass rounded-3xl">
        <AlertCircle className="text-amber-500 w-16 h-16" />
        <h2 className="text-2xl font-bold">Sem perguntas para o Nível {currentLevel}</h2>
        <p className="text-slate-400">O administrador ainda não cadastrou perguntas para este nível.</p>
        <button onClick={onExit} className="btn-primary">Voltar ao Menu</button>
      </div>
    );
  }

  return (
    <div className="game-container max-w-7xl mx-auto flex flex-col gap-8 md:gap-12">
      {/* HEADER SECTION */}
      <header className="flex flex-col md:flex-row justify-between items-center gap-6 border-b-2 border-border pb-8">
        <div className="flex items-center gap-4 bg-bg-surface px-6 py-3 rounded-2xl border-2 border-border shadow-lg">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-muted">Tempo Total</span>
            <span className="text-2xl font-mono font-black text-secondary">{formatTime(time)}</span>
          </div>
        </div>

        <div className="text-3xl font-black tracking-tighter flex items-center gap-1 order-first md:order-none">
          QUIZ<span className="text-primary">PRO</span>
        </div>

        <div className="flex flex-col items-end gap-2 w-full md:w-auto">
          <div className="flex justify-between w-full md:w-auto md:gap-8 items-center">
            <span className="text-sm font-bold text-muted">Pergunta {currentLevel} de 15</span>
          </div>
          <div className="w-full md:w-64 h-3 bg-border rounded-full overflow-hidden shadow-inner">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${(currentLevel / 15) * 100}%` }}
              className="h-full bg-gradient-to-r from-primary to-blue-400"
            />
          </div>
        </div>
      </header>

      {/* MAIN CONTENT SECTION */}
      <main className="flex-1 grid lg:grid-cols-2 gap-10 items-center">
        {/* Visual Column */}
        <div className="relative group">
          <motion.div 
            key={currentLevel}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="aspect-[4/3] w-full bg-bg-surface rounded-[2rem] border-2 border-border overflow-hidden relative shadow-2xl"
          >
            {question.imageUrl ? (
              <div className="relative w-full h-full">
                <Image 
                  src={getThinkingImageUrl(question)} 
                  alt="Quiz Visual" 
                  fill 
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                  onError={(e) => {
                    // Fallback para uma imagem pensive genérica se a local não existir ainda
                    const target = e.target as HTMLImageElement;
                    target.src = "https://picsum.photos/seed/pensive-person/800/600";
                  }}
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-7xl opacity-20 bg-gradient-to-br from-slate-800 to-transparent">
                🧩
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-bg-deep/80 to-transparent" />
            <div className="absolute bottom-6 right-6 px-4 py-2 bg-bg-deep/80 backdrop-blur-md rounded-xl border border-border text-[10px] font-bold text-muted uppercase tracking-wider">
              Fonte: {question.source} / {question.category || 'Mundo'}
            </div>
          </motion.div>
        </div>

        {/* Text & Options Column */}
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <div className="difficulty-badge self-start">
              Nível {currentLevel.toString().padStart(2, '0')}: {currentLevel <= 5 ? 'Iniciante' : currentLevel <= 10 ? 'Intermediário' : 'Especialista'}
            </div>
            <motion.h1 
              key={`text-${currentLevel}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className={`font-black leading-[1.2] tracking-tight transition-all duration-300 ${
                question.text.length > 250 ? 'text-base md:text-lg lg:text-xl' :
                question.text.length > 200 ? 'text-lg md:text-xl lg:text-2xl' : 
                question.text.length > 120 ? 'text-xl md:text-2xl lg:text-3xl' : 
                'text-2xl md:text-3xl lg:text-4xl'
              }`}
            >
              {question.text}
            </motion.h1>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {question.options.map((opt, i) => {
              const isHidden = hiddenOptions.includes(i);
              const isSelected = selectedOption === i;
              const isCorrect = i === question.correctIndex;
              const labels = ['A', 'B', 'C', 'D'];
              
              let btnStyle = "";
              if (isHidden) btnStyle = "opacity-0 pointer-events-none scale-90";
              else if (status === 'feedback') {
                if (isCorrect) btnStyle = "bg-emerald-500/20 border-emerald-500 text-emerald-400 ring-4 ring-emerald-500/10";
                else if (isSelected) btnStyle = "bg-rose-500/20 border-rose-500 text-rose-400 opacity-80";
                else btnStyle = "opacity-40 grayscale-[0.5]";
              }

              return (
                <button 
                  key={i} 
                  onClick={() => handleAnswer(i)}
                  disabled={status !== 'playing' || isHidden}
                  className={`option-btn ${btnStyle} group flex items-start gap-4 h-full`}
                >
                  <span className="text-primary font-black text-xl leading-none pt-0.5">{labels[i]}</span>
                  <span className="flex-1 text-base md:text-lg">{opt}</span>
                  {status === 'feedback' && isCorrect && <CheckCircle2 className="text-emerald-500 shrink-0" />}
                  {status === 'feedback' && isSelected && !isCorrect && <XCircle className="text-rose-500 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      </main>

      {/* FOOTER SECTION */}
      <footer className="border-t-2 border-border pt-10 mt-auto flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex flex-wrap justify-center gap-4">
          <button 
            onClick={useSkip} 
            disabled={usedSkip || status !== 'playing'}
            className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-bold border-2 transition-all ${
              usedSkip ? 'border-border text-muted bg-bg-surface/50 line-through' : 'border-primary/30 bg-primary/5 text-slate-100 hover:bg-primary/10 hover:border-primary shadow-lg shadow-primary/5'
            }`}
          >
            <SkipForward size={20} className={usedSkip ? 'opacity-30' : 'text-primary'} /> {usedSkip ? 'Pular (Esgotado)' : 'Pular Pergunta'}
          </button>
          
          <button 
            onClick={use5050} 
            disabled={used5050 || status !== 'playing'}
            className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-bold border-2 transition-all ${
              used5050 ? 'border-border text-muted bg-bg-surface/50 line-through' : 'border-amber-500/30 bg-amber-500/5 text-slate-100 hover:bg-amber-500/10 hover:border-amber-500 shadow-lg shadow-amber-500/5'
            }`}
          >
            <Scissors size={20} className={used5050 ? 'opacity-30' : 'text-amber-500'} /> {used5050 ? '50:50 (Esgotado)' : 'Corte 50:50'}
          </button>
        </div>

        <div className="text-xs font-bold text-muted uppercase tracking-widest flex items-center gap-2">
          Sessão: <span className="text-slate-300">gliarte@gmail.com</span>
        </div>
      </footer>

      {/* Footer Feedback / Results */}
      <AnimatePresence>
        {feedback === 'wrong' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl"
          >
            <div className="glass p-8 rounded-3xl max-w-md w-full text-center space-y-6 border-rose-500/50">
              <div className="bg-rose-500/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto text-rose-500">
                <LogOut size={40} />
              </div>
              <h2 className="text-3xl font-black">Fim de Jogo!</h2>
              <p className="text-slate-400 font-medium">Você chegou até o nível {currentLevel}. A resposta correta era:</p>
              <div className="p-4 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-400 font-bold text-lg">
                {question.options[question.correctIndex]}
              </div>

              <AnimatePresence>
                {isReporting ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="space-y-4 pt-4 border-t border-border"
                  >
                    <div className="space-y-1.5 text-left">
                      <label className="text-[10px] uppercase font-black tracking-widest text-muted ml-2">Qual o erro nesta questão?</label>
                      <textarea 
                        value={reportFeedback}
                        onChange={e => setReportFeedback(e.target.value)}
                        placeholder="Ex: A resposta correta seria X, pois Y..."
                        className="w-full bg-bg-deep p-3 rounded-xl border-2 border-border focus:border-amber-500 outline-none font-medium h-20 resize-none transition-all text-sm"
                      />
                    </div>
                    <div className="space-y-1.5 text-left">
                      <label className="text-[10px] uppercase font-black tracking-widest text-muted ml-2">Seu E-mail (Opcional)</label>
                      <input 
                        type="email"
                        value={reportEmail}
                        onChange={e => setReportEmail(e.target.value)}
                        placeholder="seu@email.com"
                        className="w-full bg-bg-deep p-3 rounded-xl border-2 border-border focus:border-amber-500 outline-none font-medium transition-all text-sm"
                      />
                    </div>
                    
                    <div className="flex gap-2 pt-2">
                       <button 
                        onClick={() => setIsReporting(false)} 
                        className="flex-1 py-3 text-xs font-black uppercase tracking-widest border-2 border-border rounded-xl hover:bg-white/5 transition-all"
                      >
                        Cancelar
                      </button>
                      <button 
                        onClick={handleSendReport}
                        disabled={isSendingReport || !reportFeedback.trim() || reportSent}
                        className={`flex-[2] py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 ${reportSent ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-lg shadow-amber-500/20'}`}
                      >
                        {isSendingReport ? (
                          <RefreshCw className="animate-spin" size={14} />
                        ) : reportSent ? (
                          <>
                            <CheckCircle2 size={14} /> Enviado!
                          </>
                        ) : (
                          <>
                            <Send size={14} /> Enviar Denúncia
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <button 
                    onClick={() => setIsReporting(true)}
                    className="flex items-center gap-2 text-xs font-bold text-amber-500 hover:text-amber-400 transition-colors mx-auto uppercase tracking-wider"
                  >
                    <AlertTriangle size={14} /> Reportar erro nesta questão
                  </button>
                )}
              </AnimatePresence>

              <div className="flex gap-4 pt-4">
                <button onClick={() => window.location.reload()} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  <RefreshCw size={18} /> Reiniciar
                </button>
                <button onClick={onExit} className="btn-danger flex-1">Sair</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {status === 'finished' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-2xl overflow-y-auto"
          >
            <div className="glass p-8 rounded-3xl max-w-md w-full text-center space-y-6 border-amber-500/50 my-auto">
               <motion.div 
                animate={{ rotate: [0, -10, 10, -10, 10, 0], scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="bg-amber-500/20 w-24 h-24 rounded-full flex items-center justify-center mx-auto text-amber-500"
              >
                <Trophy size={48} />
              </motion.div>
              <div className="space-y-2">
                <h2 className="text-4xl font-black text-amber-500">PARABÉNS!</h2>
                <p className="text-lg font-bold leading-tight">Você pode não ser um gênio, mas sabe muito!</p>
                <p className="text-slate-400 text-sm">Você zerou o Quiz Show Brasil em:</p>
                <div className="text-4xl font-mono font-black text-primary bg-white/5 py-4 rounded-2xl border-2 border-white/10">
                  {formatTime(time)}
                </div>
              </div>

              <div className="space-y-4 text-left">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-black tracking-widest text-muted ml-2">Seu Nome para o Ranking</label>
                  <input 
                    type="text" 
                    value={winnerName}
                    onChange={e => setWinnerName(e.target.value)}
                    placeholder="João Silva"
                    className="w-full bg-bg-deep p-4 rounded-2xl border-2 border-border focus:border-primary outline-none font-bold transition-all text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-black tracking-widest text-muted ml-2">E-mail (Apenas para o Admin)</label>
                  <input 
                    type="email" 
                    value={winnerEmail}
                    onChange={e => setWinnerEmail(e.target.value)}
                    placeholder="joao@exemplo.com"
                    className="w-full bg-bg-deep p-4 rounded-2xl border-2 border-border focus:border-primary outline-none font-bold transition-all text-white"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button 
                  disabled={saving || !winnerName.trim() || !winnerEmail.trim()}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await saveToHallOfFame(winnerName.trim(), winnerEmail.trim(), time);
                      onGameOver(time); // Transition to ranking
                    } catch (e) {
                      console.error(e);
                      alert("Erro ao salvar recorde. Tente novamente.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                  className="btn-primary w-full py-4 text-xl flex items-center justify-center gap-2 group"
                >
                  {saving ? (
                    <RefreshCw className="animate-spin" size={20} />
                  ) : (
                    <Trophy size={20} className="group-hover:scale-110 transition-transform" />
                  )}
                  {saving ? 'Gravando...' : 'Salvar no Ranking'}
                </button>
                <p className="text-[10px] text-muted mt-4 font-bold uppercase tracking-[0.2em]">
                  Ao salvar, apenas seu nome e tempo serão visíveis publicamente.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
