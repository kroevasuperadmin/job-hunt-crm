"use client";

import { useEffect, useMemo, useState } from "react";
import type { Application, Stats } from "@/lib/types";

type StatusFilter = "all" | "SUBMITTED" | "SKIPPED" | "BLOCKED";

const POLL_MS = 4000;

interface Props {
  applications: Application[];
  stats: Stats;
}

function confirmationHref(image: string): string {
  if (/^https?:\/\//i.test(image)) return image;
  const normalized = image.replace(/^\/+/, "").replace(/^public\//, "");
  if (normalized.startsWith("confirmations/")) return `/${normalized}`;
  return `/confirmations/${normalized}`;
}

export default function Dashboard({
  applications: initialApplications,
  stats: initialStats,
}: Props) {
  const [applications, setApplications] = useState(initialApplications);
  const [stats, setStats] = useState(initialStats);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const response = await fetch("/api/crm", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as {
          applications?: Application[];
          stats?: Stats;
        };
        if (cancelled) return;
        if (Array.isArray(data.applications)) setApplications(data.applications);
        if (data.stats && typeof data.stats.totalApplications === "number") {
          setStats(data.stats);
        }
      } catch {
        // Keep the last good snapshot on screen if a poll fails.
      }
    }

    void refresh();
    const interval = window.setInterval(refresh, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return applications.filter((app) => {
      if (status !== "all" && app.status !== status) return false;
      if (!q) return true;
      return (
        app.company.toLowerCase().includes(q) ||
        app.role.toLowerCase().includes(q)
      );
    });
  }, [applications, status, query]);

  const byStatus = stats.byStatus || {};

  return (
    <div className="container">
      <header>
        <h1>Job Hunt CRM</h1>
        <p>Applications tracked in this demo · synthetic data</p>
      </header>

      <section className="stats" aria-label="Application counts">
        <div className="stat-card">
          <div className="label">Total</div>
          <div className="value">{stats.totalApplications}</div>
        </div>
        <div className="stat-card submitted">
          <div className="label">Submitted</div>
          <div className="value">{byStatus.SUBMITTED ?? 0}</div>
        </div>
        <div className="stat-card skipped">
          <div className="label">Skipped</div>
          <div className="value">{byStatus.SKIPPED ?? 0}</div>
        </div>
        <div className="stat-card blocked">
          <div className="label">Blocked</div>
          <div className="value">{byStatus.BLOCKED ?? 0}</div>
        </div>
      </section>

      <div className="controls">
        <input
          type="search"
          placeholder="Search company or role…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search company or role"
        />
        <div className="filters" role="group" aria-label="Status filter">
          {(
            [
              ["all", "All"],
              ["SUBMITTED", "Submitted"],
              ["SKIPPED", "Skipped"],
              ["BLOCKED", "Blocked"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`filter-btn${status === value ? " active" : ""}`}
              onClick={() => setStatus(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="meta">
        Showing {filtered.length} of {applications.length} applications
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>Role</th>
              <th>Status</th>
              <th>URL</th>
              <th>Time</th>
              <th>Notes / Confirmation</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  No applications match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map((app) => (
                <tr key={app.id}>
                  <td className="company">{app.company}</td>
                  <td className="role">{app.role}</td>
                  <td>
                    <span className={`status ${app.status}`}>{app.status}</span>
                  </td>
                  <td>
                    {app.url ? (
                      <a
                        className="url-link"
                        href={app.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open
                      </a>
                    ) : (
                      <span className="time">—</span>
                    )}
                  </td>
                  <td className="time">{app.time || "—"}</td>
                  <td className="notes">
                    {app.confirmation || "—"}
                    {app.confirmationImage ? (
                      <a
                        className="thumb"
                        href={confirmationHref(app.confirmationImage)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="View confirmation screenshot"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={confirmationHref(app.confirmationImage)}
                          alt={`Confirmation for ${app.company}`}
                          loading="lazy"
                        />
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
