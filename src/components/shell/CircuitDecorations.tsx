import React from 'react';

const IC: React.FC<{ style: React.CSSProperties }> = ({ style }) => (
  <div className="absolute pointer-events-none z-[3]" style={style}>
    <div className="w-[52px] h-[30px] rounded-[3px] border-[1.5px] relative"
      style={{ background: 'linear-gradient(135deg,var(--theme-chip-1),var(--theme-chip-2))', borderColor: 'var(--theme-chip-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div className="absolute left-[6px] right-[6px] -top-[4px] h-[3px]"
        style={{ background: 'repeating-linear-gradient(90deg,var(--theme-chip-border) 0,var(--theme-chip-border) 3px,transparent 3px,transparent 7px)' }} />
      <div className="absolute left-[6px] right-[6px] -bottom-[4px] h-[3px]"
        style={{ background: 'repeating-linear-gradient(90deg,var(--theme-chip-border) 0,var(--theme-chip-border) 3px,transparent 3px,transparent 7px)' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[18px] h-[12px] rounded-[2px] border"
        style={{ background: 'linear-gradient(135deg,var(--theme-die-1),var(--theme-die-2))', borderColor: 'var(--theme-chip-border)' }} />
    </div>
  </div>
);

const LED: React.FC<{ color: string; glow: string; style: React.CSSProperties; delay?: string }> = ({ color, glow, style, delay }) => (
  <div className="absolute pointer-events-none z-[3]" style={style}>
    <div className="w-[7px] h-[10px] border border-black/5 animate-led-flicker"
      style={{ borderRadius: '50% 50% 30% 30%', background: color, boxShadow: `0 0 5px ${glow}`, animationDelay: delay || '0s' }} />
  </div>
);

const Cap: React.FC<{ style: React.CSSProperties }> = ({ style }) => (
  <div className="absolute pointer-events-none z-[3]" style={style}>
    <div className="w-[12px] h-[20px] rounded-t-[3px] border"
      style={{ background: 'linear-gradient(180deg,var(--theme-die-1),var(--theme-die-2),var(--theme-chip-border))', borderColor: 'var(--theme-chip-border)' }} />
  </div>
);

const Resistor: React.FC<{ style: React.CSSProperties }> = ({ style }) => (
  <div className="absolute pointer-events-none z-[3]" style={style}>
    <div className="w-[26px] h-[8px] rounded-[3px] border relative"
      style={{ background: '#d0c4a8', borderColor: '#c0b498' }}>
      {[['4px','#d85050'],['8px','#e8b840'],['12px','#d87020'],['18px','#b0b0b0']].map(([l,c],i)=>(
        <div key={i} className="absolute w-[2.5px] top-0 bottom-0 rounded-[1px]" style={{ left: l, background: c }} />
      ))}
    </div>
  </div>
);

const CircuitDecorations: React.FC = () => (
  <div className="absolute inset-0 pointer-events-none z-[3] overflow-hidden">
    <IC style={{ top: '3%', left: '4%' }} />
    <IC style={{ top: '4%', right: '10%' }} />
    <IC style={{ bottom: '3%', left: '6%' }} />
    <IC style={{ top: '42%', right: '2%' }} />
    <Cap style={{ top: '4%', left: '20%' }} />
    <Cap style={{ top: '4%', left: '22.5%' }} />
    <Cap style={{ top: '18%', left: '2%' }} />
    <Resistor style={{ top: '6%', left: '36%' }} />
    <Resistor style={{ bottom: '4%', right: '16%' }} />
    <LED color="radial-gradient(circle at 40% 35%,#a0e0f8,#4898c8)" glow="rgba(72,152,200,0.3)" style={{ top:'3%', right:'26%' }} />
    <LED color="radial-gradient(circle at 40% 35%,#88e0a8,#38a858)" glow="rgba(56,168,88,0.3)" style={{ top:'36%', left:'2%' }} delay="0.6s" />
    <LED color="radial-gradient(circle at 40% 35%,#f0d868,#c89828)" glow="rgba(200,152,40,0.2)" style={{ top:'20%', right:'2%' }} delay="1.2s" />
    <LED color="radial-gradient(circle at 40% 35%,#f09088,#c84040)" glow="rgba(200,64,64,0.2)" style={{ bottom:'3%', left:'28%' }} delay="1.8s" />
    <LED color="radial-gradient(circle at 40% 35%,#a0e0f8,#4898c8)" glow="rgba(72,152,200,0.3)" style={{ bottom:'3%', right:'5%' }} delay="0.3s" />
    <LED color="radial-gradient(circle at 40% 35%,#f0d868,#c89828)" glow="rgba(200,152,40,0.2)" style={{ top:'76%', left:'2%' }} delay="2.1s" />
  </div>
);

export default CircuitDecorations;
