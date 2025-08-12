"use client";
import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Lesson } from '../types';
import { useSession } from 'next-auth/react';
import { finalizeLesson } from '../../../lib/lessonCompletion';
import { buildQuestionBlocks } from './questions';
import { createCloudGroup, preventOverlap, layoutCloudText, laneCenterY } from './clouds';
import { Cloud, LOGICAL_HEIGHT, LOGICAL_WIDTH, TOP_SAFE_ZONE } from './types';

// Diese Implementierung ist eine möglichst exakte Portierung der reinen JS-Version (game.js)
// in eine gekapselte React-Komponente. Layout & Logik orientieren sich Zeile für Zeile am Original.
// Unterschied: Fragen stammen aus lesson.content.blocks (gleich wie bei Snake) oder fallback zu lesson.questions.
// Abschlussbedingung: Score >= targetScore (analog Snake), ansonsten 3 Leben -> Game Over.

interface Props { lesson: Lesson; courseId: string; completedLessons: string[]; setCompletedLessons: (v: string[] | ((p:string[])=>string[]))=>void; }

// Konstanten (aus index.html + game.js)
// Konstanten jetzt in types.ts
const FORCE_MIN_DPR = 2;
const PLANE_DISPLAY_WIDTH = 126;
const PLANE_MIRRORED = true;
const BG_SCROLL_SPEED = 60;
const MAX_LIVES = 3;
// Kann über lesson.content.planeScale (0.2 - 1.0) überschrieben werden
const DEFAULT_DISPLAY_SCALE = 0.8; // vergrößert (~doppelt so groß wie vorher 0.4)

// Cloud Interface importiert

