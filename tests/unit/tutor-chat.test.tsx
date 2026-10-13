import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { TutorReply } from "@/features/ai/tutor";

// T-201 (F-701): the tutor chat shows answers with lesson links, the hint-only notice, the
// discussion escalation and recoverable errors.

const { askTutorMock, refreshMock } = vi.hoisted(() => ({
  askTutorMock: vi.fn(),
  refreshMock: vi.fn(),
}));
vi.mock("@/features/ai/tutor-actions", () => ({ askTutor: askTutorMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

import { TutorChat, discussionHref } from "@/components/ai-tutor/tutor-chat";

const COURSE = "11111111-1111-4111-8111-111111111111";

const answer = (over: Partial<Extract<TutorReply, { ok: true }>["answer"]> = {}): TutorReply => ({
  ok: true,
  conversationId: "conv-1",
  mode: "full",
  answer: {
    id: "a1",
    role: "assistant",
    text: "A closure keeps its scope [1].",
    sources: [{ n: 1, title: "Closures", lessonId: "l1", href: "/learner/courses/js/learn/l1" }],
    escalate: false,
    truncated: false,
    failed: false,
    ...over,
  },
});

function ask(question: string) {
  fireEvent.change(screen.getByLabelText("Your question"), { target: { value: question } });
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
}

describe("TutorChat", () => {
  beforeEach(() => {
    askTutorMock.mockReset();
    refreshMock.mockReset();
  });

  it("starts empty and explains where answers come from", () => {
    render(<TutorChat courseId={COURSE} courseTitle="JavaScript Basics" mode="full" />);
    expect(screen.getByText("Ask about JavaScript Basics")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("sends the question with the course and lesson and shows the answer with its lesson link", async () => {
    askTutorMock.mockResolvedValue(answer());
    render(
      <TutorChat courseId={COURSE} courseTitle="JS" lessonId="l1" mode="full" refreshOnAnswer />,
    );
    ask("What is a closure?");

    expect(await screen.findByText("A closure keeps its scope [1].")).toBeInTheDocument();
    expect(askTutorMock).toHaveBeenCalledWith({
      question: "What is a closure?",
      courseId: COURSE,
      lessonId: "l1",
      conversationId: null,
    });
    const sources = screen.getByRole("list", { name: "Sources" });
    expect(within(sources).getByRole("link", { name: "Closures" })).toHaveAttribute(
      "href",
      "/learner/courses/js/learn/l1",
    );
    expect(screen.getByLabelText("Your question")).toHaveValue("");
    expect(refreshMock).toHaveBeenCalled();

    // The follow-up continues the same conversation.
    askTutorMock.mockResolvedValue(answer({ id: "a2", text: "Second answer." }));
    ask("And again?");
    expect(await screen.findByText("Second answer.")).toBeInTheDocument();
    expect(askTutorMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ conversationId: "conv-1" }),
    );
  });

  it("offers the course discussion, pre-filled, when no lesson backs the answer", async () => {
    askTutorMock.mockResolvedValue(
      answer({ text: "I couldn't find this.", sources: [], escalate: true }),
    );
    render(<TutorChat courseId={COURSE} courseTitle="JS" mode="full" />);
    ask("Who won the World Cup?");
    const link = await screen.findByRole("link", { name: "Post this in the course discussion" });
    expect(link).toHaveAttribute("href", discussionHref(COURSE, "Who won the World Cup?"));
    expect(link.getAttribute("href")).toContain(`ask=${COURSE}`);
  });

  it("keeps the question and shows a recoverable error when the tutor fails", async () => {
    askTutorMock.mockResolvedValue({
      ok: false,
      code: "timeout",
      error: "The AI Tutor took too long to answer. Try asking again.",
      conversationId: "conv-9",
    } satisfies TutorReply);
    render(<TutorChat courseId={COURSE} courseTitle="JS" mode="full" />);
    ask("What is a closure?");

    expect(await screen.findByRole("alert")).toHaveTextContent("took too long");
    expect(screen.getByLabelText("Your question")).toHaveValue("What is a closure?");
    expect(screen.queryByText("What is a closure?", { selector: "span" })).not.toBeInTheDocument();

    askTutorMock.mockResolvedValue(answer());
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText("A closure keeps its scope [1].")).toBeInTheDocument();
    expect(askTutorMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ conversationId: "conv-9" }),
    );
  });

  it("survives the action itself throwing", async () => {
    askTutorMock.mockRejectedValue(new Error("network"));
    render(<TutorChat courseId={COURSE} courseTitle="JS" mode="full" />);
    ask("Hello?");
    expect(await screen.findByRole("alert")).toHaveTextContent("isn't available right now");
  });

  it("does not send an empty question", () => {
    render(<TutorChat courseId={COURSE} courseTitle="JS" mode="full" />);
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Type a question first.");
    expect(askTutorMock).not.toHaveBeenCalled();
  });

  it("shows the hint-only notice during a graded assessment", () => {
    render(<TutorChat courseId={COURSE} courseTitle="JS" mode="hint_only" />);
    expect(screen.getByRole("status")).toHaveTextContent("Hint-only mode");
  });

  it("shows an earlier conversation, including a failed turn and a cut-short answer", () => {
    render(
      <TutorChat
        courseId={COURSE}
        courseTitle="JS"
        mode="full"
        initialConversationId="conv-1"
        initialMessages={[
          {
            id: "1",
            role: "user",
            text: "Q1",
            sources: [],
            escalate: false,
            truncated: false,
            failed: false,
          },
          {
            id: "2",
            role: "assistant",
            text: "",
            sources: [],
            escalate: false,
            truncated: false,
            failed: true,
          },
          {
            id: "3",
            role: "assistant",
            text: "Long",
            sources: [],
            escalate: false,
            truncated: true,
            failed: false,
          },
        ]}
      />,
    );
    expect(screen.getByText("No answer: the AI Tutor was unavailable.")).toBeInTheDocument();
    expect(screen.getByText(/cut short/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    expect(screen.getByText("Ask about JS")).toBeInTheDocument();
  });
});
