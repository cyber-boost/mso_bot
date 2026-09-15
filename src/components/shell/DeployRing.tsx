import React from 'react';
import { BotConfig, THEME } from "@/lib/shell";

interface DeployRingProps {
  bots: BotConfig[];
  usedSlots: Set<number>;
  isOpen: boolean;
  onDeploy: (index: number) => void;
  onToggle: () => void;
  isFull: boolean;
}

const DeployRing: React.FC<DeployRingProps> = ({ bots, usedSlots, isOpen, onDeploy, onToggle, isFull }) => {
  const radius = 120;
  const ol = THEME.outline;

  return (
    <>
      {/* Orbital ring */}
      <div className="absolute z-30 top-1/2 left-1/2 pointer-events-none transition-all duration-500"
        style={{ width:300, height:300, transform: `translate(-50%,-50%) ${isOpen ? 'scale(1)' : 'scale(0.5)'}`, opacity: isOpen ? 1 : 0 }}>
        <div className="absolute inset-0 rounded-full animate-spin"
          style={{ border: '1.5px dashed rgba(58,138,208,0.12)', animationDuration: '50s' }} />
        <div className="absolute rounded-full"
          style={{ inset: 22, border: '1px dashed rgba(58,138,208,0.06)', animation: 'spin 35s linear infinite reverse' }} />

        {bots.map((bot, i) => {
          const a = (i / bots.length) * Math.PI * 2 - Math.PI / 2;
          const x = Math.cos(a) * radius, y = Math.sin(a) * radius;
          const used = usedSlots.has(i);
          return (
            <button key={bot.id} disabled={used || !isOpen} onClick={() => onDeploy(i)}
              className="absolute w-[52px] h-[52px] rounded-full flex items-center justify-center transition-all group hover:scale-110 active:scale-95"
              style={{
                left: `calc(50% + ${x}px - 26px)`, top: `calc(50% + ${y}px - 26px)`,
                pointerEvents: isOpen && !used ? 'all' : 'none',
                background: 'rgba(255,255,255,0.8)', border: `2px solid ${used ? '#ccc' : THEME.chipBorder}`,
                backdropFilter: 'blur(4px)', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', opacity: used ? 0.25 : 1,
              }}>
              <svg viewBox="0 0 40 44" className="w-[30px] h-[34px]">
                <ellipse cx="20" cy="14" rx="11" ry="9" fill={bot.head} stroke={ol} strokeWidth="2" />
                <rect x="10" y="11" width="20" height="7" rx="3" fill={ol} />
                <ellipse cx="16" cy="14.5" rx="3" ry="2" fill={THEME.eye} />
                <ellipse cx="24" cy="14.5" rx="3" ry="2" fill={THEME.eye} />
                <path d="M12 26H28Q32 26 32 30V36Q32 40 28 40H12Q8 40 8 36V30Q8 26 12 26Z"
                  fill={bot.body} stroke={ol} strokeWidth="2" />
              </svg>
              <span className="absolute -bottom-[14px] left-1/2 -translate-x-1/2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ fontFamily:"'Orbitron',sans-serif", fontSize:'5px', fontWeight:700, color:THEME.glow, letterSpacing:'1.5px' }}>
                {bot.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Center toggle */}
      <button onClick={onToggle}
        className="absolute z-[32] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center transition-all hover:border-[#3a8ad0]"
        style={{
          fontFamily:"'Orbitron',sans-serif", fontSize:'8px', fontWeight:700, color:THEME.glow, letterSpacing:'3px',
          padding:'8px 14px', borderRadius:20, background:'rgba(255,255,255,0.7)',
          border:'1.5px solid rgba(58,138,208,0.2)', backdropFilter:'blur(6px)',
        }}>
        {isFull ? 'FULL' : 'DEPLOY'}
        <span className="block" style={{ fontSize:'5.5px', letterSpacing:'2px', color:'rgba(58,138,208,0.35)', marginTop:2 }}>
          {isFull ? 'all deployed' : isOpen ? 'select unit' : 'tap to open'}
        </span>
      </button>
    </>
  );
};

export default DeployRing;
