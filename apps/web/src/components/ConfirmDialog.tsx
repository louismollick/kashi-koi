import { colors } from '@kashi-koi/design/tokens';
import { useEffect, useRef } from 'react';
import { PixelFrame } from './PixelFrame';
import { Button, Label } from './ui';

/**
 * A native modal `<dialog>` asking before something destructive. Escape and the Cancel button call `onCancel`;
 * the backdrop is the scrim. Render it only while the question is open.
 */
export function ConfirmDialog({
  title,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(320px,calc(100vw-48px))] bg-transparent p-0 text-text backdrop:bg-scrim"
    >
      <PixelFrame fill={colors.panel} border={colors.track} contentClassName="flex flex-col gap-4 p-4">
        <Label pixel className="block text-[26px]">
          {title}
        </Label>
        <div className="flex gap-2">
          <Button className="flex-1" label="Cancel" onPress={onCancel}>
            <Label pixel className="text-[19px]">
              Cancel
            </Label>
          </Button>
          <Button
            className="flex-1"
            label={confirmLabel}
            fill={colors.coral}
            border={colors.coralBorder}
            onPress={onConfirm}
          >
            <Label pixel className="text-[19px]">
              {confirmLabel}
            </Label>
          </Button>
        </div>
      </PixelFrame>
    </dialog>
  );
}
