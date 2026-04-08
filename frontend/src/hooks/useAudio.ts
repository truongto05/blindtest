import { useEffect, useRef, useState } from 'react';
import { Howl } from 'howler';

export const useAudio = (audioUrl: string | null) => {
  const soundRef = useRef<Howl | null>(null);
  const stopTimeoutRef = useRef<number | null>(null);

  const [isLoaded, setIsLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const clearStopTimeout = () => {
    if (stopTimeoutRef.current !== null) {
      window.clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    clearStopTimeout();
    setIsLoaded(false);
    setIsPlaying(false);

    if (!audioUrl) {
      if (soundRef.current) {
        soundRef.current.unload();
        soundRef.current = null;
      }
      return;
    }

    if (soundRef.current) {
      soundRef.current.unload();
      soundRef.current = null;
    }

    soundRef.current = new Howl({
      src: [audioUrl],
      // On remet html5 à TRUE. C'est indispensable pour contourner les blocages 
      // de sécurité (CORS) de Deezer sur les navigateurs comme Safari ou Edge.
      html5: true, 
      preload: true,
      onload: () => setIsLoaded(true),
      onplay: () => setIsPlaying(true),
      onend: () => setIsPlaying(false),
      onstop: () => setIsPlaying(false),
      onloaderror: (_, error) => {
        console.error('Erreur de chargement audio:', error);
        setIsLoaded(false);
        setIsPlaying(false);
      },
      onplayerror: (_, error) => {
        console.error('Erreur de lecture audio:', error);
        setIsPlaying(false);
        if (soundRef.current) {
          soundRef.current.once('unlock', () => {
            soundRef.current?.play();
          });
        }
      }
    });

    return () => {
      clearStopTimeout();
      if (soundRef.current) {
        soundRef.current.unload();
        soundRef.current = null;
      }
    };
  }, [audioUrl]);

  const playSegment = (duration: number) => {
    if (!soundRef.current || !isLoaded) return;
    clearStopTimeout();
    soundRef.current.stop();
    soundRef.current.seek(0);
    soundRef.current.play();
    setIsPlaying(true);

    stopTimeoutRef.current = window.setTimeout(() => {
      if (soundRef.current?.playing()) {
        soundRef.current.stop();
      }
      setIsPlaying(false);
      stopTimeoutRef.current = null;
    }, duration * 1000);
  };

  const playFull = () => {
    if (!soundRef.current || !isLoaded) return;
    clearStopTimeout();
    soundRef.current.stop();
    soundRef.current.seek(0);
    soundRef.current.play();
    setIsPlaying(true);
  };

  const stop = () => {
    clearStopTimeout();
    if (soundRef.current) {
      soundRef.current.stop();
    }
    setIsPlaying(false);
  };

  return { isLoaded, isPlaying, playSegment, playFull, stop };
};