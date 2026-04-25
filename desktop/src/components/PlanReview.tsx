interface PlanReviewProps {
  steps: string[];
  summary: string;
  onApprove: () => void;
  onCancel: () => void;
}

export default function PlanReview({ steps, summary, onApprove, onCancel }: PlanReviewProps) {
  return (
    <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-4 my-3">
      <h3 className="text-sm font-medium text-primary mb-2">Proposed Plan</h3>
      <p className="text-sm text-muted mb-3">{summary}</p>
      <ol className="list-decimal list-inside space-y-1 mb-4">
        {steps.map((step, i) => (
          <li key={i} className="text-sm text-primary">{step}</li>
        ))}
      </ol>
      <div className="flex gap-2">
        <button onClick={onApprove} className="px-4 py-1.5 bg-[var(--accent)] text-black text-sm font-medium rounded hover:opacity-90">
          Approve & Run
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 bg-[var(--bg-surface)] text-muted text-sm rounded border border-[var(--border)] hover:text-primary">
          Cancel
        </button>
      </div>
    </div>
  );
}
