import React from 'react';

export const CodeIcon = ({ className }: { className?: string }) => {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="codeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(270, 91%, 65%)" />
          <stop offset="50%" stopColor="hsl(320, 91%, 65%)" />
          <stop offset="100%" stopColor="hsl(190, 91%, 65%)" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge> 
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Left bracket */}
      <path
        d="M24 12L14 32L24 52"
        stroke="url(#codeGradient)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#glow)"
        className="animate-pulse"
      />
      
      {/* Right bracket */}
      <path
        d="M40 12L50 32L40 52"
        stroke="url(#codeGradient)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#glow)"
        className="animate-pulse"
      />
      
  
    </svg>
  );
};