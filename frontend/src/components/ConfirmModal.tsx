import { createPortal } from "react-dom";
import { IoClose } from "react-icons/io5";
import "../styles/ConfirmModal.css";

type ConfirmModalProps = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return createPortal(
    <div className="confirm-modal-backdrop" role="presentation">
      <section
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        <header>
          <div>
            <h2 id="confirm-modal-title">{title}</h2>
            <p>{message}</p>
          </div>

          <button
            type="button"
            className="confirm-icon-button"
            onClick={onCancel}
            aria-label="Close confirmation"
            title="Close"
            disabled={busy}
          >
            <IoClose aria-hidden="true" />
          </button>
        </header>

        <footer>
          <button
            type="button"
            className="confirm-secondary-button"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? "confirm-danger-button" : "confirm-primary-button"}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </footer>
      </section>
    </div>,
    document.body
  );
}
