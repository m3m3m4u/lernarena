"use client";
import React, { useRef, useState, useEffect } from 'react';
import type { Lesson } from '../types';
import { useSession } from 'next-auth/react';
import { finalizeLesson } from '../../../lib/lessonCompletion';
import { buildQuestionBlocks } from '../plane/questions';

interface Props { lesson: Lesson; courseId: string; completedLessons: string[]; setCompletedLessons: (v: string[] | ((p:string[])=>string[]))=>void; }

// Logische Auflösung
const W = 960; const H = 540;
const FORCE_MIN_DPR = 2;
const MAX_LIVES = 3;
const DEFAULT_TARGET_SCORE = 15;

interface Orb { x:number; y:number; r:number; color:string; correct:boolean; speed:number; spawnEntry:any; _hit?:boolean; _remove?:boolean; }
interface Projectile { x:number; y:number; vx:number; r:number; _hit?:boolean; }
interface Particle { x:number; y:number; vx:number; vy:number; life:number; maxLife:number; color:string; size:number; }
interface SpawnEntry { color:string; correct:boolean; laneIndex:number; nextSpawn:number; }

export default function SpaceImpactGame({ lesson, courseId, completedLessons, setCompletedLessons }: Props){
  const canvasRef = useRef<HTMLCanvasElement|null>(null);
  const wrapperRef = useRef<HTMLDivElement|null>(null);
  const { data: session } = useSession();

  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [questionText, setQuestionText] = useState('');
  const [marking, setMarking] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentAnswers, setCurrentAnswers] = useState<{text:string; correct:boolean; color:string}[]>([]);

  // Fragen
  const blocks = buildQuestionBlocks(lesson);
  const targetScore = Number((lesson as any)?.content?.targetScore) || DEFAULT_TARGET_SCORE;

  // Fragegewichtung wie Original (gewichtete Auswahl)
  const questionPoolRef = useRef<{idx:number; weight:number}[]>([]);
  const currentQuestionIndexRef = useRef(0);
  const spawnEntriesRef = useRef<SpawnEntry[]>([]);

  const initQuestionPool = () => { questionPoolRef.current = blocks.map((b,i)=>({idx:i, weight:5})); };
  const pickNextQuestionIndex = ():number => {
    if(!questionPoolRef.current.length) initQuestionPool();
    const total = questionPoolRef.current.reduce((s,q)=>s+q.weight,0);
    let r = Math.random()*total;
    for(const q of questionPoolRef.current){ if(r < q.weight) return q.idx; r -= q.weight; }
    return questionPoolRef.current[0].idx;
  };
  const increaseWeight = (idx:number, amount:number) => { const e = questionPoolRef.current.find(q=>q.idx===idx); if(e) e.weight = Math.min(e.weight + amount, 60); };
  const decreaseWeight = (idx:number, factor:number) => { const e = questionPoolRef.current.find(q=>q.idx===idx); if(e) e.weight = Math.max(e.weight * factor, 1); };

  const loadQuestion = (idx?:number) => {
    if(idx==null || idx>=blocks.length) idx = pickNextQuestionIndex();
    currentQuestionIndexRef.current = idx;
    const q = blocks[idx];
    setQuestionText(q.question || (q as any).prompt || '');
    const rawAnswers = (q.answers || (q as any).options || []).map((a:any,i:number)=>({ text: a.text || a.answer || a.value || '', correct: !!a.correct }));
    spawnEntriesRef.current = rawAnswers.map((a,i)=>({
        color: pickColorForIndex(i),
        correct: a.correct,
        laneIndex: i,
        nextSpawn: 0
      }));
    setCurrentAnswers(rawAnswers.map((a,i)=> ({...a, color: pickColorForIndex(i)})));
  };

  // Farben an Position knüpfen (Mapping stabil für Lesson)
  const colorPalette = ['red','blue','green','yellow'];
  const colorHex:Record<string,string> = { red:'#e53935', blue:'#1e88e5', green:'#43a047', yellow:'#fdd835', black:'#111'};
  const pickColorForIndex = (i:number)=> colorPalette[i % colorPalette.length];

  // Entities
  const shipRef = useRef({ x:70, y:H/2, r:22, speed:320 });
  const projectilesRef = useRef<Projectile[]>([]);
  const orbsRef = useRef<Orb[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const baseOrbSpeedRef = useRef(70);
  const gameTimeRef = useRef(0);
  const shootCooldownRef = useRef(0);
  const inputRef = useRef({ up:false, down:false, shoot:false });
  const lastTimeRef = useRef(0);
  const lastFrameDtRef = useRef(0);
  const wrongFlashRef = useRef(0);
  const shakeRef = useRef(0);

  // Fullscreen
  const toggleFullscreen = ()=>{ const el = wrapperRef.current; if(!el) return; if(!document.fullscreenElement){ el.requestFullscreen?.(); } else { document.exitFullscreen?.(); } };
  useEffect(()=>{ const handler=()=> setIsFullscreen(!!document.fullscreenElement); document.addEventListener('fullscreenchange',handler); return ()=> document.removeEventListener('fullscreenchange',handler); },[]);

  // Input
  useEffect(()=>{
    const kd=(e:KeyboardEvent)=>{ if(e.code==='ArrowUp'||e.code==='KeyW'){ inputRef.current.up=true; e.preventDefault(); } if(e.code==='ArrowDown'||e.code==='KeyS'){ inputRef.current.down=true; e.preventDefault(); } if(e.code==='Space'){ inputRef.current.shoot=true; e.preventDefault(); } if(e.code==='KeyP'){ setPaused(p=>!p);} if(!running && e.code==='Enter'){ start(); } if(gameOver && e.code==='Enter'){ restart(); } };
    const ku=(e:KeyboardEvent)=>{ if(e.code==='ArrowUp'||e.code==='KeyW'){ inputRef.current.up=false; } if(e.code==='ArrowDown'||e.code==='KeyS'){ inputRef.current.down=false; } if(e.code==='Space'){ inputRef.current.shoot=false; } };
    window.addEventListener('keydown',kd); window.addEventListener('keyup',ku); return ()=>{ window.removeEventListener('keydown',kd); window.removeEventListener('keyup',ku); };
  },[running,gameOver]);

  // Canvas Setup
  useEffect(()=>{
    const canvas=canvasRef.current; if(!canvas) return; const ctx=canvas.getContext('2d'); if(!ctx) return; const sysDpr=window.devicePixelRatio||1; const dpr=Math.max(sysDpr,FORCE_MIN_DPR); canvas.width=W*dpr; canvas.height=H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); ctx.imageSmoothingEnabled=true; (ctx as any).imageSmoothingQuality='high';
  },[]);

  const start = ()=>{ if(!blocks.length) return; setRunning(true); setPaused(false); setGameOver(false); setFinished(false); setScore(0); setLives(MAX_LIVES); wrongFlashRef.current=0; shakeRef.current=0; projectilesRef.current=[]; orbsRef.current=[]; particlesRef.current=[]; baseOrbSpeedRef.current=70; gameTimeRef.current=0; shootCooldownRef.current=0; if(!questionPoolRef.current.length) initQuestionPool(); loadQuestion(0); };
  const restart = ()=> start();

  // Initial Frage vor Spielstart anzeigen (Preview wie Vorlage)
  useEffect(()=>{ if(blocks.length){ if(!questionPoolRef.current.length) initQuestionPool(); loadQuestion(0); } },[blocks.length]);

  // Spawning
  const trySpawnEntries = ()=>{
    const entries = spawnEntriesRef.current; if(!entries.length) return; const q = blocks[currentQuestionIndexRef.current]; const lines = (q.answers || (q as any).options || []).length || 4; const spacing = H / (lines + 1);
    entries.forEach(entry=>{
      const hasOrb = orbsRef.current.some(o=> o.spawnEntry === entry);
      if(!hasOrb && gameTimeRef.current >= entry.nextSpawn){
        const y = spacing*(entry.laneIndex+1) + (Math.random()*30 - 15);
        const orb:Orb = { x: W + 40 + Math.random()*80, y, r:22, color:entry.color, correct:entry.correct, speed: baseOrbSpeedRef.current + Math.random()*30, spawnEntry:entry };
        orbsRef.current.push(orb);
      }
    });
  };

  const shoot = ()=>{ projectilesRef.current.push({ x: shipRef.current.x + shipRef.current.r + 4, y: shipRef.current.y, vx: 520, r:6 }); };

  const spawnParticles = (x:number,y:number,opts:{count?:number;spread?:number;speedMin?:number;speedMax?:number;color?:string;life?:number;size?:number}={})=>{
    const {count=14,spread=Math.PI*2,speedMin=60,speedMax=260,color='#fff',life=0.6,size=5}=opts;
    for(let i=0;i<count;i++){
      const ang = Math.random()*spread; const spd = speedMin + Math.random()*(speedMax-speedMin);
      particlesRef.current.push({ x,y,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,life,maxLife:life,color,size:size*(0.6+Math.random()*0.5) });
    }
  };

  const endGame = ()=>{ setGameOver(true); };

  const circleIntersect = (a:{x:number;y:number;r:number}, b:{x:number;y:number;r:number})=>{ const dx=a.x-b.x; const dy=a.y-b.y; const rr=a.r+b.r; return dx*dx+dy*dy <= rr*rr; };

  // Loop
  useEffect(()=>{
    const canvas=canvasRef.current; if(!canvas) return; const ctx=canvas.getContext('2d'); if(!ctx) return;
    let frame:number;
    const update=(dt:number)=>{
      if(!running || paused || gameOver){ return; }
      gameTimeRef.current += dt;
      const ship = shipRef.current;
      // Movement
      if(inputRef.current.up) ship.y -= ship.speed*dt;
      if(inputRef.current.down) ship.y += ship.speed*dt;
      ship.y = Math.max(ship.r, Math.min(H-ship.r, ship.y));
      // Shooting
      if(shootCooldownRef.current>0) shootCooldownRef.current -= dt;
      if(inputRef.current.shoot && shootCooldownRef.current<=0){ shoot(); shootCooldownRef.current=0.25; }
      // Spawn
      trySpawnEntries();
      // Move orbs
      orbsRef.current.forEach(o=>{ o.x -= o.speed*dt; });
      orbsRef.current.forEach(o=>{ if(o.x + o.r <= 0){ if(spawnEntriesRef.current.includes(o.spawnEntry)){ o.spawnEntry.nextSpawn = gameTimeRef.current + 1; } o._remove=true; } });
      orbsRef.current = orbsRef.current.filter(o=>!o._remove);
      // Move projectiles
      projectilesRef.current.forEach(p=> p.x += p.vx*dt);
      projectilesRef.current = projectilesRef.current.filter(p=> p.x - p.r < W);
      // Particles
      particlesRef.current.forEach(pt=>{ pt.x += pt.vx*dt; pt.y += pt.vy*dt; pt.life-=dt; pt.vx *= (1-1.5*dt); pt.vy *= (1-1.5*dt); pt.vy += 40*dt*0.3; });
      particlesRef.current = particlesRef.current.filter(p=> p.life>0);
      // Collisions projectile-orb
      projectilesRef.current.forEach(p=>{
        orbsRef.current.forEach(o=>{
          if(circleIntersect(p,o)){
            p._hit=true; o._hit=true;
            if(o.correct){
              setScore(s=>{ const ns=s+1; if(ns>=targetScore) setFinished(true); return ns; });
              decreaseWeight(currentQuestionIndexRef.current,0.6);
              spawnParticles(o.x,o.y,{color:'#4ade80',count:18,speedMin:90,speedMax:320,life:0.7,size:6});
              // Andere Orbs entfernen
              orbsRef.current.forEach(rem=>{ if(rem!==o){ if(spawnEntriesRef.current.includes(rem.spawnEntry)) rem.spawnEntry.nextSpawn = 0; rem._hit=true; } });
              const nextIdx = pickNextQuestionIndex(); loadQuestion(nextIdx);
              wrongFlashRef.current = 0; // kein roter Flash
            } else {
              setScore(s=> Math.max(0,s-1));
              setLives(l=>{ const nl=Math.max(0,l-1); if(nl<=0) endGame(); return nl; });
              increaseWeight(currentQuestionIndexRef.current,4);
              spawnParticles(o.x,o.y,{color:'#ff4444',count:12,speedMin:70,speedMax:250,life:0.55,size:5});
              wrongFlashRef.current = 1; shakeRef.current=0.4;
            }
          }
        });
      });
      projectilesRef.current = projectilesRef.current.filter(p=>!p._hit);
      orbsRef.current.forEach(o=>{ if(o._hit){ if(spawnEntriesRef.current.includes(o.spawnEntry)){ o.spawnEntry.nextSpawn = gameTimeRef.current + 1; } } });
      orbsRef.current = orbsRef.current.filter(o=>!o._hit);
      // Collisions ship-orb
      orbsRef.current.forEach(o=>{
        if(circleIntersect(ship,o)){
          if(!o.correct){
            setScore(s=> Math.max(0,s-1));
            setLives(l=>{ const nl=Math.max(0,l-1); if(nl<=0) endGame(); return nl; });
            spawnParticles(o.x,o.y,{color:'#ff4444',count:16,speedMin:60,speedMax:260,life:0.6,size:6});
            if(spawnEntriesRef.current.includes(o.spawnEntry)) o.spawnEntry.nextSpawn = gameTimeRef.current + 1;
            o._remove=true; wrongFlashRef.current=1; shakeRef.current=0.4;
          }
        }
      });
      orbsRef.current = orbsRef.current.filter(o=>!o._remove);
      // Decay flash & shake
      if(wrongFlashRef.current>0) wrongFlashRef.current = Math.max(0, wrongFlashRef.current - dt*2.5);
      if(shakeRef.current>0) shakeRef.current = Math.max(0, shakeRef.current - dt*2.5);
    };
    const render=()=>{
      const ctx=canvas.getContext('2d'); if(!ctx) return; ctx.clearRect(0,0,W,H);
      // Shake transform
      ctx.save();
      if(shakeRef.current>0){ const mag = 12*shakeRef.current; ctx.translate((Math.random()-0.5)*mag,(Math.random()-0.5)*mag); }
      drawBackground(ctx);
  drawShip(ctx);
      drawProjectiles(ctx);
      drawOrbs(ctx);
      drawParticles(ctx);
      drawQuestionBoard(ctx); // Fragen & Antworten ins Canvas zeichnen
      ctx.restore();
      if(wrongFlashRef.current>0){ ctx.fillStyle = `rgba(255,0,0,${0.35*wrongFlashRef.current})`; ctx.fillRect(0,0,W,H); }
      if(paused && !gameOver){ ctx.fillStyle='rgba(0,0,0,0.45)'; ctx.fillRect(0,0,W,H); ctx.fillStyle='#fff'; ctx.font='48px system-ui'; ctx.textAlign='center'; ctx.fillText('PAUSE', W/2, H/2); }
      if(gameOver){ ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(0,0,W,H); ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.font='46px system-ui'; ctx.fillText('Game Over', W/2, H/2 - 20); ctx.font='24px system-ui'; ctx.fillText('Punkte: '+score, W/2, H/2 + 20); }
    };
    const loop=(ts:number)=>{ const last=lastTimeRef.current||ts; const dt=Math.min(0.033,(ts-last)/1000); lastTimeRef.current=ts; lastFrameDtRef.current=dt; update(dt); render(); frame=requestAnimationFrame(loop); };
    frame = requestAnimationFrame(loop); return ()=> cancelAnimationFrame(frame);
  },[running,paused,gameOver,targetScore,questionText,currentAnswers,score,lives]);

  // Background simple star field
  const drawBackground = (ctx:CanvasRenderingContext2D)=>{ ctx.fillStyle='#030712'; ctx.fillRect(0,0,W,H); ctx.fillStyle='#ffffff22'; for(let i=0;i<60;i++){ const x=(i*53 % W); const y=(i*97 % H); ctx.fillRect(x,y,2,2);} };
  const drawShip = (ctx:CanvasRenderingContext2D)=>{ const ship=shipRef.current; ctx.save(); ctx.translate(ship.x, ship.y); ctx.fillStyle='#cbd5e1'; ctx.beginPath(); ctx.moveTo(-ship.r*0.8, -ship.r*0.6); ctx.lineTo(-ship.r*0.8, ship.r*0.6); ctx.lineTo(ship.r,0); ctx.closePath(); ctx.fill(); ctx.restore(); };
  const drawProjectiles = (ctx:CanvasRenderingContext2D)=>{ ctx.fillStyle='#fff'; projectilesRef.current.forEach(p=>{ ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill(); }); };
  const drawOrbs = (ctx:CanvasRenderingContext2D)=>{ orbsRef.current.forEach(o=>{ ctx.beginPath(); let col=colorHex[o.color]||'#888'; if(o.color==='black') col='#555'; ctx.fillStyle=col; ctx.arc(o.x,o.y,o.r,0,Math.PI*2); ctx.fill(); }); };
  const drawParticles = (ctx:CanvasRenderingContext2D)=>{ particlesRef.current.forEach(pt=>{ const alpha=Math.max(pt.life/pt.maxLife,0); ctx.globalAlpha=alpha; ctx.fillStyle=pt.color; ctx.beginPath(); ctx.arc(pt.x,pt.y,pt.size*alpha,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1; }); };
  // Fragen- und Antworten-Board direkt im Canvas
  const drawQuestionBoard = (ctx:CanvasRenderingContext2D)=>{
    if(!questionText || !currentAnswers.length) return;
    // Dynamische Skalierung für Fullscreen
    const fs = isFullscreen;
    const panelMarginX = fs? 12 : 10;
    const panelY = fs? 8 : 4;
    const maxPanelW = W - panelMarginX*2;
    const panelPaddingX = fs? 20 : 12;
    const panelPaddingTop = fs? 14 : 6;
    const panelPaddingBottom = fs? 14 : 8;
    const answerGap = fs? 14 : 8;
    const answerHeight = fs? 78 : 46; // größer im Fullscreen
    const questionFont = fs? '600 32px system-ui' : '600 18px system-ui';
    const answerFont = fs? '600 22px system-ui' : '600 14px system-ui';
    ctx.save();
    ctx.textBaseline='top';
    ctx.font = questionFont;
    // Frage umbrechen
    const words = questionText.split(/\s+/);
    let lines:string[]=[]; let line=''; const maxQWidth = maxPanelW - panelPaddingX*2;
    words.forEach(w=>{ const test=line? line+' '+w : w; if(ctx.measureText(test).width > maxQWidth){ if(line) lines.push(line); line=w; } else { line=test; } });
    if(line) lines.push(line);
  const maxQuestionLines = fs? 3 : 2; // im Fullscreen bis zu 3 Zeilen
    if(lines.length>maxQuestionLines){
      let cut = lines.slice(0,maxQuestionLines);
      // letzte Zeile kürzen + … falls nötig
      let last = cut[cut.length-1];
      while(ctx.measureText(last+'…').width > maxQWidth && last.length>2){ last = last.slice(0,last.length-2); }
      cut[cut.length-1] = last + '…';
      lines = cut;
    }
  const lineHeight = fs? 40 : 22; const questionHeight = lines.length*lineHeight;
    // Antwort-Boxberechnung
    const answers = currentAnswers; const count = answers.length;
    const innerAvailableW = maxPanelW - panelPaddingX*2 - answerGap*(count-1);
    const boxWidth = Math.max(120, Math.floor(innerAvailableW / count));
    // Panelhöhe
    const panelHeight = panelPaddingTop + questionHeight + 10 + answerHeight + panelPaddingBottom;
    // Hintergrund Panel
    const panelX = panelMarginX; const panelW = maxPanelW; const r=14; const panelH = panelHeight;
  ctx.globalAlpha = fs? 0.72 : 0.6; // etwas kräftiger im Fullscreen
    ctx.beginPath();
    ctx.moveTo(panelX+r,panelY);
    ctx.lineTo(panelX+panelW-r,panelY); ctx.quadraticCurveTo(panelX+panelW,panelY,panelX+panelW,panelY+r);
    ctx.lineTo(panelX+panelW,panelY+panelH-r); ctx.quadraticCurveTo(panelX+panelW,panelY+panelH,panelX+panelW-r,panelY+panelH);
    ctx.lineTo(panelX+r,panelY+panelH); ctx.quadraticCurveTo(panelX,panelY+panelH,panelX,panelY+panelH-r);
    ctx.lineTo(panelX,panelY+r); ctx.quadraticCurveTo(panelX,panelY,panelX+r,panelY);
    ctx.fillStyle='rgba(16,24,38,0.92)'; ctx.fill();
    ctx.globalAlpha=1; ctx.strokeStyle='rgba(60,90,120,0.9)'; ctx.lineWidth=2; ctx.stroke();
    // Frage zeichnen
    ctx.fillStyle='#fff'; ctx.textAlign='left';
    lines.forEach((l,i)=> ctx.fillText(l, panelX+panelPaddingX, panelY+panelPaddingTop + i*lineHeight));
    // Status (Score/Lives) oben rechts
  ctx.font= fs? '600 30px system-ui' : '600 14px system-ui';
  const statusText = fs? `Punkte: ${score}   Leben: ${lives}` : `Punkte: ${score}   Leben: ${lives}`;
  ctx.fillText(statusText, panelX + panelW - panelPaddingX - ctx.measureText(statusText).width, panelY + (fs? 4 : 6));
    // Antworten
    ctx.font = answerFont; ctx.textBaseline='middle'; ctx.textAlign='center';
  const answerBaseY = panelY + panelPaddingTop + questionHeight + (fs? 18 : 14);
    answers.forEach((a,i)=>{
      const bx = panelX + panelPaddingX + i*(boxWidth + answerGap);
      const by = answerBaseY;
      // Box
      const colMap:Record<string,string>={red:'#e53935',blue:'#1e88e5',green:'#43a047',yellow:'#fdd835'}; let bg = colMap[a.color]||'#555';
      const fg = a.color==='yellow'? '#212':'#fff';
  const w = boxWidth; const h = answerHeight; const br= fs? 14 : 8;
      ctx.beginPath();
      ctx.moveTo(bx+br,by);
      ctx.lineTo(bx+w-br,by); ctx.quadraticCurveTo(bx+w,by,bx+w,by+br);
      ctx.lineTo(bx+w,by+h-br); ctx.quadraticCurveTo(bx+w,by+h,bx+w-br,by+h);
      ctx.lineTo(bx+br,by+h); ctx.quadraticCurveTo(bx,by+h,bx,by+h-br);
      ctx.lineTo(bx,by+br); ctx.quadraticCurveTo(bx,by,bx+br,by);
      ctx.fillStyle=bg; ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,0.35)'; ctx.lineWidth=1; ctx.stroke();
      // Text umbrechen (max 3 Zeilen)
  ctx.fillStyle=fg; const maxTextWidth = w - (fs? 28 : 14); const wordsA = a.text.split(/\s+/); let linesA:string[]=[]; let lA='';
      wordsA.forEach(wd=>{ const test=lA? lA+' '+wd: wd; if(ctx.measureText(test).width>maxTextWidth){ if(lA) linesA.push(lA); lA=wd; } else { lA=test; } });
      if(lA) linesA.push(lA);
  const maxLines = fs? 3 : 2; if(linesA.length>maxLines){ const trimmed = linesA.slice(0,maxLines); let lastLine = trimmed[maxLines-1]; while(ctx.measureText(lastLine+'…').width>maxTextWidth && lastLine.length>2){ lastLine=lastLine.slice(0,lastLine.length-2); } trimmed[maxLines-1]=lastLine+'…'; linesA=trimmed; }
  const lh = fs? 28 : 16; const totalH = linesA.length*lh; let ty = by + (h-totalH)/2 + lh/2 -1; linesA.forEach(tl=>{ ctx.fillText(tl, bx + w/2, ty); ty += lh; });
    });
    ctx.restore();
  };

  // Abschluss (analog andere Spiele)
  useEffect(()=>{ if(!finished && score >= targetScore){ setFinished(true); if(!completedLessons.includes(lesson._id)){ (async()=>{ try{ if(!session?.user?.username) return; setMarking(true); await finalizeLesson({ username: session.user.username, lessonId: lesson._id, courseId, type: lesson.type, earnedStar: lesson.type !== 'markdown' }); setCompletedLessons(prev=> prev.includes(lesson._id)? prev: [...prev, lesson._id]); } finally { setMarking(false);} })(); } } },[score,targetScore,finished,completedLessons,lesson._id,lesson.type,courseId,session?.user?.username,setCompletedLessons]);

  // Fullscreen Größe
  useEffect(()=>{ function apply(){ const canvas=canvasRef.current; if(!canvas) return; if(isFullscreen){ const vw=window.innerWidth; const vh=window.innerHeight; const ratio=W/H; let w=vw; let h=w/ratio; if(h>vh){ h=vh; w=h*ratio; } canvas.style.width=w+'px'; canvas.style.height=h+'px'; } else { canvas.style.width='100%'; canvas.style.height=(100*(H/W))+'%'; } } apply(); if(isFullscreen){ window.addEventListener('resize',apply); return ()=> window.removeEventListener('resize',apply);} },[isFullscreen]);

  const contentScaleRaw = Number((lesson as any)?.content?.spaceScale);
  const DISPLAY_SCALE = (!isNaN(contentScaleRaw) && contentScaleRaw>0.15 && contentScaleRaw<=1) ? contentScaleRaw : 0.8;

  return (
    <div ref={wrapperRef} className={isFullscreen? 'w-screen h-screen flex flex-col items-center bg-[#05070d] overflow-hidden':'w-full flex flex-col items-center gap-2 bg-transparent'}>
      <div className="relative w-full" style={!isFullscreen? {maxWidth: Math.round(W*DISPLAY_SCALE)}: {flex:1, display:'flex', alignItems:'center', justifyContent:'center'}}>
        <canvas ref={canvasRef} width={W} height={H} className={isFullscreen? 'block mx-auto rounded border-2 border-[#2c3e50] bg-black':'block mx-auto rounded border-2 border-[#2c3e50] shadow bg-black'} style={!isFullscreen? {width:'100%', aspectRatio:`${W}/${H}`} : {maxWidth:'100%', maxHeight:'100%'}} />
        {/* Start */}
        {!running && !gameOver && !finished && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white gap-4 p-4 text-center">
            <h2 className="text-2xl font-bold">🛸 Space Impact</h2>
            <p className="text-xs max-w-xs">Steuere mit ↑ / ↓. Leertaste schießt. Triff die richtige Antwort-Kugel.</p>
            <button onClick={start} className="px-6 py-2 rounded bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold">Start (Enter)</button>
            <p className="text-[10px] opacity-70">Ziel: {targetScore} Punkte</p>
            <div className="flex gap-3 text-[10px] opacity-80"> 
              <button onClick={()=> setPaused(p=>!p)} className={`px-2 py-1 rounded border text-[0.6rem] tracking-wide ${paused? 'bg-lime-400 text-[#102] border-lime-500':'bg-[#2d3d55] text-white border-[#456282] hover:bg-[#38506e]'}`}>{paused? 'Weiter':'Pause'}</button>
              <button onClick={toggleFullscreen} className="px-2 py-1 rounded border text-[0.6rem] tracking-wide bg-[#2d3d55] text-white border-[#456282] hover:bg-[#38506e]">{isFullscreen? 'Zurück':'Vollbild'}</button>
            </div>
          </div>
        )}
        {paused && !gameOver && !finished && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-white text-4xl font-bold">PAUSE</div>
        )}
        {gameOver && !finished && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white gap-3 p-4 text-center">
            <div className="text-red-400 font-bold text-3xl">Game Over</div>
            <div className="text-sm">Punkte: {score}</div>
            <button onClick={restart} className="px-5 py-2 rounded bg-red-500 hover:bg-red-600 text-white text-sm font-semibold">Neu starten</button>
          </div>
        )}
        {finished && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white gap-3 p-4 text-center">
            <div className="text-green-400 font-bold text-3xl">✔ Ziel erreicht</div>
            <div className="text-sm">Punkte: {score}</div>
            <button onClick={restart} className="px-5 py-2 rounded bg-green-500 hover:bg-green-600 text-white text-sm font-semibold">Nochmal</button>
          </div>
        )}
        {marking && (
          <div className="absolute bottom-2 left-2 text-[11px] px-2 py-1 rounded bg-white/70 text-gray-700">Speichere Abschluss…</div>
        )}
      </div>
  <div className="text-[0.7rem] opacity-70 text-center text-white mt-1">Pfeile / W-S: bewegen • Space: schießen • P / Pause: Pause • Richtige Farbe treffen!</div>
    </div>
  );
}
