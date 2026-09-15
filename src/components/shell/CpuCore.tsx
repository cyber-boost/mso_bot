import React from 'react';
import { THEME } from "@/lib/shell";

const CpuCore: React.FC = () => (
  <div className="absolute z-[14] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[100px] h-[100px]">
    <div className="absolute inset-0 rounded-lg"
      style={{ border: `2px solid ${THEME.chipBorder}`, background: 'linear-gradient(145deg,var(--theme-chip-1),var(--theme-chip-2))',
        boxShadow: `0 0 25px ${THEME.glowSoft}, 0 2px 8px rgba(0,0,0,0.04)` }}>
      {/* Pins */}
      {['top','bottom'].map(s=>(
        <div key={s} className="absolute left-[12px] right-[12px] h-[5px]"
          style={{ [s==='top'?'top':'bottom']: '-6px',
            background: `repeating-linear-gradient(90deg,${THEME.chipBorder} 0,${THEME.chipBorder} 3px,transparent 3px,transparent 8px)` }} />
      ))}
      {['left','right'].map(s=>(
        <div key={s} className="absolute top-[12px] bottom-[12px] w-[5px]"
          style={{ [s]: '-6px',
            background: `repeating-linear-gradient(180deg,${THEME.chipBorder} 0,${THEME.chipBorder} 3px,transparent 3px,transparent 8px)` }} />
      ))}
      {/* Die */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[42px] h-[42px] rounded-[3px]"
        style={{ background: 'linear-gradient(135deg,var(--theme-die-1),var(--theme-die-2))', border: `1.5px solid ${THEME.glow}`, boxShadow: `0 0 10px ${THEME.glowSoft}` }}>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[12px] h-[12px] rounded-full animate-cpu-pulse"
          style={{ background: THEME.glow, boxShadow: `0 0 6px ${THEME.glow}, 0 0 14px rgba(58,138,208,0.2)` }} />
      </div>
      <div className="absolute bottom-[7px] left-1/2 -translate-x-1/2"
        style={{ fontFamily:"'Orbitron',sans-serif", fontSize:'6px', fontWeight:700, color:THEME.glow, letterSpacing:'2px', opacity:0.6 }}>
        NEBULA
      </div>
    </div>
  </div>
);

export default CpuCore;
