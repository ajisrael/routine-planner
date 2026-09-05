import { useToastStore } from "../store/toasts";

/** DaisyUI toast stack (DESIGN.md §6.4). */
export function Toaster(): React.JSX.Element {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (toasts.length === 0) return <div />;
  return (
    <div className="toast toast-top toast-center z-[100] pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`alert alert-${t.kind} shadow-lg pointer-events-auto cursor-pointer`}
          onClick={() => dismiss(t.id)}
          role="status"
        >
          <span className="text-sm">{t.text}</span>
        </div>
      ))}
    </div>
  );
}
