import React from 'react';

interface FeatureCardProps {
  title: string;
  description: string;
  children?: React.ReactNode;
  className?: string;
}

export default function FeatureCard({ title, description, children, className = '' }: FeatureCardProps) {
  return (
    <div className={`bento-card rounded-xl p-6 ${className}`}>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-foreground-light mb-4">{description}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
