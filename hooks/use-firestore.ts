'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp, orderBy, limit, doc, getDocFromServer } from 'firebase/firestore';
import { Question, HallOfFameEntry, GameStatus, QuestionReport } from '@/lib/types';

export const useFirestore = () => {
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback((error: unknown, op: string, path: string) => {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email
      },
      operationType: op,
      path
    };
    setError(JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  }, []);

  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (err: any) {
        if (err.code === 'permission-denied') {
          console.error("ERRO CRITICAL: Firebase bloqueou o acesso. Verifique se o domínio da Vercel está autorizado no console do Firebase.");
        } else if (err.message.includes('the client is offline')) {
          console.error("ERRO: O cliente está offline ou o Firebase não responde.");
        }
        console.error("Detalhes do erro Firestore:", err.code, err.message);
      }
    };
    testConnection();
  }, []);

  const getQuestionsByLevel = useCallback(async (level: number): Promise<Question[]> => {
    try {
      const q = query(collection(db, 'questions'), where('level', '==', level));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Question));
    } catch (err) {
      handleError(err, 'get', 'questions');
      return [];
    }
  }, [handleError]);

  const getAllQuestions = useCallback(async (): Promise<Question[]> => {
    try {
      const q = query(collection(db, 'questions'), orderBy('level', 'asc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Question));
    } catch (err) {
      handleError(err, 'list', 'questions');
      return [];
    }
  }, [handleError]);

  const addQuestion = useCallback(async (data: Partial<Question>) => {
    try {
      const docRef = await addDoc(collection(db, 'questions'), data);
      return docRef.id;
    } catch (err) {
      handleError(err, 'create', 'questions');
    }
  }, [handleError]);

  const updateQuestion = useCallback(async (id: string, data: Partial<Question>) => {
    try {
      await updateDoc(doc(db, 'questions', id), data);
    } catch (err) {
      handleError(err, 'update', 'questions');
    }
  }, [handleError]);

  const deleteQuestion = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'questions', id));
    } catch (err) {
      handleError(err, 'delete', 'questions');
    }
  }, [handleError]);

  const getHallOfFame = useCallback(async (): Promise<HallOfFameEntry[]> => {
    try {
      const q = query(collection(db, 'hallOfFame'), orderBy('timeInSeconds', 'asc'), limit(50));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as HallOfFameEntry));
    } catch (err) {
      handleError(err, 'list', 'hallOfFame');
      return [];
    }
  }, [handleError]);

  const saveToHallOfFame = useCallback(async (playerName: string, playerEmail: string, timeInSeconds: number) => {
    try {
      await addDoc(collection(db, 'hallOfFame'), {
        playerName,
        playerEmail,
        timeInSeconds,
        date: new Date().toISOString(),
      });
    } catch (err) {
      handleError(err, 'create', 'hallOfFame');
    }
  }, [handleError]);

  const deleteHallOfFameEntry = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'hallOfFame', id));
    } catch (err) {
      handleError(err, 'delete', 'hallOfFame');
    }
  }, [handleError]);

  const saveReport = useCallback(async (report: Omit<QuestionReport, 'id'>) => {
    try {
      await addDoc(collection(db, 'reports'), report);
    } catch (err) {
      handleError(err, 'create', 'reports');
    }
  }, [handleError]);

  const getReports = useCallback(async (): Promise<QuestionReport[]> => {
    try {
      const q = query(collection(db, 'reports'), orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as QuestionReport));
    } catch (err) {
      handleError(err, 'list', 'reports');
      return [];
    }
  }, [handleError]);

  const deleteReport = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'reports', id));
    } catch (err) {
      handleError(err, 'delete', 'reports');
    }
  }, [handleError]);

  return useMemo(() => ({ 
    getQuestionsByLevel, 
    getAllQuestions, 
    addQuestion, 
    updateQuestion, 
    deleteQuestion, 
    getHallOfFame, 
    saveToHallOfFame, 
    deleteHallOfFameEntry,
    saveReport,
    getReports,
    deleteReport,
    error 
  }), [
    getQuestionsByLevel, 
    getAllQuestions, 
    addQuestion, 
    updateQuestion, 
    deleteQuestion, 
    getHallOfFame, 
    saveToHallOfFame, 
    deleteHallOfFameEntry,
    saveReport,
    getReports,
    deleteReport,
    error
  ]);
};