export default function PlaneGame({ lesson, courseId, completedLessons, setCompletedLessons }: Props){
  const { data: session } = useSession();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [running, setRunning] = useState(false); // wurde gestartet
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [clouds, setClouds] = useState<Cloud[]>([]);
  const cloudsRef = useRef<Cloud[]>([]); // für Render ohne Neumount des Game-Loops
  useEffect(()=>{ cloudsRef.current = clouds; }, [clouds]);
  const collisionCooldownRef = useRef(0); // Sekunden bis erneut gezählt wird
  const [questionText, setQuestionText] = useState('');
  const [activeQuestionId, setActiveQuestionId] = useState(0);
  const questionIdCounterRef = useRef(0);
  const [marking, setMarking] = useState(false);
  const [finished, setFinished] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Target Score aus lesson.content.targetScore analog Snake (Default 15)
  const targetScore = Number((lesson as any)?.content?.targetScore) || 15;

  // Fragenquelle: versuche lesson.content.blocks (QuestionBlock), fallback lesson.questions (MC)
  const blocks = buildQuestionBlocks(lesson);

  // Plane State
  const planeRef = useRef({ x: LOGICAL_WIDTH * 0.35, y: LOGICAL_HEIGHT/2, w: 120, h: 60, vy:0, speed:420, angle:0, targetAngle:0 });
  const keysRef = useRef({ ArrowUp:false, ArrowDown:false });
  const lastTimeRef = useRef(0);
  const lastFrameDtRef = useRef(0);
  const bgOffsetRef = useRef(0);

  const planeImgRef = useRef<HTMLImageElement | null>(null);
  const planeReadyRef = useRef(false);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const bgReadyRef = useRef(false);

  // Frage-Reihenfolge
  const questionOrderRef = useRef<number[]>([]);
  const questionIndexRef = useRef(0);

  const shuffleQuestions = useCallback(()=>{
    const n = blocks.length;
    questionOrderRef.current = [...Array(n).keys()];
    for(let i=n-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [questionOrderRef.current[i], questionOrderRef.current[j]] = [questionOrderRef.current[j], questionOrderRef.current[i]]; }
    questionIndexRef.current = 0;
  },[blocks.length]);

  const nextQuestion = useCallback(()=>{
    if(!blocks.length) return null;
    if(questionIndexRef.current >= questionOrderRef.current.length) shuffleQuestions();
    const q = blocks[ questionOrderRef.current[questionIndexRef.current] ];
    questionIndexRef.current +=1;
    return q;
  },[blocks, shuffleQuestions]);

  // laneCenterY, layoutCloudText, preventOverlap ausgelagert

  const spawnClouds = useCallback((append:boolean)=>{
    const canvas = canvasRef.current; if(!canvas) return; const ctx = canvas.getContext('2d'); if(!ctx) return;
    const q = nextQuestion(); if(!q) return;
    const newQid = questionIdCounterRef.current + 1; questionIdCounterRef.current = newQid; setActiveQuestionId(newQid);
    setQuestionText(q.question || (q as any).prompt || '');
    setClouds(prev=>{
      const existing = append ? prev : [];
      const group = createCloudGroup(ctx, q, newQid, existing);
      return append ? group : group.slice(-4); // wenn nicht append, nur neue Gruppe
    });
  },[nextQuestion]);

  // Fullscreen
  const toggleFullscreen = () => {
    const el = wrapperRef.current; if(!el) return;
    if(!document.fullscreenElement){ el.requestFullscreen?.(); } else { document.exitFullscreen?.(); }
  };
  useEffect(()=>{ const handler=()=> setIsFullscreen(!!document.fullscreenElement); document.addEventListener('fullscreenchange', handler); return ()=> document.removeEventListener('fullscreenchange', handler); },[]);

  // Input
  useEffect(()=>{
    const handleKeyDown = (e:KeyboardEvent)=>{ if(e.code==='ArrowUp'||e.code==='ArrowDown'){ keysRef.current[e.code]=true; e.preventDefault(); }
      if(!running && e.code==='Enter'){ start(); }
      if(gameOver && e.code==='Enter'){ restart(); }
      if(running && !gameOver && (e.code==='KeyP' || e.code==='Space')){ setPaused(p=>!p); }
    };
    const handleKeyUp = (e:KeyboardEvent)=>{ if(e.code==='ArrowUp'||e.code==='ArrowDown'){ keysRef.current[e.code]=false; e.preventDefault(); } };
    window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
    return ()=>{ window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  },[running, gameOver]);

  // High-DPI Setup einmalig (ohne window-basiertes Resizing, damit unsere eigene Skalierung bleibt)
  useEffect(()=>{
    const canvas = canvasRef.current; if(!canvas) return; const ctx = canvas.getContext('2d'); if(!ctx) return;
    const sysDpr = window.devicePixelRatio || 1; const dpr = Math.max(sysDpr, FORCE_MIN_DPR);
    canvas.width = Math.round(LOGICAL_WIDTH * dpr); canvas.height = Math.round(LOGICAL_HEIGHT * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0); ctx.imageSmoothingEnabled = true; (ctx as any).imageSmoothingQuality = 'high';
  },[]);

  // Assets laden
  useEffect(()=>{
    const planeImg = new Image(); planeImg.onload=()=>{ planeReadyRef.current=true; const w=planeImg.naturalWidth||320; const h=planeImg.naturalHeight||160; const aspect=h/w; planeRef.current.w = PLANE_DISPLAY_WIDTH; planeRef.current.h = PLANE_DISPLAY_WIDTH * aspect; }; planeImg.src='/media/flugzeug.svg'; planeImgRef.current=planeImg;
    const bgImg = new Image(); bgImg.onload=()=>{ bgReadyRef.current=true; }; bgImg.src='/media/hintergrundbild.png'; bgImgRef.current=bgImg;
  },[]);

  // Start / Restart
  const start = ()=>{ if(!blocks.length) return; setRunning(true); setPaused(false); setGameOver(false); setScore(0); setLives(MAX_LIVES); setFinished(false); collisionCooldownRef.current = 0; planeRef.current = { x: LOGICAL_WIDTH * 0.35, y: LOGICAL_HEIGHT/2, w: planeRef.current.w, h: planeRef.current.h, vy:0, speed:420, angle:0, targetAngle:0 }; setClouds([]); cloudsRef.current=[]; shuffleQuestions(); spawnClouds(false); };
  const restart = ()=> start();

  // Game Loop
  useEffect(()=>{
    if(!running) return;
    const canvas = canvasRef.current; if(!canvas) return; const ctx = canvas.getContext('2d'); if(!ctx) return;
  // Frame Handle
  let frameHandle:number;
    const collides = (a:{x:number;y:number;w:number;h:number}, b:{x:number;y:number;w:number;h:number})=> Math.abs(a.x-b.x) <= (a.w+b.w)*0.5 && Math.abs(a.y-b.y) <= (a.h+b.h)*0.5;

    const update = (dt:number)=>{
      if(paused || gameOver) { lastFrameDtRef.current = 0; return; }
  lastFrameDtRef.current = dt;
  if(collisionCooldownRef.current>0){ collisionCooldownRef.current = Math.max(0, collisionCooldownRef.current - dt); }
      const plane = planeRef.current;
      if(keysRef.current.ArrowUp) plane.y -= plane.speed * dt;
      if(keysRef.current.ArrowDown) plane.y += plane.speed * dt;
      plane.y = Math.max(TOP_SAFE_ZONE + plane.h/2 + 5, Math.min(LOGICAL_HEIGHT-40, plane.y));
      if(keysRef.current.ArrowUp && !keysRef.current.ArrowDown) plane.targetAngle=-30; else if(keysRef.current.ArrowDown && !keysRef.current.ArrowUp) plane.targetAngle=30; else plane.targetAngle = 0; plane.angle += (plane.targetAngle - plane.angle) * Math.min(1, dt*10);

      setClouds(prev=>{
        let correctHit = false;
        let collidedThisFrame = false;
  let arr: Cloud[] = [];
        for(const c of prev){
          const nc: Cloud = { ...c, prevX: c.x };
          nc.x -= nc.speed * dt;
          if(collisionCooldownRef.current===0 && !collidedThisFrame && nc.active && !nc.hit && collides({x:plane.x,y:plane.y,w:plane.w,h:plane.h},{x:nc.x,y:nc.y,w:nc.w,h:nc.h})){
            nc.hit = true; nc.active = false; nc.hitTime = 0; collidedThisFrame = true; // deaktivieren verhindert weitere Treffer
            if(nc.correct){
              correctHit = true; setScore(s=>s+1);
            } else {
              // Abzug pro Wolke (nc sofort inactive, daher maximal einmal)
              setLives(l=>{ const n=Math.max(0,l-1); if(n<=0) triggerGameOver(); return n; });
            }
            collisionCooldownRef.current = 0.35; // etwas längerer Lockout
          }
          arr.push(nc);
        }
        if(!correctHit){
          for(const c of arr){ if(c.active && c.x + c.w < -150 && !c.hit){
            const others = arr.filter(o=>o!==c && !o.hit);
            let attempts=0; do { c.lane=Math.floor(Math.random()*4); attempts++; } while(others.some(o=>o.lane===c.lane) && attempts<10);
            c.y = laneCenterY(c.lane, c.h);
            const layout = layoutCloudText(ctx, c.text, c.w, c.h, {maxFont:26, minFont:4, hPadding:28, vPadding:12});
            c.fontSize=layout.fontSize; c.lines=layout.lines; c.lineHeight=layout.lineHeight;
            c.speed=220+Math.random()*40;
            const rightMost = Math.max(...arr.map(cl=>cl===c?-Infinity:cl.x + cl.w/2));
            c.x = Math.max(LOGICAL_WIDTH + 100 + Math.random()*120, rightMost + c.w/2 + 120);
            preventOverlap(arr);
          }}
        } else {
          const lastQ = activeQuestionId;
          // alte Fragewolken komplett entfernen (auch getroffene) für frischen Spawn
          const filtered = arr.filter(c=> c.qid !== lastQ);
          arr = filtered;
          setTimeout(()=> spawnClouds(false),0); // neue Gruppe ersetzt alte
        }
        arr.forEach(c=>{ if(c.hit){ c.hitTime=(c.hitTime||0)+dt; } });
        const cleaned = arr.filter(c=> !( !c.active && c.x + c.w < -200));
        cloudsRef.current = cleaned;
        return cleaned;
      });
    };

    const triggerGameOver = ()=>{ setGameOver(true); };

  function loopFrame(timestamp:number){ const last = lastTimeRef.current || timestamp; const dt = (timestamp - last)/1000; lastTimeRef.current = timestamp; update(dt); render(); frameHandle = requestAnimationFrame(loopFrame); }
    const render = ()=>{
      const ctx = canvas.getContext('2d'); if(!ctx) return;
      ctx.clearRect(0,0,LOGICAL_WIDTH,LOGICAL_HEIGHT);
      drawScrollingBackground(ctx);
      // Immer aktuelle Ref nutzen
      cloudsRef.current.forEach(c=> drawCloud(ctx,c));
      drawPlane(ctx);
      if(paused && !gameOver){
        ctx.fillStyle='rgba(0,0,0,0.45)'; ctx.fillRect(0,0,LOGICAL_WIDTH,LOGICAL_HEIGHT);
        ctx.fillStyle='#fff'; ctx.font='48px system-ui'; ctx.textAlign='center'; ctx.fillText('PAUSE', LOGICAL_WIDTH/2, LOGICAL_HEIGHT/2);
        ctx.font='20px system-ui'; ctx.fillText('P oder Space zum Fortsetzen', LOGICAL_WIDTH/2, LOGICAL_HEIGHT/2 + 40);
      }
    };
  const drawPlane = (ctx:CanvasRenderingContext2D)=>{ const plane=planeRef.current; ctx.save(); ctx.translate(plane.x, plane.y); ctx.rotate(plane.angle * Math.PI/180); if(planeReadyRef.current && planeImgRef.current){ ctx.imageSmoothingEnabled=true; (ctx as any).imageSmoothingQuality='high'; if(PLANE_MIRRORED) ctx.scale(-1,1); ctx.drawImage(planeImgRef.current, -plane.w/2, -plane.h/2, plane.w, plane.h); } else { ctx.fillStyle='#f33'; ctx.fillRect(-plane.w/2, -plane.h/2, plane.w, plane.h); } ctx.restore(); };
    const drawScrollingBackground = (ctx:CanvasRenderingContext2D)=>{ if(bgReadyRef.current && bgImgRef.current){ const iw=bgImgRef.current.width, ih=bgImgRef.current.height; const scale = LOGICAL_HEIGHT / ih; const tileW = iw*scale; const tileH=LOGICAL_HEIGHT; bgOffsetRef.current -= BG_SCROLL_SPEED * lastFrameDtRef.current; if(bgOffsetRef.current <= -tileW){ bgOffsetRef.current = bgOffsetRef.current % tileW; } let startX = bgOffsetRef.current; while(startX > 0) startX -= tileW; for(let x=startX; x<LOGICAL_WIDTH; x+=tileW){ ctx.drawImage(bgImgRef.current,x,0,tileW,tileH); } ctx.fillStyle='rgba(255,255,255,0.08)'; ctx.fillRect(0,0,LOGICAL_WIDTH,LOGICAL_HEIGHT); } else { const grad=ctx.createLinearGradient(0,0,0,LOGICAL_HEIGHT); grad.addColorStop(0,'#4c9be2'); grad.addColorStop(1,'#b5ddff'); ctx.fillStyle=grad; ctx.fillRect(0,0,LOGICAL_WIDTH,LOGICAL_HEIGHT); } };
    const drawCloud = (ctx:CanvasRenderingContext2D, c:Cloud)=>{ ctx.save(); ctx.translate(c.x, c.y); let scale=1; if(c.hit){ const t = Math.min(0.25, c.hitTime||0)/0.25; const bump = c.correct ? 0.3 : 0.25; scale = 1 + bump*(1-t); } ctx.scale(scale,scale); ctx.beginPath(); ctx.ellipse(0,0,c.w/2,c.h/2,0,0,Math.PI*2); const grad=ctx.createLinearGradient(0,-c.h/2,0,c.h/2); if(c.hit){ if(c.correct){ grad.addColorStop(0,'#d5ffe0'); grad.addColorStop(1,'#63f78e'); } else { grad.addColorStop(0,'#ffe3e3'); grad.addColorStop(1,'#ff9d9d'); } } else { grad.addColorStop(0,'#ffffff'); grad.addColorStop(1,'#e6f1ff'); } ctx.fillStyle=grad; ctx.shadowColor='rgba(0,0,0,0.18)'; ctx.shadowBlur=10; ctx.shadowOffsetY=4; ctx.fill(); ctx.shadowColor='transparent'; ctx.lineWidth = c.hit?4:2; ctx.strokeStyle = c.hit ? (c.correct? 'rgba(0,160,40,0.9)' : 'rgba(220,0,0,0.85)') : 'rgba(0,0,0,0.12)'; ctx.stroke(); ctx.fillStyle = c.hit && !c.correct ? '#400' : '#222'; const fs = c.fontSize || 26; ctx.font = `600 ${fs}px system-ui`; ctx.textAlign='center'; ctx.textBaseline='middle'; if(c.lines && c.lines.length){ const totalH = c.lines.length * c.lineHeight; for(let i=0;i<c.lines.length;i++){ const line=c.lines[i]; const cy = (i+0.5)*c.lineHeight - totalH/2; ctx.fillText(line,0,cy); } } else { ctx.fillText(c.text,0,2); } ctx.restore(); };

  frameHandle = requestAnimationFrame(loopFrame);
  return ()=> cancelAnimationFrame(frameHandle);
  },[running, paused, gameOver, spawnClouds, activeQuestionId, nextQuestion]);

  // Completion analog Snake
  useEffect(()=>{ if(!finished && score >= targetScore){ setFinished(true); if(!completedLessons.includes(lesson._id)){ (async()=>{ try{ if(!session?.user?.username) return; setMarking(true); await finalizeLesson({ username: session.user.username, lessonId: lesson._id, courseId, type: lesson.type, earnedStar: lesson.type !== 'markdown' }); setCompletedLessons(prev=> prev.includes(lesson._id)? prev: [...prev, lesson._id]); } finally { setMarking(false);} })(); } } },[score, targetScore, finished, completedLessons, lesson._id, lesson.type, courseId, session?.user?.username, setCompletedLessons]);

  // Skalierung aus Lesson-Content (optional)
  const contentScaleRaw = Number((lesson as any)?.content?.planeScale);
  const DISPLAY_SCALE = (!isNaN(contentScaleRaw) && contentScaleRaw>0.15 && contentScaleRaw<=1) ? contentScaleRaw : DEFAULT_DISPLAY_SCALE;
  const displayWidth = Math.round(LOGICAL_WIDTH * DISPLAY_SCALE);

  // Fullscreen dynamische Anpassung (Canvas soll Viewport maximal ausfüllen bei 16:9)
  useEffect(()=>{
    function apply(){
      const canvas = canvasRef.current; if(!canvas) return;
      if(isFullscreen){
        const vw = window.innerWidth; const vh = window.innerHeight;
        const targetRatio = LOGICAL_WIDTH / LOGICAL_HEIGHT;
        let w = vw; let h = Math.round(w / targetRatio);
        if(h > vh){ h = vh; w = Math.round(h * targetRatio); }
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        canvas.style.maxWidth = '100vw';
      } else {
        const canvas = canvasRef.current; if(!canvas) return;
        canvas.style.width = displayWidth + 'px';
        canvas.style.height = Math.round(displayWidth * (LOGICAL_HEIGHT/LOGICAL_WIDTH)) + 'px';
        canvas.style.maxWidth = '100%';
      }
    }
    apply();
    if(isFullscreen){
      window.addEventListener('resize', apply);
      return ()=> window.removeEventListener('resize', apply);
    }
  },[displayWidth, isFullscreen]);
  return (
    <div ref={wrapperRef} className={isFullscreen ? 'w-screen h-screen flex items-center justify-center bg-black' : 'w-full py-4'}>
      <div className={isFullscreen ? 'relative' : 'mx-auto flex justify-center'} style={ isFullscreen ? {width:'100%', height:'100%'} : {width:'100%', maxWidth:displayWidth} }>
        <div className="relative" style={ isFullscreen ? {width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center'} : {width:displayWidth} }>
          <canvas
          ref={canvasRef}
          width={LOGICAL_WIDTH}
          height={LOGICAL_HEIGHT}
          className={isFullscreen ? 'block h-auto rounded bg-black' : 'block mx-auto h-auto rounded shadow-lg bg-gradient-to-b from-sky-500 to-sky-300'}
          style={ isFullscreen ? { aspectRatio: `${LOGICAL_WIDTH}/${LOGICAL_HEIGHT}` } : { width: displayWidth, aspectRatio: `${LOGICAL_WIDTH}/${LOGICAL_HEIGHT}` } }
        />
        {/* Frage */}
        {questionText && running && !gameOver && !finished && (
          <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-center text-xl sm:text-2xl font-semibold px-4 py-2 rounded-lg max-w-[90%] whitespace-pre-wrap">
            {questionText}
          </div>
        )}
        {/* Scoreboard */}
  <div className="absolute top-1 right-1 flex gap-3 text-white font-semibold drop-shadow-md text-[10px] sm:text-xs">
          <span className="tracking-wide">{'❤'.repeat(Math.max(0, lives))}</span>
          <span>Punkte: {score}</span>
        </div>
        {/* Start Overlay */}
        {!running && !finished && !gameOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 text-center text-white p-4">
            <h2 className="text-2xl font-bold mb-3">✈️ Flugzeug Quiz</h2>
            <p className="mb-3 max-w-sm text-xs sm:text-sm">Steuere mit ↑ / ↓ durch die richtige Antwort-Wolke. Enter oder Button startet.</p>
            <button onClick={start} className="px-5 py-2 rounded bg-amber-400 hover:bg-amber-500 text-black font-semibold text-xs shadow">Start (Enter)</button>
            <p className="mt-4 text-[10px] text-white/70">Punkte-Ziel: {targetScore}</p>
          </div>
        )}
        {/* Pause Overlay */}
        {running && paused && !gameOver && !finished && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white text-center p-3">
            <div className="text-xl font-bold mb-3">Pause</div>
            <button onClick={()=> setPaused(false)} className="px-4 py-1.5 rounded bg-white text-gray-800 text-xs font-semibold">Weiter</button>
          </div>
        )}
        {/* Game Over */}
        {gameOver && !finished && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-center p-4 text-white">
            <div className="text-red-400 font-bold text-2xl mb-3">Game Over</div>
            <div className="text-xs mb-3">Punkte: {score}</div>
            <button onClick={restart} className="px-5 py-2 rounded bg-red-500 hover:bg-red-600 text-white text-xs font-semibold">Neu starten</button>
          </div>
        )}
        {/* Finished */}
        {finished && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-center p-4 text-white">
            <div className="text-green-400 font-bold text-2xl mb-2">✔ Ziel erreicht</div>
            <div className="text-xs mb-3">Punkte: {score}</div>
            <button onClick={restart} className="px-5 py-2 rounded bg-green-500 hover:bg-green-600 text-white text-xs font-semibold">Nochmal</button>
          </div>
        )}
        {/* Marking */}
        {marking && (
          <div className="absolute bottom-2 left-2 text-[11px] px-2 py-1 rounded bg-white/70 text-gray-700">Speichere Abschluss…</div>
        )}
        {/* Steuerungstipp */}
  <div className="absolute bottom-1 left-2 text-[9px] sm:text-[10px] text-white/80 drop-shadow">↑ / ↓ steuern • P / Space Pause</div>
        {/* Pause Button klein oben links */}
        {running && !gameOver && !finished && (
          <div className="absolute top-1 left-1 flex gap-1">
            <button onClick={()=> setPaused(p=>!p)} className="bg-white/70 hover:bg-white text-gray-800 text-[10px] font-semibold px-1.5 py-0.5 rounded shadow">
              {paused? '▶':'II'}
            </button>
            <button onClick={toggleFullscreen} className="bg-white/70 hover:bg-white text-gray-800 text-[10px] font-semibold px-1.5 py-0.5 rounded shadow" title={isFullscreen? 'Fullscreen verlassen':'Fullscreen'}>
              {isFullscreen? '⤢':'⛶'}
            </button>
          </div>
        )}
        {!running && !finished && !gameOver && (
          <button onClick={toggleFullscreen} className="absolute top-1 left-1 bg-white/70 hover:bg-white text-gray-800 text-[10px] font-semibold px-1.5 py-0.5 rounded shadow" title={isFullscreen? 'Fullscreen verlassen':'Fullscreen'}>
            {isFullscreen? '⤢':'⛶'}
          </button>
        )}
        </div>
      </div>
    </div>
  );
}
