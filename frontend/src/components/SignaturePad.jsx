import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Eraser } from 'lucide-react';

/**
 * Reusable signature pad — captures finger/stylus signature on a canvas, exports as base64 PNG.
 * Touch + mouse + pointer events. White background by default; pass `dark` for inverted.
 */
export function SignaturePad({ onChange, height = 'h-44 sm:h-56', testId = 'signature-canvas', placeholder = 'Sign with your finger or stylus' }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const [empty, setEmpty] = useState(true);

  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0b1120';
    ctx.lineWidth = 2.4;
  }, []);

  useEffect(() => {
    sizeCanvas();
    const onResize = () => sizeCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [sizeCanvas]);

  const point = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches?.[0]?.clientX ?? e.clientX) - rect.left;
    const y = (e.touches?.[0]?.clientY ?? e.clientY) - rect.top;
    return { x, y };
  };

  const start = (e) => { e.preventDefault(); drawing.current = true; last.current = point(e); };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (empty) setEmpty(false);
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const data = canvasRef.current.toDataURL('image/png');
    onChange?.(data);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
    onChange?.('');
  };

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        data-testid={testId}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        className={`w-full ${height} bg-white rounded-md cursor-crosshair touch-none`}
        style={{ touchAction: 'none' }}
      />
      {empty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-400 text-sm">{placeholder}</div>
      )}
      <div className="absolute bottom-2 right-2">
        <button type="button" data-testid={`${testId}-clear`} onClick={clear} className="text-xs px-2 py-1 rounded bg-white/90 border border-slate-200 text-slate-600 hover:bg-white transition flex items-center gap-1">
          <Eraser className="w-3 h-3" /> Clear
        </button>
      </div>
    </div>
  );
}

export default SignaturePad;
