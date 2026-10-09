import React from 'react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDestructive = true,
  onConfirm,
  onCancel,
}) => (
  <Modal isOpen={isOpen} onClose={onCancel} title={title} size="sm" elevated>
    <p className="text-ink-2">{message}</p>
    <div className="mt-6 flex justify-end gap-2">
      <button type="button" onClick={onCancel} className="btn btn-ghost">
        {cancelLabel}
      </button>
      <button type="button" onClick={onConfirm} className={`btn ${isDestructive ? 'btn-accent' : 'btn-primary'}`}>
        {confirmLabel}
      </button>
    </div>
  </Modal>
);
