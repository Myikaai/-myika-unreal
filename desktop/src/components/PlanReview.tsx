interface PlanReviewProps {
  steps: string[];
  summary: string;
  onApprove: () => void;
  onCancel: () => void;
}

export default function PlanReview({ steps, summary, onApprove, onCancel }: PlanReviewProps) {
  return (
    <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-lg p-4 my-3 shadow-md">
      <h3 className="text-sm font-medium text-primary mb-2">Proposed Plan</h3>
      <p className="text-sm text-secondary mb-3">{summary}</p>
      <ol className="list-decimal list-inside space-y-1 mb-4">
        {steps.map((step, i) => (
          <li key={i} className="text-sm text-primary">{step}</li>
        ))}
      </ol>
      <div className="flex gap-2">
        <button onClick={onApprove} className="approve-button">
          Approve & Run
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-1.5 bg-[var(--color-bg-surface)] text-secondary text-sm rounded border border-[var(--color-border-default)] hover:text-primary hover:border-[var(--color-border-strong)] active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
          style={{ transitionDuration: "var(--duration-fast)" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
