import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy, del, get, head, list, put } from "@vercel/blob";
import HomePage from "@/app/page";
import { clearCrmCacheForTests } from "@/lib/store";

vi.mock("@vercel/blob", () => ({
  get: vi.fn(),
  put: vi.fn(),
  list: vi.fn(),
  head: vi.fn(),
  copy: vi.fn(),
  del: vi.fn(),
}));

function blobDocument(applications: unknown[], updatedAt: string) {
  return {
    version: 1,
    applications,
    updatedAt,
  };
}

function asBlobGet(body: unknown) {
  return {
    statusCode: 200 as const,
    stream: new Response(JSON.stringify(body)).body,
  };
}

describe("vercel blob reads", () => {
  beforeEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    delete process.env.VERCEL;
    clearCrmCacheForTests();
    vi.mocked(get).mockReset();
    vi.mocked(put).mockReset();
    vi.mocked(list).mockReset();
    vi.mocked(head).mockReset();
    vi.mocked(copy).mockReset();
    vi.mocked(del).mockReset();
    vi.mocked(list).mockImplementation(() => {
      throw new Error("list() was called");
    });
  });

  it("does not call list() while rendering the page", async () => {
    vi.mocked(get).mockResolvedValue(
      asBlobGet(
        blobDocument(
          [
            {
              id: "acme-growth-lead",
              time: "2026-09-25 12:00 MYT",
              company: "Cache Check Co",
              role: "Growth Lead",
              url: "https://example.com/jobs/growth",
              status: "SUBMITTED",
              confirmation: null,
              confirmationImage: null,
            },
          ],
          "2026-09-25T04:00:00.000Z",
        ),
      ) as never,
    );

    const first = renderToStaticMarkup(await HomePage());
    const second = renderToStaticMarkup(await HomePage());

    expect(list).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(head).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledTimes(1);
    expect(first).toContain("Cache Check Co");
    expect(second).toContain("Cache Check Co");
    expect(first).not.toContain("Showing a saved copy");
  });

  it("renders the bundled copy and its time when the store is unreachable", async () => {
    vi.mocked(get).mockRejectedValue(new Error("Blob store access is paused"));

    const html = renderToStaticMarkup(await HomePage());

    expect(list).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledTimes(1);
    expect(html).toContain("Showing a saved copy from 24 Sep 2026, 09:02 UTC.");
    expect(html).toContain("Bloom");
    expect(html).toContain(">250<");
    expect(html).not.toContain("No applications match");
  });
});
