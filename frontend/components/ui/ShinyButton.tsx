import React from 'react';

interface ShinyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export default function ShinyButton({ children, className = '', ...props }: ShinyButtonProps) {
  return (
    <button className={`shiny-cta focus:outline-none ${className}`} {...props}>
      <span>{children}</span>
    </button>
  );
}

