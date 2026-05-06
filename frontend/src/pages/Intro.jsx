import React from 'react';
import { motion } from 'framer-motion';
import { Logo } from '@/components/Logo';

// 3-second branded TikTok opener — Mike screen-records this as a clip he can splice
// to the beginning of any TikTok he posts. Pure brand identity.
export default function Intro() {
  return (
    <div className="bg-black min-h-screen flex items-center justify-center overflow-hidden">
      <div className="relative bg-[#07090d] overflow-hidden"
           style={{ width: 'min(100vw, 56.25vh)', height: 'min(177.78vw, 100vh)', maxWidth: '450px', maxHeight: '800px' }}
           data-testid="intro-frame">
        {/* Sweep flare */}
        <motion.div
          initial={{ x: '-120%', opacity: 0 }}
          animate={{ x: '120%', opacity: [0, 1, 0] }}
          transition={{ duration: 1.2, ease: [0.2, 0.8, 0.2, 1] }}
          className="absolute inset-y-0 -inset-x-full w-[200%] pointer-events-none"
          style={{ background: 'linear-gradient(115deg, transparent 38%, rgba(251,191,36,.18) 50%, transparent 62%)' }}
        />

        {/* Shield mark */}
        <motion.div
          initial={{ scale: 0.4, opacity: 0, rotate: -8 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
        >
          <div className="relative">
            <motion.div
              animate={{ scale: [1, 1.18, 1], opacity: [0.6, 0.2, 0.6] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute inset-0 rounded-3xl bg-amber-500/40 blur-2xl scale-125"
            />
            <div className="relative">
              <Logo size={140} withWordmark={false} />
            </div>
          </div>
        </motion.div>

        {/* Wordmark — appears after the shield settles */}
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
          className="absolute left-0 right-0 z-10 text-center"
          style={{ top: 'calc(50% + 100px)' }}
        >
          <div className="text-5xl font-extrabold tracking-tight leading-none">
            <span className="text-white">Road</span><span className="text-amber-300">Boss</span>
          </div>
          <div className="mt-2 text-[11px] uppercase tracking-[0.4em] text-amber-400/70 font-semibold">
            Wreckerlogix
          </div>
        </motion.div>

        {/* Bottom watermark */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 0.5 }}
          className="absolute bottom-7 left-0 right-0 text-center text-[9px] uppercase tracking-widest text-white/40 font-semibold"
        >
          Built by truckers · For truckers
        </motion.div>
      </div>
    </div>
  );
}
