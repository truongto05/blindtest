import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useAudio } from '../hooks/useAudio';
import { fetchNextQuiz, QuizData, GameType } from '../services/quizService';
import { socket } from '../services/socketService';
import { Music2, Send, SkipForward, CheckCircle2, XCircle, Mic2, Film, Tv, Play, Headphones, Search } from 'lucide-react';

const SONGLESS_TIERS = [
  { time: 0.1, points: 1000 }, { time: 0.5, points: 800 }, { time: 2.0, points: 600 },
  { time: 5.0, points: 400 }, { time: 10.0, points: 200 }, { time: 15.0, points: 100 }
];

type GameBoardProps = {
  settings: any;
  onGameEnd: (score: number, history: QuizData[]) => void;
  isMultiplayer?: boolean;
  roomCode?: string;
  initialData?: any;
};

// --- ALGORITHME DE CORRECTION INTELLIGENT ---
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
  return isApproximateMatch(typed, quizData.correctAnswer);
};

export default function GameBoard({ settings, onGameEnd, isMultiplayer, roomCode, initialData }: GameBoardProps) {
  const [quizData, setQuizData] = useState<QuizData | null>(initialData || null);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [hasInteracted, setHasInteracted] = useState(!!isMultiplayer);
  const [currentRound, setCurrentRound] = useState<number>(initialData?.currentRound || 1);
  const [score, setScore] = useState<number>(0);
  const [history, setHistory] = useState<QuizData[]>(initialData ? [initialData] : []);
  
  const hasStartedFirstLoad = useRef(false);

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

  const { isLoaded, isPlaying, playSegment, playFull, stop } = useAudio(quizData?.audioUrl || null);

  // Un film n'a pas de musique, donc s'il n'y a pas d'URL audio, c'est considéré comme "prêt"
  const isReady = quizData?.audioUrl ? isLoaded : true;

  useEffect(() => {
    if (isMultiplayer) {
      socket.on('new_round', (data: any) => {
        setQuizData(data); setCurrentRound(data.currentRound); setIsLoading(false);
        setSelectedAnswer(null); setUnlockedIndex(0); setTimeLeft(settings.timeLimit);
        setUserInput(''); setSuggestions([]); setIsCorrect(null);
        setHistory((prev: QuizData[]) => prev.some(h => h.trackId === data.trackId) ? prev : [...prev, data]);
      });
      socket.on('game_over', () => { onGameEnd(scoreRef.current, historyRef.current); });
      return () => { socket.off('new_round'); socket.off('game_over'); };
    } else {
        if (!initialData && currentRound === 1 && !quizData && !hasStartedFirstLoad.current) {
            hasStartedFirstLoad.current = true;
            loadNewRound();
        }
    }
  }, [isMultiplayer]);

  const loadNewRound = async () => {
    setIsLoading(true); 
    setQuizData(null);
    setSelectedAnswer(null); 
    setUnlockedIndex(0);
    setTimeLeft(settings.timeLimit); 
    setUserInput(''); 
    setSuggestions([]); 
    setIsCorrect(null);
    try {
      const data = await fetchNextQuiz(settings.genre, settings.answerType, playedIds, settings.gameType, settings.customPlaylistUrl);
      setQuizData(data);
      setPlayedIds((prev: any[]) => [...prev, data.trackId]);
      setHistory((prev: QuizData[]) => prev.some(h => h.trackId === data.trackId) ? prev : [...prev, data]);
    } catch (e) { 
      console.error(e); 
    } finally { 
      setIsLoading(false); 
    }
  };

  // --- AUDIO & TIMER ---
  useEffect(() => {
    if (isLoaded && !selectedAnswer && settings.mode === 'classic' && hasInteracted && quizData?.audioUrl && !isLoading) {
        playFull();
    }
  }, [isLoaded, selectedAnswer, hasInteracted, quizData, isLoading]);

  useEffect(() => {
    if (settings.mode === 'classic' && timeLeft > 0 && hasInteracted && !selectedAnswer && isReady) {
      const timer = setInterval(() => setTimeLeft((prev: number) => prev - 1), 1000);
      return () => clearInterval(timer);
    }
    if (timeLeft === 0 && !selectedAnswer) handleChoice('TEMPS_ECOULÉ');
  }, [timeLeft, hasInteracted, selectedAnswer, isReady]);

  // --- AUTOCOMPLETE ---
  useEffect(() => {
    if (!userInput.trim() || selectedAnswer || settings.answerMode !== 'input') {
      setSuggestions([]); return;
    }
    const delay = setTimeout(async () => {
      try {
        const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:3001' : `http://${window.location.hostname}:3001`;
        const res = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent(userInput)}&type=${quizData?.questionType || 'both'}`);
        const data = await res.json();
        setSuggestions(data);
      } catch (e) { setSuggestions([]); }
    }, 300);
    return () => clearTimeout(delay);
  }, [userInput, selectedAnswer, quizData]);

  // --- ACTIONS ---
  const handleChoice = (choice: string) => {
    if (selectedAnswer || !quizData) return;
    stop();
    
    const correct = choice === quizData.correctAnswer || (settings.answerMode === 'input' && choice !== 'TEMPS_ECOULÉ' && isCorrectFreeInput(choice, quizData));
    setSelectedAnswer(choice); setIsCorrect(correct);
    
    const points = correct ? (settings.mode === 'classic' ? timeLeft * 20 : SONGLESS_TIERS[Math.max(0, unlockedIndex - 1)]?.points || 0) : 0;
    if (correct) setScore((s: number) => s + points);
    
    if (isMultiplayer) {
      socket.emit('submit_answer', { roomCode, points });
    } else {
      setTimeout(() => {
        if (currentRound >= settings.rounds) onGameEnd(scoreRef.current + points, historyRef.current);
        else { setCurrentRound((r: number) => r + 1); loadNewRound(); }
      }, 2500); 
    }
  };

  const getQuestionBadge = () => {
    if (!quizData) return '🎧 Blindtest';
    const badges: any = { artist: "🎙️ L'Artiste", title: '🎵 Le Titre', movie: '🎬 Le Film', series: '📺 La Série' };
    return badges[quizData.questionType] || '🎧 Artiste & Titre';
  };

  if (isLoading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#09090b] text-white">
      <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4" />
      <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs animate-pulse">Chargement...</p>
    </div>
  );

  if (!hasInteracted && !isMultiplayer) return (
    <div className="flex flex-col items-center justify-center min-h-screen text-white p-4 bg-[#09090b]">
      <div className="bg-zinc-900 border border-zinc-800 p-12 rounded-[3rem] shadow-2xl flex flex-col items-center text-center">
        <div className="w-20 h-20 bg-indigo-500 rounded-3xl flex items-center justify-center mb-8 shadow-lg shadow-indigo-500/20">
          <Play className="w-10 h-10 fill-white" />
        </div>
        <h2 className="text-4xl font-black mb-4">Prêt ?</h2>
        <button onClick={() => setHasInteracted(true)} className="bg-white text-black px-12 py-5 rounded-2xl font-black text-xl hover:scale-105 transition-all">Lancer la manche</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col items-center p-6 font-sans overflow-hidden">
      {/* Header */}
      <div className="w-full max-w-4xl flex justify-between items-center mb-12">
        <div className="bg-zinc-900/50 border border-zinc-800 px-6 py-3 rounded-2xl backdrop-blur-md">
          <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest block mb-1 text-left">Manche</span>
          <span className="text-xl font-black">{currentRound} <span className="text-zinc-700">/ {settings.rounds}</span></span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest block mb-1">Score Actuel</span>
          <span className="text-3xl font-black text-indigo-400 tabular-nums">{score}</span>
        </div>
      </div>

      {/* Zone Centrale */}
      <div className="flex-1 w-full max-w-2xl flex flex-col items-center justify-center relative">
        <div className="relative flex items-center justify-center mb-12">
           {/* SVG pour le mode classique avec animation du timer */}
           {settings.mode === 'classic' && (
            <svg className="absolute w-72 h-72 -rotate-90 transform z-0">
              <circle cx="144" cy="144" r="136" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-zinc-800" />
              <circle cx="144" cy="144" r="136" stroke="currentColor" strokeWidth="4" fill="transparent" 
                className="text-indigo-500 transition-all duration-1000" strokeDasharray={855}
                strokeDashoffset={855 - (855 * timeLeft) / settings.timeLimit} strokeLinecap="round" />
            </svg>
          )}

          {/* Affichage adaptatif (Affiche ou Disque) */}
          {['movie', 'series'].includes(quizData?.questionType || '') ? (
             <div className="relative w-48 h-64 rounded-xl overflow-hidden shadow-2xl z-10 border-2 border-zinc-800 bg-zinc-900">
             {quizData?.coverUrl ? (
               <img 
                 src={quizData.coverUrl} 
                 alt="Affiche" 
                 className="w-full h-full object-cover transition-all duration-1000"
                 style={{ filter: `blur(${selectedAnswer ? 0 : (timeLeft / settings.timeLimit) * 20}px)` }}
               />
             ) : (
               <div className="w-full h-full flex items-center justify-center"><Film className="w-12 h-12 text-zinc-600" /></div>
             )}
           </div>
          ) : (
            <div className={`relative w-56 h-56 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-2xl z-10 transition-all duration-500 ${isPlaying ? 'scale-110 border-indigo-500/50' : ''}`}>
              {isPlaying ? (
                <div className="flex items-end gap-1 h-12">
                  {[...Array(5)].map((_, i) => <div key={i} className="w-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.1}s`, height: `${40 + Math.random() * 60}%` }} />)}
                </div>
              ) : <Music2 className="w-16 h-16 text-zinc-700" />}
            </div>
          )}

          <div className={`absolute w-full h-full rounded-full bg-indigo-500/10 blur-3xl transition-opacity duration-1000 ${isPlaying ? 'opacity-100' : 'opacity-0'}`} />
        </div>

        <div className="mb-8 flex flex-col items-center gap-3">
          <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">{getQuestionBadge()}</span>
        </div>

        {/* --- LE MODE SONGLESS (PROGRESSIF) EST DE RETOUR --- */}
        {settings.mode === 'progressive' && quizData?.audioUrl && !selectedAnswer && (
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {SONGLESS_TIERS.map((tier, index) => {
              const isUnlocked = index <= unlockedIndex;
              const isNext = index === unlockedIndex;
              
              return (
                <button
                  key={index}
                  onClick={() => {
                    if (isNext) setUnlockedIndex(index + 1);
                    playSegment(tier.time);
                  }}
                  disabled={index > unlockedIndex || !isReady} 
                  className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${
                    isUnlocked ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'bg-zinc-900 border border-zinc-800 text-zinc-600 cursor-not-allowed'
                  }`}
                >
                  {tier.time}s
                </button>
              );
            })}
          </div>
        )}

        {/* Inputs / Choices */}
        <div className="w-full">
          {settings.answerMode === 'choices' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {quizData?.choices.map((choice, i) => {
                let style = 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-indigo-500/50';
                if (selectedAnswer) {
                  if (choice === quizData.correctAnswer) style = 'bg-emerald-500 border-emerald-400 text-white shadow-lg scale-[1.02]';
                  else if (choice === selectedAnswer) style = 'bg-red-500 border-red-400 text-white';
                  else style = 'bg-zinc-950 border-zinc-900 opacity-20';
                }
                // ON PERMET DE CLIQUER SI ISREADY EST VRAI (Audio ok, ou mode Film sans audio)
                return <button key={i} disabled={!!selectedAnswer || !isReady} onClick={() => handleChoice(choice)} className={`${style} p-5 rounded-2xl border-2 font-bold text-lg transition-all duration-200`}>{choice}</button>;
              })}
            </div>
          ) : (
            <div className="relative w-full">
              <div className="relative">
                <input 
                  type="text" value={userInput} onChange={e => setUserInput(e.target.value)}
                  disabled={!!selectedAnswer || !isReady} placeholder="Tape ta réponse..."
                  className="w-full bg-zinc-900/50 border-2 border-zinc-800 rounded-3xl px-8 py-6 text-xl font-bold outline-none focus:border-indigo-500 transition-all"
                  autoComplete="off"
                />
                <button 
                  onClick={() => handleChoice(userInput)}
                  disabled={!userInput.trim() || !!selectedAnswer || !isReady}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-4 bg-indigo-600 rounded-2xl hover:bg-indigo-500 transition-colors disabled:opacity-20"
                >
                  <Send className="w-6 h-6" />
                </button>
              </div>
              {suggestions.length > 0 && !selectedAnswer && (
                <ul className="absolute z-50 w-full bg-zinc-800 border border-zinc-700 rounded-2xl mt-2 max-h-48 overflow-y-auto shadow-2xl text-left">
                  {suggestions.map((s, i) => (
                    <li key={i} onClick={() => { setUserInput(s); handleChoice(s); }} className="px-6 py-4 border-b border-zinc-700 last:border-0 hover:bg-zinc-700 cursor-pointer font-bold transition flex items-center gap-3">
                      <Search className="w-4 h-4 text-zinc-500" /> {s}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Révélation */}
      {selectedAnswer && (
        <div className="fixed inset-0 bg-[#09090b]/90 backdrop-blur-xl z-50 flex items-center justify-center p-6 animate-in fade-in duration-500">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-[3rem] p-10 text-center shadow-2xl">
            <div className="relative inline-block mb-8">
              {quizData?.coverUrl ? <img src={quizData.coverUrl} className="w-40 h-40 rounded-3xl object-cover shadow-2xl mx-auto" alt="cover" /> : <div className="w-40 h-40 bg-zinc-800 rounded-3xl flex items-center justify-center mx-auto text-4xl">🎵</div>}
              <div className={`absolute -bottom-4 -right-4 p-4 rounded-2xl shadow-xl ${isCorrect ? 'bg-emerald-500' : 'bg-red-500'}`}>
                {isCorrect ? <CheckCircle2 className="w-8 h-8 text-white" /> : <XCircle className="w-8 h-8 text-white" />}
              </div>
            </div>
            <h3 className={`text-3xl font-black mb-2 ${isCorrect ? 'text-emerald-400' : 'text-red-400'}`}>{isCorrect ? 'BIEN JOUÉ !' : 'DOMMAGE...'}</h3>
            <div className="space-y-1 mb-8">
              <p className="text-zinc-500 font-bold uppercase tracking-widest text-[10px]">La réponse était</p>
              <p className="text-white text-2xl font-black">{quizData?.artistName || quizData?.correctAnswer}</p>
              {quizData?.artistName && <p className="text-zinc-400 font-medium">{quizData?.trackTitle}</p>}
            </div>
            <div className="flex items-center justify-center gap-3 text-zinc-500 font-bold animate-pulse uppercase text-[10px] tracking-[0.2em]">
              <SkipForward className="w-4 h-4" /> {isMultiplayer ? "Attente des joueurs..." : "Round suivant..."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}