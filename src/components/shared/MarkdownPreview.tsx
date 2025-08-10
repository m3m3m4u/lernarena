"use client";
import { useState, useEffect, ComponentType } from 'react';

export default function MarkdownPreview({ markdown }: { markdown: string }) {
  const [MD, setMD] = useState<ComponentType<any> | null>(null);
  const [gfm, setGfm] = useState<any>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const m = await import('react-markdown');
      const g = await import('remark-gfm');
      if (mounted) {
        setMD(() => m.default as any);
        setGfm(() => (g as any).default ?? g);
      }
    })();
    return () => { mounted = false; };
  }, []);
  if (!MD) return <div className="text-gray-400">Lade Vorschau…</div>;
  const Comp = MD; return <Comp remarkPlugins={gfm ? [gfm] : []}>{markdown}</Comp>;
}
