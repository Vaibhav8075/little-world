import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Delete, Loader2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Avatar } from '../common/Avatar';
import { AuthService } from '../../services/authService';

const MAX_PIN = 6;

export const PinAuthModal: React.FC = () => {
  const { isPinModalOpen, pendingSwitchUserId, closePinModal } = useAuth();
  const isOpen = isPinModalOpen && Boolean(pendingSwitchUserId);
  return (
    <Modal isOpen={isOpen} onClose={closePinModal} size="sm">
      {isOpen && <PinForm key={pendingSwitchUserId} />}
    </Modal>
  );
};

const PinForm: React.FC = () => {
  const { pendingSwitchUserId, partner1, partner2, loginWithPin, currentUser } = useAuth();

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const targetUser = [partner1, partner2].find((p) => p?.id === pendingSwitchUserId) || null;

  const [isDefaultPin, setIsDefaultPin] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // A profile that never set its own PIN still has the install default; say so instead of locking them out.
  useEffect(() => {
    let live = true;
    AuthService.hasDefaultPin(targetUser).then((d) => live && setIsDefaultPin(d));
    return () => {
      live = false;
    };
  }, [targetUser]);

  const update = (value: string) => {
    setPin(value.replace(/\D/g, '').slice(0, MAX_PIN));
    setError(null);
  };

  const submit = async () => {
    if (!pendingSwitchUserId || pin.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await loginWithPin(pendingSwitchUserId, pin);
      if (!res.success) {
        setError('That PIN didn’t match. Try again.');
        setPin('');
      }
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setIsSubmitting(false);
      inputRef.current?.focus();
    }
  };

  const dots = Math.max(4, pin.length);

  return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="pt-6 text-center"
      >
        <div className="flex justify-center">
          <Avatar user={targetUser} size={56} />
        </div>
        <h2 className="mt-3 font-serif text-2xl">{currentUser ? `Switch to ${targetUser?.name}` : `Hi, ${targetUser?.name}`}</h2>
        <p className="mt-1 text-sm text-ink-2">Enter {targetUser?.name ? `${targetUser.name}’s` : 'your'} PIN</p>
        {isDefaultPin && (
          <p className="mt-3 mx-auto max-w-[260px] text-[13px] text-ink-2 bg-sunken rounded-lg px-3 py-2">
            No PIN set yet, so it’s <span className="font-medium text-ink tabular-nums">1234</span>. Choose your own in
            Settings.
          </p>
        )}

        <label className="sr-only" htmlFor="pin-input">
          PIN
        </label>
        <input
          id="pin-input"
          ref={inputRef}
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          value={pin}
          onChange={(e) => update(e.target.value)}
          className="sr-only"
        />

        <div
          className={`flex justify-center gap-3 my-6 ${error ? 'text-accent' : ''}`}
          onClick={() => inputRef.current?.focus()}
          aria-hidden
        >
          {Array.from({ length: dots }).map((_, i) => (
            <span
              key={i}
              className={`size-3 rounded-full border-[1.5px] transition-colors ${
                i < pin.length ? 'bg-ink border-ink' : error ? 'border-accent' : 'border-line-strong'
              }`}
            />
          ))}
        </div>

        <p className="h-5 -mt-2 mb-3 text-sm text-accent" role="alert">
          {error}
        </p>

        <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <Key key={d} onClick={() => update(pin + d)}>
              {d}
            </Key>
          ))}
          <span />
          <Key onClick={() => update(pin + '0')}>0</Key>
          <button
            type="button"
            onClick={() => update(pin.slice(0, -1))}
            className="h-14 rounded-2xl inline-flex items-center justify-center text-ink-2 hover:bg-sunken active:scale-95 transition"
            aria-label="Delete digit"
          >
            <Delete className="size-5" />
          </button>
        </div>

        <button type="submit" disabled={pin.length === 0 || isSubmitting} className="btn btn-primary w-full mt-6">
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : 'Unlock'}
        </button>
      </form>
  );
};

const Key: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="h-14 rounded-2xl bg-sunken text-xl tabular-nums hover:bg-line active:scale-95 transition"
  >
    {children}
  </button>
);
