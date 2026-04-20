export interface Question {
  id?: string;
  text: string;
  options: string[];
  correctIndex: number;
  level: number;
  source: string;
  category?: string;
  imageUrl?: string;
}

export interface HallOfFameEntry {
  id?: string;
  playerName: string;
  playerEmail: string;
  timeInSeconds: number;
  date: string;
}

export interface QuestionReport {
  id?: string;
  questionId: string;
  questionText: string;
  userFeedback: string;
  userEmail?: string;
  date: string;
}

export type GameStatus = 'welcome' | 'playing' | 'gameOver' | 'winner' | 'ranking' | 'admin';
