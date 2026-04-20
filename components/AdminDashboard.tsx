'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useFirestore } from '@/hooks/use-firestore';
import { Question, HallOfFameEntry, QuestionReport } from '@/lib/types';
import { Trash2, Edit2, Brain, X, Trophy, ListChecks, Search, Plus, Image as ImageIcon, RefreshCw, AlertTriangle, Mail, CheckCircle2, AlertCircle } from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";

// Utilitário para inicializar o Gemini de forma preguiçosa (evita erros se a chave faltar)
const getAiClient = () => {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

// Utility to enforce the user's provided images (expected in /public/thinking/1.jpg to 16.jpg)
export const getThinkingImageUrl = (q: Partial<Question>) => {
  if (!q.text) return "/thinking/1.jpg";
  const imageIndex = (q.text.length % 16) + 1;
  return `/thinking/${imageIndex}.jpg`;
};

// Mini componente para preview de imagem com fallback
function QuestionImagePreview({ question }: { question: Question }) {
  const [imgSrc, setImgSrc] = useState(() => getThinkingImageUrl(question));
  
  return (
    <div className="w-20 h-20 rounded-2xl overflow-hidden bg-bg-deep border-2 border-border shrink-0 hidden sm:block relative">
      <Image 
        src={imgSrc} 
        alt="Preview" 
        fill
        className="object-cover" 
        onError={() => setImgSrc("https://picsum.photos/seed/pensive-person/800/600")}
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

export default function AdminDashboard() {
  const { getAllQuestions, addQuestion, updateQuestion, deleteQuestion, getHallOfFame, deleteHallOfFameEntry, getReports, deleteReport } = useFirestore();
  
  const [questions, setQuestions] = useState<Question[]>([]);
  const [ranking, setRanking] = useState<HallOfFameEntry[]>([]);
  const [reports, setReports] = useState<QuestionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [updatingImages, setUpdatingImages] = useState(false);
  const [updateProgress, setUpdateProgress] = useState({ current: 0, total: 0 });
  const [activeTab, setActiveTab] = useState<'questions' | 'ranking' | 'reports'>('questions');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const predefined = ["Esportes", "Enem", "Português", "Matemática", "Física", "Química"];
    const counts: Record<string, number> = {};
    
    // Initialize predefined categories with 0
    predefined.forEach(cat => {
      counts[cat] = 0;
    });

    questions.forEach(q => {
      const cat = q.category || 'Sem Categoria';
      counts[cat] = (counts[cat] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [questions]);

  // Form state
  const [formData, setFormData] = useState<Partial<Question>>({
    text: '',
    options: ['', '', '', ''],
    correctIndex: 0,
    level: 1,
    source: '',
    category: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [qList, rList, repList] = await Promise.all([getAllQuestions(), getHallOfFame(), getReports()]);
    setQuestions(qList);
    setRanking(rList);
    setReports(repList);
    setLoading(false);

    // Silent Background Image Fixer: Se houver questões com URLs antigas, corrigimos no banco silenciosamente
    const questionsToFix = qList.filter(q => {
      const img = q.imageUrl?.toLowerCase() || '';
      return !img.includes('thinking') && !img.includes('philosopher') && !img.includes('pensive') && !img.includes('engraving');
    });

    if (questionsToFix.length > 0) {
      console.log(`Iniciando correção silenciosa de ${questionsToFix.length} imagens...`);
      for (const q of questionsToFix) {
        const correctUrl = getThinkingImageUrl(q);
        updateQuestion(q.id!, { imageUrl: correctUrl });
      }
    }
  }, [getAllQuestions, getHallOfFame, getReports, updateQuestion]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateQuestion(editingId, formData);
      } else {
        await addQuestion(formData);
      }
      setFormData({ text: '', options: ['', '', '', ''], correctIndex: 0, level: 1, source: '', category: selectedCategory || '' });
      setEditingId(null);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteQ = async (id: string) => {
    if (confirm('Deletar esta pergunta?')) {
      await deleteQuestion(id);
      fetchData();
    }
  };

  const handleDeleteR = async (id: string) => {
    if (confirm('Remover este jogador do ranking?')) {
      await deleteHallOfFameEntry(id);
      fetchData();
    }
  };

  const handleDeleteReport = async (id: string) => {
    console.log("Resolvendo reporte:", id);
    setDeletingReportId(id);
    
    // Otimismo: remove da lista imediatamente
    setReports(prev => prev.filter(r => r.id !== id));
    
    try {
      await deleteReport(id);
      console.log("Reporte removido do Firestore com sucesso");
      // Pequeno delay para garantir que o Firestore propagou a mudança antes do refresh
      setTimeout(() => fetchData(), 1000);
    } catch (err) {
      console.error("Erro na exclusão do reporte:", err);
      alert("Erro técnico ao excluir reporte. Verifique sua conexão ou permissões.");
      // Se deu erro, desfaz o otimismo (opcional, mas seguro)
      fetchData();
    } finally {
      setDeletingReportId(null);
    }
  };

  const generateWithAI = async () => {
    const ai = getAiClient();
    if (!ai) {
      alert("Configuração de IA (Gemini API Key) ausente ou inválida.");
      return;
    }

    setGenerating(true);
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-flash-latest",
          contents: `Gere uma pergunta de quiz de alta qualidade em Português do Brasil para o nível ${formData.level} (escala 1 a 15). 
          O assunto deve ser variado (Geral, Enem, Esportes, etc). 
          ${formData.category ? `Foque OBRIGATORIAMENTE na categoria: ${formData.category}.` : 'Não priorize nenhum tema específico, use conhecimentos gerais variados.'}
          Retorne em JSON com: text, options (array de 4 strings), correctIndex (0-3), source (URL ou nome da fonte) e category.`,
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
              required: ["text", "options", "correctIndex", "source"]
            }
          }
        });
        
        const text = response.text;
        if (!text) throw new Error('Falha ao gerar conteúdo com IA');
        
        const data = JSON.parse(text);
        setFormData({
          ...formData,
          ...data,
          imageUrl: getThinkingImageUrl({ text: data.text })
        });
        break;
      } catch (err) {
        attempts++;
        console.error(`Tentativa ${attempts} falhou:`, err);
        if (attempts === maxAttempts) {
          alert("Erro persistente ao gerar com IA. Verifique sua conexão ou tente novamente mais tarde.");
        } else {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
      }
    }
    setGenerating(false);
  };

  const refreshAllImages = async () => {
    if (!confirm('Deseja atualizar as palavras-chave de imagem de TODAS as questões no banco com base no assunto de cada uma? Isso pode levar algum tempo.')) return;
    
    const ai = getAiClient();
    if (!ai) {
      alert("Configuração de IA (Gemini API Key) ausente.");
      return;
    }

    setUpdatingImages(true);
    setUpdateProgress({ current: 0, total: questions.length });
    
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      setUpdateProgress(prev => ({ ...prev, current: i + 1 }));
      
      let attempts = 0;
      const maxAttempts = 2;
      let success = false;

      while (attempts < maxAttempts && !success) {
        try {
          const response = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: `Baseado nesta pergunta de quiz: "${q.text}". 
            Sugira uma palavra-chave em INGLÊS que resulte em uma imagem de PERSONA PENSATIVA ou GRAVURA CLÁSSICA PENSATIVA. 
            EXEMPLOS OBRIGATÓRIOS DE ESTILO: 'pensive-philosopher', 'thinking-human-figure', 'contemplative-statue', 'meditating-person'. 
            NÃO use objetos. Foque em HUMANOS ou REPRESENTAÇÕES HUMANAS (gravuras/estátuas) PENSANDO.
            Retorne em JSON: { "keyword": "exemplo" }`,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: { keyword: { type: Type.STRING } },
                required: ["keyword"]
              }
            }
          });

          const resText = response.text;
          if (resText) {
            const { keyword } = JSON.parse(resText);
            const newUrl = `https://picsum.photos/seed/${keyword}/800/600`;
            await updateQuestion(q.id!, { imageUrl: newUrl });
            success = true;
          }
        } catch (err) {
          attempts++;
          console.error(`Erro ao atualizar imagem da questão ${q.id} (Tentativa ${attempts}):`, err);
          await new Promise(resolve => setTimeout(resolve, 500 * attempts));
        }
      }
      // Delay extra para evitar saturação do RPC
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    setUpdatingImages(false);
    fetchData();
    alert('Todas as imagens foram atualizadas com palavras-chave mais específicas!');
  };

  const filteredQuestions = questions.filter(q => {
    const matchesSearch = q.text.toLowerCase().includes(searchTerm.toLowerCase()) || 
      q.category?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === null || (q.category || 'Sem Categoria') === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const groupedQuestions = useMemo(() => {
    const groups: Record<string, Question[]> = {};
    filteredQuestions.forEach(q => {
      const cat = q.category || 'Sem Categoria';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(q);
    });
    return groups;
  }, [filteredQuestions]);

  return (
    <div className="p-4 md:p-10 max-w-7xl mx-auto space-y-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b-2 border-border pb-10">
        <h2 className="text-4xl font-black flex items-center gap-4 tracking-tighter uppercase italic">
          <Brain className="text-primary" size={40} /> Painel <span className="text-primary">ADMIN</span>
        </h2>
        
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Link 
            href="/admin/upload"
            className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-secondary/10 border-2 border-secondary/20 text-secondary hover:bg-secondary hover:text-slate-950 transition-all font-black uppercase text-xs tracking-widest shadow-lg shadow-secondary/5 group"
          >
            <ImageIcon size={18} className="group-hover:scale-110 transition-transform" /> Galerias das Fotos
          </Link>

          <div className="flex bg-bg-surface p-1.5 rounded-2xl border-2 border-border shadow-2xl">
            <button 
              onClick={() => setActiveTab('questions')}
              className={`px-6 py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'questions' ? 'bg-primary text-white shadow-xl shadow-primary/20 scale-105' : 'text-muted hover:text-white'}`}
            >
              <ListChecks size={18} /> Questões
            </button>
            <button 
              onClick={() => setActiveTab('ranking')}
              className={`px-6 py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'ranking' ? 'bg-primary text-white shadow-xl shadow-primary/20 scale-105' : 'text-muted hover:text-white'}`}
            >
              <Trophy size={18} /> Moderar Ranking
            </button>
            <button 
              onClick={() => setActiveTab('reports')}
              className={`px-6 py-3 rounded-xl text-sm font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'reports' ? 'bg-amber-500 text-slate-950 shadow-xl shadow-amber-500/20 scale-105' : 'text-muted hover:text-white'}`}
            >
              <AlertTriangle size={18} /> Denúncias {reports.length > 0 && <span className="bg-rose-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full ml-1 animate-pulse border-2 border-bg-surface">{reports.length}</span>}
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'questions' ? (
        <div className="grid lg:grid-cols-2 gap-12">
          {/* Form Column */}
          <div className="bg-bg-surface border-2 border-border p-8 rounded-[2rem] h-fit lg:sticky lg:top-32 shadow-2xl">
            <h3 className="text-2xl font-black mb-8 flex items-center gap-3">
              {editingId ? <Edit2 size={24} className="text-primary" /> : <Plus size={24} className="text-secondary" />}
              {editingId ? 'EDITAR QUESTÃO' : 'NOVA QUESTÃO'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black tracking-widest text-muted">Nível da Pergunta</label>
                  <input 
                    type="number" min="1" max="15" 
                    className="w-full bg-bg-deep p-4 rounded-2xl border-2 border-border focus:border-primary outline-none font-bold transition-colors"
                    value={formData.level}
                    onChange={e => setFormData({ ...formData, level: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black tracking-widest text-muted">Categoria / Tema</label>
                  <input 
                    type="text" 
                    placeholder="Ex: Mundo Nerd/Geek, Ciência"
                    className="w-full bg-bg-deep p-4 rounded-2xl border-2 border-border focus:border-primary outline-none font-bold transition-colors"
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                  />
                </div>
              </div>
              
              <button 
                type="button" 
                onClick={generateWithAI}
                disabled={generating}
                className="w-full btn-secondary py-4 flex items-center justify-center gap-3 text-sm border-dashed"
              >
                <Brain size={20} className={generating ? 'animate-pulse' : ''} /> 
                {generating ? 'IA ESTÁ PENSANDO...' : 'SUGERIR QUESTÃO COM IA'}
              </button>

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-black tracking-widest text-muted">Enunciado da Questão</label>
                <textarea 
                  className="w-full bg-bg-deep p-4 rounded-2xl border-2 border-border focus:border-primary outline-none font-medium h-28 resize-none transition-colors"
                  placeholder="Qual é a capital do..."
                  value={formData.text}
                  onChange={e => setFormData({ ...formData, text: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {formData.options?.map((opt, i) => (
                  <div key={i} className="space-y-2">
                    <label className="text-[10px] uppercase font-black tracking-widest text-muted">
                      Opção {String.fromCharCode(65 + i)} {i === formData.correctIndex && <span className="text-emerald-500 ml-1">✓</span>}
                    </label>
                    <input 
                      type="text" 
                      className={`w-full bg-bg-deep p-4 rounded-2xl border-2 outline-none font-bold text-sm transition-all ${i === formData.correctIndex ? 'border-emerald-500 bg-emerald-500/5' : 'border-border focus:border-primary'}`}
                      value={opt}
                      onChange={e => {
                        const newOpts = [...formData.options!];
                        newOpts[i] = e.target.value;
                        setFormData({ ...formData, options: newOpts });
                      }}
                      required
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black tracking-widest text-muted">Resposta Certa</label>
                  <select 
                    className="w-full bg-bg-deep p-4 rounded-2xl border-2 border-border focus:border-primary outline-none font-bold appearance-none transition-colors"
                    value={formData.correctIndex}
                    onChange={e => setFormData({ ...formData, correctIndex: parseInt(e.target.value) })}
                  >
                    <option value={0}>Opção A</option>
                    <option value={1}>Opção B</option>
                    <option value={2}>Opção C</option>
                    <option value={3}>Opção D</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black tracking-widest text-muted">Fonte da Informação</label>
                  <input 
                    type="text" 
                    placeholder="Ex: CNN, Livro X"
                    className="w-full bg-bg-deep p-4 rounded-2xl border-2 border-border focus:border-primary outline-none font-bold transition-colors"
                    value={formData.source}
                    onChange={e => setFormData({ ...formData, source: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-6 border-t-2 border-border">
                <button type="submit" className="btn-primary flex-1 py-5 shadow-2xl shadow-primary/20">
                  {editingId ? 'SALVAR ALTERAÇÕES' : 'PUBLICAR NO JOGO'}
                </button>
                {editingId && (
                  <button type="button" onClick={() => {
                    setEditingId(null);
                    setFormData({ text: '', options: ['', '', '', ''], correctIndex: 0, level: 1, source: '', category: '' });
                  }} className="btn-danger p-5">
                    <X size={24} />
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* List Column */}
          <div className="space-y-8">
            <div className="relative group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-primary transition-colors" size={24} />
              <input 
                type="text" 
                placeholder="Pesquisar questões cadastradas..."
                className="w-full bg-bg-surface p-6 pl-14 rounded-3xl border-2 border-border outline-none focus:border-primary transition-all shadow-xl"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between px-4">
                <h3 className="text-xl font-black uppercase tracking-tighter">Acervo por Categorias</h3>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black bg-border px-3 py-1 rounded-lg text-muted">{questions.length} TOTAL</span>
                  <button 
                    onClick={refreshAllImages}
                    disabled={updatingImages || questions.length === 0}
                    className="px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 rounded-lg hover:bg-emerald-500 hover:text-white transition-all font-black text-[10px] uppercase tracking-widest flex items-center gap-2"
                  >
                    {updatingImages ? (
                      <>
                        <RefreshCw className="animate-spin" size={12} /> 
                        [{updateProgress.current}/{updateProgress.total}]
                      </>
                    ) : (
                      <>
                        <ImageIcon size={12} /> Otimizar Imagens
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap gap-2 px-2 pb-6 border-b border-border/50">
                {categories.map(cat => (
                  <button
                    key={cat.name}
                    onClick={() => {
                      const newCat = cat.name === selectedCategory ? null : cat.name;
                      setSelectedCategory(newCat);
                      if (newCat && !formData.text) {
                        setFormData(prev => ({ ...prev, category: newCat }));
                      }
                    }}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all flex items-center gap-2 ${selectedCategory === cat.name ? 'bg-primary border-primary text-white shadow-lg scale-105' : 'bg-bg-deep border-border text-muted hover:border-primary/50'}`}
                  >
                    {cat.name}
                    <span className={`px-1.5 py-0.5 rounded-md text-[8px] ${selectedCategory === cat.name ? 'bg-white/20 text-white' : 'bg-border text-muted'}`}>
                      {cat.count}
                    </span>
                  </button>
                ))}
                {selectedCategory && (
                  <button 
                    onClick={() => setSelectedCategory(null)}
                    className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 border-rose-500/30 text-rose-500 hover:bg-rose-500 hover:text-white transition-all flex items-center gap-2"
                  >
                    Limpar Seleção <X size={12} />
                  </button>
                )}
              </div>
              
              {!selectedCategory ? (
                <div className="text-center py-24 bg-bg-surface/30 border-2 border-dashed border-border rounded-[2.5rem] flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-border/20 flex items-center justify-center text-muted">
                    <ListChecks size={32} />
                  </div>
                  <div>
                    <h4 className="font-black uppercase tracking-tighter text-lg">Selecione uma Área</h4>
                    <p className="text-muted text-xs font-bold uppercase tracking-widest">Clique em uma categoria acima para gerenciar as questões</p>
                  </div>
                </div>
              ) : Object.keys(groupedQuestions).length === 0 ? (
                <div className="text-center py-20 bg-bg-surface/50 border-2 border-dashed border-border rounded-[2rem] text-muted italic font-bold">
                  Nenhum resultado para sua busca nesta categoria.
                </div>
              ) : (
                <div className="space-y-12">
                  {Object.entries(groupedQuestions).map(([category, items]) => (
                    <div key={category} className="space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="h-0.5 flex-1 bg-border" />
                        <h4 className="text-sm font-black uppercase tracking-[0.3em] text-primary">{category}</h4>
                        <div className="h-0.5 flex-1 bg-border" />
                      </div>
                      
                      <div className="grid gap-4">
                        {items.map(q => (
                          <div key={q.id} className="bg-bg-surface border-2 border-border p-6 rounded-3xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 hover:border-primary/50 transition-all hover:shadow-2xl hover:shadow-primary/5 group">
                            <div className="flex items-start gap-6 flex-1 min-w-0">
                              <QuestionImagePreview question={q} />
                              <div className="flex-1 min-w-0 space-y-3">
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] bg-primary text-white px-3 py-1 rounded-full font-black uppercase tracking-widest">Nível {q.level}</span>
                                </div>
                                <p className="font-bold text-lg leading-tight line-clamp-2">{q.text}</p>
                                <p className="text-[10px] text-muted uppercase tracking-widest font-black flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-border" /> Fonte: {q.source}
                                </p>
                              </div>
                            </div>
                            <div className="flex sm:flex-col gap-2 w-full sm:w-auto">
                              <button onClick={() => {
                                setEditingId(q.id!);
                                setFormData(q);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }} className="flex-1 sm:w-12 h-12 flex items-center justify-center bg-primary/5 hover:bg-primary/10 rounded-2xl text-primary transition-all border-2 border-transparent hover:border-primary/20">
                                <Edit2 size={20} />
                              </button>
                              <button onClick={() => handleDeleteQ(q.id!)} className="flex-1 sm:w-12 h-12 flex items-center justify-center bg-rose-500/5 hover:bg-rose-500/10 rounded-2xl text-rose-500 transition-all border-2 border-transparent hover:border-rose-500/20">
                                <Trash2 size={20} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === 'ranking' ? (
        <div className="bg-bg-surface border-2 border-border p-8 rounded-[2rem] shadow-2xl">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
            <div>
              <h3 className="text-2xl font-black uppercase tracking-tighter italic">Controle do Recorde</h3>
              <p className="text-muted font-bold text-sm tracking-widest uppercase">Moderação de competidores do Hall Global</p>
            </div>
            <div className="bg-bg-deep px-4 py-2 rounded-xl text-primary font-mono font-black text-xl border-2 border-border">
              {ranking.length} JOGADORES
            </div>
          </div>

          {ranking.length === 0 ? (
            <div className="text-center py-20 text-muted italic font-bold">Nenhum recorde registrado ainda.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] uppercase font-black tracking-[0.3em] text-muted border-b-2 border-border">
                    <th className="py-6 px-6 text-left">Posição</th>
                    <th className="py-6 px-6 text-left">Competidor</th>
                    <th className="py-6 px-6 text-left">E-mail</th>
                    <th className="py-6 px-6 text-left">Tempo Recorde</th>
                    <th className="py-6 px-6 text-left">Data do Feito</th>
                    <th className="py-6 px-6 text-right">Moderação</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-bg-deep">
                  {ranking.map((r, i) => (
                    <tr key={r.id} className="hover:bg-bg-deep/50 transition-colors group">
                      <td className="py-8 px-6">
                        <span className={`text-xl font-black italic ${i < 3 ? 'text-secondary' : 'text-slate-500'}`}>
                          #{i + 1}
                        </span>
                      </td>
                      <td className="py-8 px-6 font-black text-xl tracking-tight">{r.playerName}</td>
                      <td className="py-8 px-6 text-xs font-mono text-muted">{r.playerEmail}</td>
                      <td className="py-8 px-6">
                        <div className="bg-bg-deep inline-block px-4 py-2 rounded-xl border-2 border-border font-mono font-black text-secondary">
                          {r.timeInSeconds}s
                        </div>
                      </td>
                      <td className="py-8 px-6 text-sm font-bold text-muted uppercase">
                        {new Date(r.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </td>
                      <td className="py-8 px-6 text-right">
                        <button 
                          onClick={() => handleDeleteR(r.id!)}
                          className="w-12 h-12 inline-flex items-center justify-center hover:bg-rose-500 text-rose-500 hover:text-white rounded-2xl transition-all border-2 border-rose-500/20 hover:border-rose-500 shadow-lg shadow-rose-500/0 hover:shadow-rose-500/20"
                        >
                          <Trash2 size={20} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-bg-surface border-2 border-border p-8 rounded-[2rem] shadow-2xl">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
            <div>
              <h3 className="text-2xl font-black uppercase tracking-tighter italic">Relatórios de Erros</h3>
              <p className="text-muted font-bold text-sm tracking-widest uppercase">Feedback dos jogadores sobre as questões</p>
            </div>
            <div className="bg-bg-deep px-4 py-2 rounded-xl text-amber-500 font-mono font-black text-xl border-2 border-border">
              {reports.length} ALERTAS
            </div>
          </div>

          {reports.length === 0 ? (
            <div className="text-center py-24 bg-bg-surface/30 border-2 border-dashed border-border rounded-[2.5rem] flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-border/20 flex items-center justify-center text-muted">
                <CheckCircle2 className="text-emerald-500" size={32} />
              </div>
              <div>
                <h4 className="font-black uppercase tracking-tighter text-lg">Tudo Certo!</h4>
                <p className="text-muted text-xs font-bold uppercase tracking-widest">Nenhuma denúncia pendente no momento</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] uppercase font-black tracking-[0.3em] text-muted border-b-2 border-border">
                    <th className="py-6 px-6 text-left">Questão</th>
                    <th className="py-6 px-6 text-left">Feedback do Usuário</th>
                    <th className="py-6 px-6 text-left">Contato</th>
                    <th className="py-6 px-6 text-left">Data</th>
                    <th className="py-6 px-6 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-bg-deep">
                  {reports.map((rep) => (
                    <tr key={rep.id} className="hover:bg-bg-deep/50 transition-colors group">
                      <td className="py-8 px-6 max-w-sm">
                        <p className="font-black text-sm tracking-tight leading-relaxed">{rep.questionText}</p>
                        <span className="text-[9px] text-muted uppercase font-mono mt-1 block tracking-wider">ID: {rep.questionId}</span>
                      </td>
                      <td className="py-8 px-6">
                        <div className="bg-amber-500/10 border-2 border-amber-500/20 p-4 rounded-2xl text-xs font-bold text-amber-200/80 italic leading-relaxed">
                          &quot;{rep.userFeedback}&quot;
                        </div>
                      </td>
                      <td className="py-8 px-6">
                        <div className="flex items-center gap-2 text-xs font-mono text-muted">
                          <Mail size={12} /> {rep.userEmail}
                        </div>
                      </td>
                      <td className="py-8 px-6 text-[10px] font-black text-muted uppercase tracking-wider">
                        {new Date(rep.date).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-8 px-6 text-right">
                        <button 
                          disabled={deletingReportId === rep.id}
                          onClick={() => handleDeleteReport(rep.id!)}
                          className={`w-12 h-12 inline-flex items-center justify-center rounded-2xl transition-all border-2 ${
                            deletingReportId === rep.id 
                              ? 'bg-muted/10 border-muted text-muted' 
                              : 'bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white border-emerald-500/20 hover:border-emerald-500'
                          }`}
                          title="Resolvido"
                        >
                          {deletingReportId === rep.id ? (
                            <RefreshCw className="animate-spin" size={20} />
                          ) : (
                            <CheckCircle2 size={20} />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
