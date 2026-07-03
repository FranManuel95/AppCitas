"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { fmt, type Dict } from "@/lib/i18n/shared";

export type ReviewFormLabels = Pick<
  Dict["myAppointments"],
  | "reviewCta"
  | "reviewTitle"
  | "reviewCommentLabel"
  | "reviewSubmit"
  | "reviewSending"
  | "reviewThanks"
  | "reviewError"
  | "starAria"
>;

// Formulario inline de valoración post-cita: botón discreto que despliega el
// panel de estrellas + comentario (mismo patrón abierto/ocupado/error que
// CancelAppointmentButton).
export function ReviewForm({
  appointmentId,
  labels,
}: {
  appointmentId: string;
  labels: ReviewFormLabels;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/appointments/${appointmentId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rating,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? labels.reviewError);
      setBusy(false);
      return;
    }
    setDone(true);
    router.refresh();
  }

  if (done) {
    return (
      <p className="rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success-strong">
        {labels.reviewThanks}
      </p>
    );
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Star className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {labels.reviewCta}
      </Button>
    );
  }

  const commentId = `review-comment-${appointmentId}`;

  return (
    <div className="w-full rounded-lg border border-border bg-surface-2 p-4 text-sm">
      <p className="font-medium text-ink">{labels.reviewTitle}</p>

      <div className="mt-2 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={busy}
            aria-label={fmt(labels.starAria, { n })}
            aria-pressed={n <= rating}
            onClick={() => setRating(n)}
            className="rounded p-0.5 transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <Star
              className={cn(
                "h-5 w-5",
                n <= rating ? "fill-current text-warning" : "text-ink-muted",
              )}
              aria-hidden
            />
          </button>
        ))}
      </div>

      <Field
        label={labels.reviewCommentLabel}
        htmlFor={commentId}
        className="mt-3"
      >
        <Textarea
          id={commentId}
          rows={3}
          maxLength={500}
          value={comment}
          disabled={busy}
          onChange={(e) => setComment(e.target.value)}
        />
      </Field>

      {error && <p className="mt-2 text-danger-strong">{error}</p>}

      <div className="mt-3">
        <Button
          variant="primary"
          size="sm"
          disabled={busy || rating === 0}
          onClick={submit}
        >
          {busy ? labels.reviewSending : labels.reviewSubmit}
        </Button>
      </div>
    </div>
  );
}
