import { useState, useEffect } from 'react';

interface SweepLoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}

export default function SweepLoadingSpinner({ size = 'md', message }: SweepLoadingSpinnerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const circleSizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-32 h-32',
    lg: 'w-48 h-48',
  };

  const imageSizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-16 h-16',
    lg: 'w-24 h-24',
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="relative flex items-center justify-center">
        {/* Spinning circle */}
        <div
          className={`${circleSizeClasses[size]} border-4 border-transparent border-t-purple-500 border-r-blue-500 rounded-full animate-spin`}
          style={{
            animation: 'spin 1s linear infinite',
          }}
        />
        {/* Favicon in center - only render when mounted to avoid SSR issues */}
        {mounted && (
          <div className="absolute inset-0 flex items-center justify-center">
            <img
              src="/SWEEP_favicon.png"
              alt="Sweep"
              className={`${imageSizeClasses[size]} object-contain`}
              onError={(e) => {
                // Fallback if image fails to load
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}
      </div>
      {message && (
        <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">{message}</p>
      )}
    </div>
  );
}

