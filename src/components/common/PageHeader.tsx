import React from 'react';

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, actions }) => (
  <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 mb-6 sm:mb-8">
    <div className="min-w-0">
      <h1 className="font-serif text-[2rem] sm:text-[2.5rem] leading-[1.1] tracking-[-0.01em]">{title}</h1>
      {description && <p className="mt-2 text-ink-2">{description}</p>}
    </div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </header>
);
