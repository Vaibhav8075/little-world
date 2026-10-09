import React from 'react';
import type { User } from '../../types';

interface AvatarProps {
  user: User | null | undefined;
  size?: number;
}

/** Initial on the person's accent colour. Uses a photo if the avatar is an image URL. */
export const Avatar: React.FC<AvatarProps> = ({ user, size = 32 }) => {
  const isImage = Boolean(user?.avatar && /^(https?:|data:image|blob:)/.test(user.avatar));
  return (
    <span
      className="inline-flex items-center justify-center rounded-full overflow-hidden text-white font-medium shrink-0 select-none"
      style={{ width: size, height: size, fontSize: size * 0.42, backgroundColor: user?.accentColor || '#8a847a' }}
      aria-hidden
    >
      {isImage ? <img src={user!.avatar} alt="" className="size-full object-cover" /> : (user?.name?.[0] || '?').toUpperCase()}
    </span>
  );
};
