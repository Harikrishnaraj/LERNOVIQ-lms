import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

// T-223: the knowledge base page re-reads itself while sources wait to be indexed, but never
// while the admin is working in a form (a refresh would shift the layout under them).

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { KnowledgeAutoRefresh } from "@/components/admin/knowledge-auto-refresh";

describe("KnowledgeAutoRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("refreshes every interval while sources are waiting", () => {
    render(<KnowledgeAutoRefresh active everyMs={1000} />);
    vi.advanceTimersByTime(3000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("does nothing when nothing is waiting", () => {
    render(<KnowledgeAutoRefresh active={false} everyMs={1000} />);
    vi.advanceTimersByTime(3000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("pauses while a form field has focus, and resumes after", () => {
    const { getByLabelText } = render(
      <>
        <KnowledgeAutoRefresh active everyMs={1000} />
        <form>
          <label>
            Question
            <input />
          </label>
        </form>
      </>,
    );
    const input = getByLabelText("Question") as HTMLInputElement;
    input.focus();
    vi.advanceTimersByTime(3000);
    expect(refresh).not.toHaveBeenCalled();

    input.blur();
    vi.advanceTimersByTime(1000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
