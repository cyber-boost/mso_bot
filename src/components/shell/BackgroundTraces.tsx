import React from 'react';
import { THEME } from "@/lib/shell";

const BackgroundTraces: React.FC = () => (
  <div className="absolute inset-0 pointer-events-none z-[2]">
    <svg viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
      <defs>
        <filter id="tglow">
          <feGaussianBlur stdDeviation="2" result="b"/>
          <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={THEME.glow}/>
          <feComposite in="SourceGraphic" in2="b" operator="over"/>
        </filter>
      </defs>
      {/* Static traces */}
      <g stroke={THEME.trace} strokeWidth="2" fill="none" strokeLinecap="round">
        <path d="M0,200 H340 L375,235 H650"/>
        <path d="M1920,200 H1580 L1545,235 H1270"/>
        <path d="M0,880 H320 L355,845 H620"/>
        <path d="M1920,880 H1600 L1565,845 H1300"/>
        <path d="M260,0 V300 L295,335 V540"/>
        <path d="M1660,0 V300 L1625,335 V540"/>
        <path d="M260,1080 V780 L295,745 V540"/>
        <path d="M1660,1080 V780 L1625,745 V540"/>
        <path d="M650,235 L740,310 H890 L960,380"/>
        <path d="M1270,235 L1180,310 H1030 L960,380"/>
        <path d="M620,845 L720,770 H890 L960,700"/>
        <path d="M1300,845 L1200,770 H1030 L960,700"/>
        <path d="M870,540 H1050"/>
        <path d="M960,430 V650"/>
      </g>
      {/* Animated glowing traces */}
      <g stroke={THEME.glow} strokeWidth="2" fill="none" filter="url(#tglow)" strokeDasharray="600" strokeLinecap="round">
        {[
          { d: "M0,200 H340 L375,235 H650", delay: 0 },
          { d: "M1920,200 H1580 L1545,235 H1270", delay: 1.8 },
          { d: "M0,880 H320 L355,845 H620", delay: 0.9 },
          { d: "M1920,880 H1600 L1565,845 H1300", delay: 2.4 },
          { d: "M260,0 V300 L295,335 V540", delay: 0.5 },
          { d: "M1660,0 V300 L1625,335 V540", delay: 2.1 },
          { d: "M260,1080 V780 L295,745 V540", delay: 1.3 },
          { d: "M1660,1080 V780 L1625,745 V540", delay: 2.8 },
        ].map((t, i) => (
          <path key={i} d={t.d} className="animate-trace" style={{ animationDelay: `${t.delay}s` }} />
        ))}
      </g>
      {/* Lit junction nodes */}
      <g fill={THEME.glow} filter="url(#tglow)">
        {[
          [340,200,.2],[650,235,.7],[1270,235,1.1],[1580,200,.5],
          [320,880,1.6],[620,845,2],[1300,845,1.7],[1600,880,.3],
          [960,380,.8],[960,700,1.5],
        ].map(([cx,cy,d], i) => (
          <circle key={i} cx={cx} cy={cy} r="3" className="animate-node" style={{ animationDelay: `${d}s` }} />
        ))}
      </g>
    </svg>
  </div>
);

export default BackgroundTraces;
