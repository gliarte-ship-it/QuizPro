'use client';

import { useState } from 'react';
import { Upload, CheckCircle2, AlertCircle, ArrowLeft, ImageIcon } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'motion/react';

export default function ImageUploadPage() {
  const [uploading, setUploading] = useState<Record<number, boolean>>({});
  const [success, setSuccess] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (index: number, file: File) => {
    if (!file) return;

    setUploading(prev => ({ ...prev, [index]: true }));
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('index', index.toString());

    try {
      const res = await fetch('/api/upload-thinking', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.success) {
        setSuccess(prev => ({ ...prev, [index]: true }));
      } else {
        throw new Error(data.error || 'Erro no upload');
      }
    } catch (err) {
      console.error(err);
      setError(`Erro ao enviar imagem ${index}. Tente novamente.`);
    } finally {
      setUploading(prev => ({ ...prev, [index]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-bg-deep text-slate-100 p-8">
      <div className="max-w-4xl mx-auto space-y-12">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <Link href="/?mode=admin" className="text-primary flex items-center gap-2 font-black uppercase text-xs tracking-widest hover:gap-3 transition-all">
              <ArrowLeft size={16} /> Voltar ao Painel
            </Link>
            <h1 className="text-4xl font-black italic uppercase tracking-tighter">Portal de Upload das Fotos</h1>
            <p className="text-muted font-bold text-sm uppercase tracking-widest">Preencha os 16 slots com suas fotos de pensamento</p>
          </div>
          <div className="bg-primary/10 border-2 border-primary/20 px-6 py-3 rounded-2xl flex items-center gap-4">
             <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white">
                <ImageIcon size={24} />
             </div>
             <div>
                <span className="block text-[10px] font-black uppercase text-primary">Capacidade</span>
                <span className="block text-xl font-black">16 Slots de IA</span>
             </div>
          </div>
        </header>

        {error && (
          <div className="bg-rose-500/10 border-2 border-rose-500/30 p-4 rounded-2xl flex items-center gap-4 text-rose-500 font-bold">
            <AlertCircle /> {error}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {Array.from({ length: 16 }).map((_, i) => {
            const index = i + 1;
            const isDone = success[index];
            const isUploading = uploading[index];

            return (
              <motion.div 
                key={index}
                whileHover={{ y: -5 }}
                className={`relative aspect-square border-4 border-dashed rounded-[2rem] flex flex-col items-center justify-center gap-4 transition-all overflow-hidden ${isDone ? 'border-emerald-500 bg-emerald-500/5' : 'border-border bg-bg-surface hover:border-primary/50'}`}
              >
                {isDone ? (
                  <div className="text-center space-y-2">
                    <CheckCircle2 size={48} className="text-emerald-500 mx-auto" />
                    <span className="block font-black text-xs uppercase text-emerald-500">Slot {index} Pronto</span>
                  </div>
                ) : isUploading ? (
                  <div className="text-center space-y-2">
                    <Upload size={48} className="text-primary animate-bounce mx-auto" />
                    <span className="block font-black text-xs uppercase text-primary">Enviando...</span>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-full bg-border/20 flex items-center justify-center text-muted group-hover:text-primary transition-colors">
                      <Upload size={32} />
                    </div>
                    <span className="font-black text-sm text-muted">SLOT {index}</span>
                    <input 
                      type="file" 
                      accept="image/jpeg,image/png"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileChange(index, file);
                      }}
                    />
                  </>
                )}
              </motion.div>
            );
          })}
        </div>

        <section className="bg-bg-surface border-2 border-border p-8 rounded-[2.5rem] space-y-4">
          <h2 className="text-xl font-black uppercase italic tracking-tighter">Como Funciona?</h2>
          <ul className="grid md:grid-cols-2 gap-4">
            {[ 
              "Cada 'Slot' corresponde a uma imagem que o quiz usará.",
              "As imagens são salvas automaticamente com o nome correto.",
              "Você pode atualizar uma imagem clicando no slot novamente.",
              "O jogo escolhe uma foto diferente para cada fase do quiz."
            ].map((text, i) => (
              <li key={i} className="flex items-start gap-3 text-sm font-bold text-muted leading-relaxed">
                <span className="w-6 h-6 rounded-lg bg-border flex items-center justify-center text-primary font-black shrink-0">{i+1}</span>
                {text}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
