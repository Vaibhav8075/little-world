import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../common/Avatar';

/** First screen on a new device: pick who you are, then enter your PIN. */
export const WhoIsHere: React.FC = () => {
  const { settings, partner1, partner2, openPinModalForSwitch } = useAuth();

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 py-12 text-center animate-enter">
      <p className="text-sm text-ink-3">{settings.appTitle || 'Our Little World'}</p>
      <h1 className="mt-2 font-serif text-4xl sm:text-5xl tracking-[-0.02em]">Who’s here?</h1>

      <div className="mt-10 flex gap-6 sm:gap-10">
        {[partner1, partner2].map(
          (p) =>
            p && (
              <button
                key={p.id}
                type="button"
                onClick={() => openPinModalForSwitch(p.id)}
                className="group flex flex-col items-center gap-3 rounded-2xl p-3 focus-visible:outline-offset-4"
              >
                <span className="rounded-full ring-0 group-hover:ring-4 ring-line transition-shadow">
                  <Avatar user={p} size={96} />
                </span>
                <span className="font-serif text-xl">{p.name}</span>
              </button>
            )
        )}
      </div>

      <p className="mt-10 max-w-xs text-sm text-ink-3">You’ll enter your PIN next. This device remembers you after that.</p>
    </div>
  );
};
