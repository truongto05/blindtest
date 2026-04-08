import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useAudio } from '../hooks/useAudio';
import { fetchNextQuiz, QuizData, GameType } from '../services/quizService';
import { socket } from '../services/socketService';

const SONGLESS_TIERS = [
  { time: 0.1, points: 1000 }, { time: 0.5, points: 800 }, { time: 2.0, points: 600 },
  { time: 5.0, points: 400 }, { time: 10.0, points: 200 }, { time: 15.0, points: 100 }
];

type AnswerMode = 'choices' | 'input';
type GameMode = 'classic' | 'progressive';
type AnswerType = 'random' | 'both' | 'artist' | 'title';
type GenreType = string;

type GameSettings = {
  mode: GameMode;
  rounds: number;
  timeLimit: number;
  genre: GenreType;
  answerType: AnswerType;
  gameType?: GameType;
  answerMode?: AnswerMode;
  customPlaylistUrl?: string;
};

type GameBoardProps = {
  settings: GameSettings;
  onGameEnd: (score: number, history: QuizData[]) => void; // 👈 NOUVEAU
  isMultiplayer?: boolean;
  roomCode?: string;
  initialData?: any;
};

const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'le', 'la', 'les', 'de', 'du', 'des', 'd', 'un', 'une', 'et', 'l', 'el', 'los', 'las']);
const normalizeLoose = (value: string = ''): string => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/['’]/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const removeStopWords = (value: string): string => normalizeLoose(value).split(' ').filter((word) => word && !STOP_WORDS.has(word)).join(' ').trim();
const compact = (value: string): string => removeStopWords(value).replace(/\s+/g, '');
const getInitialism = (value: string): string => removeStopWords(value).split(' ').filter((word) => word.length > 0).map((word) => word[0]).join('');
const tokenize = (value: string): string[] => removeStopWords(value).split(' ').filter((word) => word.length > 0);

const levenshtein = (a: string, b: string): number => {
  const aa = compact(a); const bb = compact(b);
  if (aa === bb) return 0;
  const matrix = Array.from({ length: aa.length + 1 }, (_, i) => Array.from({ length: bb.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= aa.length; i++) {
    for (let j = 1; j <= bb.length; j++) {
      const cost = aa[i - 1] === bb[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[aa.length][bb.length];
};

const similarityRatio = (a: string, b: string): number => {
  const aa = compact(a); const bb = compact(b);
  if (!aa.length || !bb.length) return 0;
  return 1 - levenshtein(aa, bb) / Math.max(aa.length, bb.length);
};

const tokenOverlapRatio = (a: string, b: string): number => {
  const aSet = new Set(tokenize(a)); const bSet = new Set(tokenize(b));
  if (!aSet.size || !bSet.size) return 0;
  let common = 0;
  aSet.forEach(t => { if (bSet.has(t)) common++; });
  return common / Math.max(aSet.size, bSet.size);
};

const buildAliases = (v: string): string[] => [v, normalizeLoose(v), removeStopWords(v), compact(v), getInitialism(v)].filter(Boolean);

const extractArtistAndTitle = (quizData: QuizData): { artist: string; title: string } | null => {
  if (quizData.artistName && quizData.trackTitle) return { artist: quizData.artistName, title: quizData.trackTitle };
  if (quizData.correctAnswer.includes(' - ')) {
    const [artist, ...rest] = quizData.correctAnswer.split(' - ');
    const title = rest.join(' - ').trim();
    if (artist?.trim() && title) return { artist: artist.trim(), title };
  }
  return null;
};

const isApproximateMatch = (input: string, expected: string): boolean => {
  if (!input.trim() || !expected.trim()) return false;
  const iAliases = buildAliases(input); const eAliases = buildAliases(expected);
  for (const iA of iAliases) {
    for (const eA of eAliases) {
      if (iA === eA || compact(iA) === compact(eA)) return true;
      if (similarityRatio(iA, eA) >= 0.82) return true;
      if (tokenOverlapRatio(iA, eA) >= 0.8) return true;
    }
  }
  return false;
};

const isCorrectFreeInput = (input: string, quizData: QuizData): boolean => {
  const typed = input.trim();
  if (!typed) return false;
  if (quizData.questionType === 'artist') return isApproximateMatch(typed, quizData.artistName || quizData.correctAnswer);
  if (['title', 'movie', 'series'].includes(quizData.questionType)) return isApproximateMatch(typed, quizData.trackTitle || quizData.mediaTitle || quizData.correctAnswer);
  
  const pair = extractArtistAndTitle(quizData);
  if (!pair) return isApproximateMatch(typed, quizData.correctAnswer);
  if (isApproximateMatch(typed, quizData.correctAnswer)) return true;
  if (isApproximateMatch(typed, pair.artist) && isApproximateMatch(typed, pair.title)) return true;
  return false;
};

export default function GameBoard({ settings, onGameEnd, isMultiplayer, roomCode, initialData }: GameBoardProps) {
  const [quizData, setQuizData] = useState<QuizData | null>(initialData || null);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [hasInteracted, setHasInteracted] = useState(!!isMultiplayer);

  const [currentRound, setCurrentRound] = useState<number>(initialData?.currentRound || 1);
  const [score, setScore] = useState<number>(0);
  
  // 👇 NOUVEAU : On garde en mémoire les pistes jouées
  const [history, setHistory] = useState<QuizData[]>(initialData ? [initialData] : []);
  
  const scoreRef = useRef<number>(0);
  const historyRef = useRef<QuizData[]>([]);
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { historyRef.current = history; }, [history]);

  const [playedIds, setPlayedIds] = useState<Array<string | number>>(initialData ? [initialData.trackId] : []);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(settings.timeLimit);
  const [unlockedIndex, setUnlockedIndex] = useState<number>(0);
  const [userInput, setUserInput] = useState<string>('');
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const gameType: GameType = settings.gameType || 'music';
  const answerMode: AnswerMode = settings.answerMode || 'choices';
  const { isLoaded, isPlaying, playSegment, playFull, stop } = useAudio(quizData?.audioUrl || null);

  useEffect(() => {
    if (isMultiplayer) {
      socket.on('new_round', (data: any) => {
        setQuizData(data);
        setCurrentRound(data.currentRound);
        setIsLoading(false);
        setSelectedAnswer(null);
        setUnlockedIndex(0);
        setTimeLeft(settings.timeLimit);
        setUserInput('');
        setSuggestions([]); 
        setIsCorrect(null);
        setHistory(prev => prev.some(h => h.trackId === data.trackId) ? prev : [...prev, data]);
      });
      
      socket.on('game_over', () => {
        onGameEnd(scoreRef.current, historyRef.current);
      });

      return () => { 
        socket.off('new_round'); 
        socket.off('game_over');
      };
    } else {
      if (!initialData) loadNewRound();
    }
  }, [isMultiplayer]);

  const loadNewRound = async () => {
    setIsLoading(true);
    setSelectedAnswer(null);
    setUnlockedIndex(0);
    setTimeLeft(settings.timeLimit);
    setUserInput('');
    setSuggestions([]);
    setIsCorrect(null);

    try {
      const data = await fetchNextQuiz(settings.genre, settings.answerType, playedIds, gameType, settings.customPlaylistUrl);
      setQuizData(data); 
      setPlayedIds(prev => [...prev, data.trackId]);
      setHistory(prev => prev.some(h => h.trackId === data.trackId) ? prev : [...prev, data]);
    } catch (e) { console.error(e); } finally { setIsLoading(false); }
  };

  useEffect(() => {
    if (isLoaded && !selectedAnswer && settings.mode === 'classic' && hasInteracted) {
      playFull();
    }
  }, [isLoaded, selectedAnswer, hasInteracted]);

  useEffect(() => {
    if (settings.mode === 'classic' && timeLeft > 0 && hasInteracted) {
      const timer = setInterval(() => setTimeLeft((prev: number) => prev - 1), 1000);
      return () => clearInterval(timer);
    }
    
    if (timeLeft === 0 && !selectedAnswer) {
      if (answerMode === 'input') handleInputSubmit();
      else handleChoice('TEMPS_ECOULÉ');
    }
  }, [timeLeft, hasInteracted, settings.mode, answerMode, selectedAnswer]);

  useEffect(() => {
    if (!userInput.trim() || selectedAnswer) {
      setSuggestions([]);
      return;
    }
    
    const delay = setTimeout(async () => {
      try {
        const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:3001' : `http://${window.location.hostname}:3001`;
        const res = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent(userInput)}&type=${quizData?.questionType || 'both'}`);
        const data = await res.json();
        setSuggestions(data);
      } catch (e) {
        setSuggestions([]);
      }
    }, 300);
    
    return () => clearTimeout(delay);
  }, [userInput, selectedAnswer, quizData]);

  const getQuestionBadge = () => {
    if (!quizData) return '🎧 Blindtest';
    if (quizData.questionType === 'artist') return "🎙️ Identifie l'artiste";
    if (quizData.questionType === 'title') return '🎵 Trouve le titre';
    if (quizData.questionType === 'movie') return '🎬 Trouve le film';
    if (quizData.questionType === 'series') return '📺 Trouve la série';
    return '🎧 Artiste & Titre';
  };

  const getRevealLabel = () => {
    if (!quizData) return '';
    if (quizData.questionType === 'movie') return 'Film';
    if (quizData.questionType === 'series') return 'Série';
    return 'Artiste & Titre'; 
  };

  const inputPlaceholder = useMemo(() => {
    if (!quizData) return 'Écris ta réponse';
    if (quizData.questionType === 'artist') return "Écris le nom de l'artiste";
    if (quizData.questionType === 'title') return 'Écris le titre';
    if (quizData.questionType === 'movie') return 'Écris le nom du film';
    if (quizData.questionType === 'series') return 'Écris le nom de la série';
    return 'Ex: Artiste - Titre';
  }, [quizData]);

  const handleChoice = (choice: string) => {
    if (selectedAnswer || !quizData) return;
    stop();
    const correct = choice === quizData.correctAnswer;
    setSelectedAnswer(choice); setIsCorrect(correct);
    
    const points = correct ? (settings.mode === 'classic' ? timeLeft * 20 : SONGLESS_TIERS[Math.max(0, unlockedIndex - 1)].points) : 0;
    if (correct) setScore((s: number) => s + points);
    
    if (isMultiplayer) {
      socket.emit('submit_answer', { roomCode, points });
    } else {
      setTimeout(() => {
        if (currentRound >= settings.rounds) onGameEnd(scoreRef.current + points, historyRef.current);
        else { setCurrentRound((r: number) => r + 1); loadNewRound(); }
      }, 2000); 
    }
  };

  const handleInputSubmit = (e?: React.FormEvent, overrideVal?: string) => {
    e?.preventDefault();
    if (selectedAnswer || !quizData) return;
    stop();
    
    const typed = (overrideVal || userInput).trim() || 'TEMPS_ECOULÉ';
    const correct = typed !== 'TEMPS_ECOULÉ' && isCorrectFreeInput(typed, quizData);
    
    setUserInput(typed); 
    setSuggestions([]); 
    setSelectedAnswer(typed); 
    setIsCorrect(correct);
    
    const points = correct ? (settings.mode === 'classic' ? timeLeft * 20 : 500) : 0;
    if (correct) setScore((s: number) => s + points);

    if (isMultiplayer) {
      socket.emit('submit_answer', { roomCode, points });
    } else {
      setTimeout(() => {
        if (currentRound >= settings.rounds) onGameEnd(scoreRef.current + points, historyRef.current);
        else { setCurrentRound((r: number) => r + 1); loadNewRound(); }
      }, 2000);
    }
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white font-black text-2xl animate-pulse uppercase">Préparation du morceau...</div>;

  if (!hasInteracted && !isMultiplayer) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-white p-4 font-sans bg-[#121212]">
        <div className="bg-gray-800 p-10 rounded-3xl shadow-2xl flex flex-col items-center text-center border-t-8 border-[#1DB954] w-full max-w-xl">
          <h2 className="text-4xl font-black mb-4">La partie est prête !</h2>
          <p className="text-gray-400 mb-8 font-bold">La musique se lancera dès que tu cliqueras.</p>
          <button
            onClick={() => setHasInteracted(true)}
            className="bg-[#1DB954] hover:bg-green-400 text-black px-10 py-5 rounded-full font-black text-2xl transition-transform hover:scale-105 shadow-[0_0_20px_rgba(29,185,84,0.4)]"
          >
            ▶ Lancer la 1ère manche
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 flex flex-col items-center justify-center font-sans">
      <div className="w-full max-w-2xl flex justify-between bg-gray-900 border border-gray-800 p-5 rounded-2xl mb-6 shadow-xl">
        <div className="flex flex-col">
          <span className="text-gray-500 text-xs font-black uppercase">Manche</span>
          <span className="text-2xl font-black text-white">{currentRound} <span className="text-gray-600">/ {settings.rounds}</span></span>
        </div>
        <div className="flex flex-col text-right">
          <span className="text-gray-500 text-xs font-black uppercase">Score total</span>
          <span className="text-3xl font-black text-yellow-400">{score}</span>
        </div>
      </div>

      <div className="bg-gray-800 p-8 rounded-3xl w-full max-w-2xl text-center border-b-8 border-blue-600 shadow-2xl mb-8">
        <div className="mb-6 flex flex-col items-center gap-3">
          <span className="bg-blue-600 text-white px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest">{getQuestionBadge()}</span>
          <span className="text-xs font-bold uppercase tracking-widest text-gray-400">{answerMode === 'choices' ? 'Mode QCM' : 'Mode saisie libre'}</span>
        </div>

        {!isLoaded ? (
          <div className="py-10"><div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div><p className="text-gray-400 font-bold">Préparation de l'extrait...</p></div>
        ) : (
          <div className="py-4">
            {settings.mode === 'classic' ? (
              <div className="flex flex-col items-center">
                <div className={`text-7xl font-black mb-2 tabular-nums ${timeLeft <= 5 ? 'text-red-500 animate-bounce' : 'text-white'}`}>{timeLeft}<span className="text-2xl">s</span></div>
                <div className="w-full bg-gray-900 h-2 rounded-full mt-4 overflow-hidden"><div className="bg-blue-500 h-full transition-all duration-1000" style={{ width: `${(timeLeft / settings.timeLimit) * 100}%` }}></div></div>
              </div>
            ) : (
              <div className="flex flex-wrap justify-center gap-3 py-4">
                {SONGLESS_TIERS.map((tier, i) => (
                  <button 
                    key={i} 
                    disabled={i > unlockedIndex || isPlaying || !!selectedAnswer}
                    onClick={() => { playSegment(tier.time); if(i === unlockedIndex && i < 5) setUnlockedIndex(i+1); }}
                    className={`w-16 h-16 rounded-2xl font-black transition ${i > unlockedIndex ? 'bg-gray-900 text-gray-700 cursor-not-allowed border-2 border-gray-800' : 'bg-blue-600 shadow-lg hover:scale-110 active:scale-95'}`}
                  >
                    {i > unlockedIndex ? '🔒' : `${tier.time}s`}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {answerMode === 'choices' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
          {quizData?.choices.map((choice, i) => {
            let style = 'bg-gray-800 border-2 border-gray-700 hover:border-blue-500 text-white';
            if (selectedAnswer) {
              if (choice === quizData.correctAnswer) style = 'bg-green-600 border-green-400 text-white scale-105 z-10 shadow-xl';
              else if (choice === selectedAnswer) style = 'bg-red-600 border-red-400 text-white opacity-90';
              else style = 'bg-gray-900 border-gray-800 text-gray-600 opacity-50';
            }
            return <button key={i} disabled={!!selectedAnswer || !isLoaded} onClick={() => handleChoice(choice)} className={`${style} py-5 px-6 rounded-2xl font-bold text-lg transition-all duration-200 transform`}>{choice}</button>;
          })}
        </div>
      ) : (
        <form onSubmit={handleInputSubmit} className="w-full max-w-2xl bg-gray-800 border border-gray-700 p-6 rounded-3xl shadow-2xl relative">
           <label className="block text-gray-300 font-bold mb-3">Ta réponse :</label>
           
           <div className="relative">
             <input 
               type="text" value={userInput} onChange={(e) => setUserInput(e.target.value)}
               disabled={!!selectedAnswer || !isLoaded} placeholder={inputPlaceholder}
               className="w-full bg-gray-900 border-2 border-gray-700 focus:border-blue-500 outline-none rounded-2xl px-5 py-4 text-white text-lg font-semibold"
               autoComplete="off"
             />
             
             {suggestions.length > 0 && !selectedAnswer && (
               <ul className="absolute z-50 w-full bg-gray-200 text-black rounded-xl mt-1 max-h-60 overflow-y-auto shadow-[0_10px_40px_rgba(0,0,0,0.5)] text-left border border-gray-300">
                 {suggestions.map((s, i) => (
                   <li 
                     key={i} 
                     onClick={() => handleInputSubmit(undefined, s)}
                     className="px-4 py-3 border-b border-gray-300 hover:bg-gray-300 cursor-pointer font-bold transition text-lg"
                   >
                     {s}
                   </li>
                 ))}
               </ul>
             )}
           </div>

           <div className="mt-4 flex flex-col sm:flex-row gap-3">
             <button type="submit" disabled={!!selectedAnswer || !userInput.trim() || !isLoaded} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black py-4 rounded-2xl text-lg transition">VALIDER MA RÉPONSE</button>
             {!selectedAnswer && <button type="button" onClick={() => { setUserInput(''); handleInputSubmit(); }} disabled={!isLoaded} className="sm:w-auto px-6 bg-gray-700 hover:bg-gray-600 text-white font-black py-4 rounded-2xl text-lg transition">PASSER</button>}
           </div>
        </form>
      )}

      {selectedAnswer && (
        <div className="mt-8 flex flex-col items-center animate-fade-in w-full max-w-2xl bg-gray-800 rounded-3xl p-6 border border-gray-700 shadow-2xl">
          <div className="flex items-center gap-6 w-full">
            {quizData?.coverUrl ? <img src={quizData.coverUrl} className="w-24 h-24 rounded-xl shadow-lg border-2 border-gray-600 object-cover" alt="cover" /> : <div className="w-24 h-24 rounded-xl shadow-lg border-2 border-gray-600 bg-gray-900 flex items-center justify-center text-3xl">{quizData?.questionType === 'movie' ? '🎬' : quizData?.questionType === 'series' ? '📺' : '🎵'}</div>}
            <div className="flex-1 text-left">
              <p className={`text-2xl font-black ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>{isCorrect ? 'EXCELLENT !' : 'OUPS...'}</p>
              {answerMode === 'input' && <p className="text-sm text-gray-400 mt-1">Ta réponse : <span className="text-white font-bold">{selectedAnswer === 'TEMPS_ECOULÉ' ? 'Temps écoulé' : selectedAnswer}</span></p>}
              <p className="text-gray-400 text-sm font-bold uppercase tracking-wider mt-2">{getRevealLabel()}</p>
              <p className="text-white font-bold text-lg">{quizData?.questionType === 'movie' || quizData?.questionType === 'series' ? quizData.correctAnswer : quizData?.artistName && quizData?.trackTitle ? `${quizData.artistName} - ${quizData.trackTitle}` : quizData?.correctAnswer}</p>
            </div>
          </div>
          
          <div className="mt-6 w-full bg-gray-900 text-gray-400 py-4 rounded-xl font-black text-xl text-center border-2 border-gray-700 animate-pulse uppercase">
            {isMultiplayer ? '⏳ EN ATTENTE DES AUTRES JOUEURS...' : '🔄 PROCHAINE MANCHE...'}
          </div>
        </div>
      )}
    </div>
  );
}