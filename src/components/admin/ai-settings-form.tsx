"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Power } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { updateAiSettings } from "@/features/admin/ai-settings-actions";
import {
  DAILY_QUESTION_CAP,
  MAX_ANSWER_TOKENS,
  TUTOR_MODELS,
  TUTOR_MODEL_LABELS,
  isTutorModel,
  type AiSettings,
} from "@/features/ai/settings-rules";

/**
 * AI Tutor settings on /admin/ai (T-204, ADR-045). The kill switch saves on its own; the model,
 * limits and hint-only mode save together. Values are checked again on the server and in the
 * database, so this form only gives early, friendly errors.
 */
export function AiSettingsForm({
  settings,
  defaultModel,
}: {
  settings: AiSettings;
  /** The model used when "Server default" is chosen (AI_TUTOR_MODEL or the built-in default). */
  defaultModel: string;
}) {
  const router = useRouter();
  const [model, setModel] = useState<string>(settings.tutorModel ?? "");
  const [maxTokens, setMaxTokens] = useState(String(settings.maxAnswerTokens));
  const [dailyCap, setDailyCap] = useState(String(settings.dailyQuestionCap));
  const [hintOnly, setHintOnly] = useState(settings.hintOnlyAlways);
  const [busy, setBusy] = useState<"switch" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function run(kind: "switch" | "save", input: Record<string, unknown>, done: string) {
    setBusy(kind);
    setError(null);
    setSaved(null);
    const result = await updateAiSettings(input);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(done);
    router.refresh();
  }

  const on = settings.tutorEnabled;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border p-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
            AI Tutor for everyone{" "}
            <Badge tone={on ? "success" : "danger"} dot>
              {on ? "On" : "Off"}
            </Badge>
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            {on
              ? "Learners an administrator has turned the tutor on for can ask questions."
              : "The tutor refuses every question, even from learners it was turned on for."}
          </p>
        </div>
        <Button
          variant={on ? "destructive" : "primary"}
          loading={busy === "switch"}
          disabled={busy !== null}
          onClick={() =>
            run(
              "switch",
              { tutorEnabled: !on },
              on ? "AI Tutor turned off." : "AI Tutor turned on.",
            )
          }
        >
          <Power className="size-4" aria-hidden="true" />
          {on ? "Turn off the AI Tutor" : "Turn on the AI Tutor"}
        </Button>
      </div>

      <form
        noValidate
        aria-label="AI Tutor settings"
        className="max-w-xl space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            "save",
            {
              tutorModel: isTutorModel(model) ? model : null,
              maxAnswerTokens: maxTokens.trim() === "" ? Number.NaN : Number(maxTokens),
              dailyQuestionCap: dailyCap.trim() === "" ? Number.NaN : Number(dailyCap),
              hintOnlyAlways: hintOnly,
            },
            "Settings saved.",
          );
        }}
      >
        <Select
          label="Model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={busy !== null}
          options={[
            { value: "", label: `Server default (${defaultModel})` },
            ...TUTOR_MODELS.map((m) => ({ value: m, label: TUTOR_MODEL_LABELS[m] })),
          ]}
        />
        <Input
          label="Longest answer (tokens)"
          type="number"
          inputMode="numeric"
          min={MAX_ANSWER_TOKENS.min}
          max={MAX_ANSWER_TOKENS.max}
          value={maxTokens}
          onChange={(e) => setMaxTokens(e.target.value)}
          disabled={busy !== null}
          hint={`From ${MAX_ANSWER_TOKENS.min} to ${MAX_ANSWER_TOKENS.max}. Includes the model's reasoning, so keep it generous. Lower values cost less.`}
        />
        <Input
          label="Questions per learner per day"
          type="number"
          inputMode="numeric"
          min={DAILY_QUESTION_CAP.min}
          max={DAILY_QUESTION_CAP.max}
          value={dailyCap}
          onChange={(e) => setDailyCap(e.target.value)}
          disabled={busy !== null}
          hint={`From ${DAILY_QUESTION_CAP.min} to ${DAILY_QUESTION_CAP.max}, counted over a rolling 24 hours.`}
        />
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            checked={hintOnly}
            onChange={(e) => setHintOnly(e.target.checked)}
            disabled={busy !== null}
          />
          <span>
            <span className="font-medium">Always hint-only</span>
            <span className="block text-text-secondary">
              The tutor explains ideas and gives hints but never final answers, for every learner,
              not only during a graded assessment.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={busy === "save"} disabled={busy !== null}>
            Save settings
          </Button>
          {saved && (
            <span
              role="status"
              className="inline-flex items-center gap-1.5 text-sm text-success-text"
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {saved}
            </span>
          )}
        </div>
      </form>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
