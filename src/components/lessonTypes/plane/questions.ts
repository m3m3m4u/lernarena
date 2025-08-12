// Extrahierte Fragen-Ladefunktion aus der Vorlage (game.js/questions.js) abstrahiert
import { QuestionBlock } from './types';

export function buildQuestionBlocks(raw: any): QuestionBlock[] {
  if(Array.isArray(raw?.content?.blocks)) return raw.content.blocks as QuestionBlock[];
  if(Array.isArray(raw?.questions)) {
    return raw.questions.map((q:any)=>({
      question: q.prompt || q.question || '',
      answers: q.answers || [],
      correct: q.correctIndex ?? q.correct ?? 0
    }));
  }
  return [];
}
