import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// F-800 / F-802 (T-223): the upload form validates before uploading and walks ticket -> storage ->
// register; the row actions ask for confirmation before deleting and show server errors.

const m = vi.hoisted(() => ({
  refresh: vi.fn(),
  requestUpload: vi.fn(),
  register: vi.fn(),
  reindex: vi.fn(),
  remove: vi.fn(),
  uploadToSignedUrl: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("@/features/knowledge/admin-actions", () => ({
  requestKnowledgeUpload: m.requestUpload,
  registerKnowledgeDocument: m.register,
  reindexKnowledgeSource: m.reindex,
  deleteKnowledgeDocument: m.remove,
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: m.uploadToSignedUrl }) } }),
}));

import { KnowledgeSourceActions } from "@/components/admin/knowledge-source-actions";
import { KnowledgeUploadForm } from "@/components/admin/knowledge-upload-form";

const orgs = [{ id: "org-1", name: "Acme" }];

function pick(file: File) {
  fireEvent.change(screen.getByLabelText("Document"), { target: { files: [file] } });
}
const submit = () => fireEvent.click(screen.getByRole("button", { name: /upload document/i }));

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.requestUpload.mockResolvedValue({
    ok: true,
    bucket: "knowledge-documents",
    path: "platform/x.txt",
    token: "tok",
    contentType: "text/plain",
  });
  m.uploadToSignedUrl.mockResolvedValue({ error: null });
  m.register.mockResolvedValue({ ok: true });
});

describe("KnowledgeUploadForm", () => {
  it("offers platform-wide and per-organization scope and states the accepted types", () => {
    render(<KnowledgeUploadForm organizations={orgs} />);
    expect(screen.getByRole("option", { name: "Everyone (platform-wide)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Only members of Acme" })).toBeInTheDocument();
    expect(screen.getByText(/up to 10 MB/)).toBeInTheDocument();
  });

  it("asks for a file when none is chosen", () => {
    render(<KnowledgeUploadForm organizations={orgs} />);
    submit();
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a file to upload.");
    expect(m.requestUpload).not.toHaveBeenCalled();
  });

  it("rejects an unsupported file type without contacting the server", () => {
    render(<KnowledgeUploadForm organizations={orgs} />);
    pick(new File(["x"], "virus.exe", { type: "application/octet-stream" }));
    submit();
    expect(screen.getByRole("alert")).toHaveTextContent(/not supported/);
    expect(m.requestUpload).not.toHaveBeenCalled();
  });

  it("uploads through the ticket, registers the document and refreshes the list", async () => {
    render(<KnowledgeUploadForm organizations={orgs} />);
    pick(new File(["Refunds take five days."], "refunds.txt", { type: "text/plain" }));
    fireEvent.change(screen.getByLabelText("Title (optional)"), {
      target: { value: "Refund policy" },
    });
    fireEvent.change(screen.getByLabelText("Who can the AI Tutor use it for?"), {
      target: { value: "org-1" },
    });
    submit();

    await waitFor(() => expect(m.register).toHaveBeenCalled());
    expect(m.requestUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "refunds.txt",
        type: "text/plain",
        title: "Refund policy",
        organizationId: "org-1",
      }),
    );
    expect(m.uploadToSignedUrl).toHaveBeenCalledWith("platform/x.txt", "tok", expect.any(File), {
      contentType: "text/plain",
    });
    expect(m.register).toHaveBeenCalledWith(
      expect.objectContaining({ path: "platform/x.txt", organizationId: "org-1" }),
    );
    await waitFor(() => expect(m.refresh).toHaveBeenCalled());
    expect(await screen.findByRole("status")).toHaveTextContent(/queued/);
  });

  it("shows the server's reason when the ticket is refused or the stored file is rejected", async () => {
    m.requestUpload.mockResolvedValueOnce({ ok: false, error: "Too many attempts." });
    render(<KnowledgeUploadForm organizations={orgs} />);
    pick(new File(["x"], "a.txt", { type: "text/plain" }));
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts.");
    expect(m.uploadToSignedUrl).not.toHaveBeenCalled();

    m.register.mockResolvedValueOnce({
      ok: false,
      error: "The file's contents are not a valid TXT document.",
    });
    submit();
    expect(await screen.findByText(/not a valid TXT document/)).toBeInTheDocument();
    expect(m.refresh).not.toHaveBeenCalled();
  });

  it("shows a retryable message when the storage upload fails", async () => {
    m.uploadToSignedUrl.mockResolvedValue({ error: { message: "network" } });
    render(<KnowledgeUploadForm organizations={orgs} />);
    pick(new File(["x"], "a.txt", { type: "text/plain" }));
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(/upload failed/i);
    expect(m.register).not.toHaveBeenCalled();
  });
});

describe("KnowledgeSourceActions", () => {
  it("re-indexes a lesson and refreshes; lessons have no delete button", async () => {
    m.reindex.mockResolvedValue({ ok: true });
    render(<KnowledgeSourceActions sourceId="s1" title="Closures" kind="lesson" />);
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /re-index/i }));
    await waitFor(() => expect(m.reindex).toHaveBeenCalledWith("s1"));
    await waitFor(() => expect(m.refresh).toHaveBeenCalled());
  });

  it("asks for confirmation before deleting a document, and cancel does nothing", async () => {
    m.remove.mockResolvedValue({ ok: true });
    render(<KnowledgeSourceActions sourceId="s2" title="Leave policy" kind="document" />);
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(m.remove).not.toHaveBeenCalled();
    expect(screen.getByText(/removes the document and its passages/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(m.remove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm delete/i }));
    await waitFor(() => expect(m.remove).toHaveBeenCalledWith("s2"));
    await waitFor(() => expect(m.refresh).toHaveBeenCalled());
  });

  it("shows the server's error", async () => {
    m.reindex.mockResolvedValue({ ok: false, error: "This source is being indexed right now." });
    render(<KnowledgeSourceActions sourceId="s1" title="Closures" kind="lesson" />);
    fireEvent.click(screen.getByRole("button", { name: /re-index/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/being indexed/);
    expect(m.refresh).not.toHaveBeenCalled();
  });
});
