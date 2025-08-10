"use client";
import React from 'react';
import type { Lesson } from './types';
import { CELL, COLS, ROWS } from './snake/constants';
import { useSnakeRendering } from './snake/useSnakeRendering';
import { useSnakeLogic } from './snake/useSnakeLogic';
import { useSession } from 'next-auth/react';
// finalizeLesson Logik ist nun im useSnakeLogic Hook gekapselt

interface Props { lesson: Lesson; courseId: string; completedLessons: string[]; setCompletedLessons: (v: string[] | ((p:string[])=>string[]))=>void; }

// Defaults (bleiben hier – könnten später mit ausgelagert werden)
// (Defaults werden im Logic-Hook gehandhabt)

export default function SnakeGame({ lesson, courseId, completedLessons, setCompletedLessons }: Props){
  const { data: session } = useSession();
  const { snake, foods, food, score, running, finished, gameOver, showHelp, currentQuestion, targetScore, marking, setShowHelp, setRunning, restart, blocksLength } = useSnakeLogic({ lesson, courseId, completedLessons, setCompletedLessons, sessionUsername: session?.user?.username });
  const canvasRef = useSnakeRendering({ snake, foods, food, blocksLength, score, finished, targetScore });
  // (Alle Spiel-/Abschluss-Logik jetzt komplett im Hook)

  return (
    <div className="w-full flex flex-col lg:flex-row gap-6">
      {/* Info Panel */}
  <div className="lg:w-64 flex-shrink-0 bg-white border rounded p-4 space-y-4 h-fit min-h-[420px]">
        <h2 className="text-lg font-semibold">🐍 Snake Quiz</h2>
        <div className="text-sm space-y-1">
          <div><span className="font-medium">Punkte:</span> {score} / {targetScore}</div>
          <div><span className="font-medium">Status:</span> {finished ? 'Abgeschlossen' : (running ? 'Läuft' : 'Pausiert')}</div>
        </div>
        {/* Steuerungs-Buttons nur während aktivem Spiel sichtbar */}
        {!(finished || gameOver) && (
          <div className="flex gap-2 text-xs">
            <button onClick={()=> setRunning(r=>!r)} className="px-3 py-1 rounded border bg-gray-50 hover:bg-white">{running? 'Pause':'Start'}</button>
            <button onClick={()=> setShowHelp(h=>!h)} className="px-3 py-1 rounded border bg-gray-50 hover:bg-white">{showHelp? 'Hilfe ausblenden':'Hilfe'}</button>
          </div>
        )}
  {/* (Optionales Touch-Steuerkreuz wurde entfernt beim Refactor – kann als separate Komponente wieder hinzugefügt werden) */}
  {blocksLength>0 && currentQuestion && !(finished || gameOver) && (
          <div className="text-sm">
            <div className="text-gray-700 whitespace-pre-wrap break-words">{currentQuestion.question}</div>
          </div>
        )}
  {blocksLength>0 && foods.length === 4 && !(finished || gameOver) && (
          <div className="space-y-1 text-xs">
            <ul className="space-y-1">
              {foods.map((f,i)=>(
                <li key={i} className="flex items-center gap-2">
                  <span className="inline-block w-4 h-4 rounded-sm border" style={{background:f.color}}></span>
                  <span className="flex-1 break-words">{f.answer}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {showHelp && !(finished || gameOver) && (
          <div className="text-[11px] text-gray-600 border rounded p-2 bg-gray-50 leading-snug">
            Steuerung: Pfeiltasten oder Buttons. Triff das Feld der richtigen Antwortfarbe. Falsche Antwort oder Selbstkollision beendet das Spiel.
          </div>
        )}
      </div>
      {/* Spielfeld */}
      <div className="flex-1">
        <div className="inline-block relative">
          <canvas ref={canvasRef} width={COLS*CELL} height={ROWS*CELL} className="border rounded bg-white block" style={{aspectRatio:'1/1', width:'100%', maxWidth:COLS*CELL}} />
          {/* Start Overlay */}
          {!running && !finished && !gameOver && score===0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/85 backdrop-blur-sm text-center p-4">
              <button onClick={()=> setRunning(true)} className="px-6 py-3 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md text-sm">Start (Leertaste)</button>
              {blocksLength>0 && <div className="mt-3 text-[11px] text-gray-600 max-w-[260px]">Steuere die Schlange zur Farbe der richtigen Antwort. Space oder Button startet.</div>}
            </div>
          )}
          {finished && score >= targetScore && (
            <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center text-center p-4">
              <div className="text-green-700 font-semibold mb-2">✔️ Ziel erreicht!</div>
            </div>
          )}
          {gameOver && !finished && (
            <div className="absolute inset-0 bg-white/85 flex flex-col items-center justify-center text-center p-4">
              <div className="text-red-600 font-semibold text-lg mb-2">Game Over</div>
              <div className="text-xs text-gray-600 mb-3">Du bist aus dem Spielfeld oder in dich selbst / falsche Antwort.</div>
      <button onClick={restart} className="px-4 py-2 text-xs rounded bg-red-600 text-white hover:bg-red-700">Neu starten</button>
            </div>
          )}
        </div>
    {marking && <div className="mt-2 text-xs text-gray-500">Speichere Abschluss…</div>}
      </div>
    </div>
  );
}

// (Ehemalige HelpSection entfernt – Hilfe jetzt über Button neben Start) 
