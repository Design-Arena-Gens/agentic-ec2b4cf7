"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { runAutomation } from "@/lib/agent";
import { defaultWorkflows, seedEmails } from "@/lib/data";
import {
  ActionLogEntry,
  AutomationActionType,
  EmailPayload,
  ProcessedEmail,
  WhatsAppNotification,
  Workflow,
} from "@/lib/types";

const automationTypes: AutomationActionType[] = [
  "analysis",
  "draft_reply",
  "submit_application",
  "notify_whatsapp",
  "update_tracker",
  "coordinate",
  "collect_documents",
  "custom",
];

interface NewWorkflowFormState {
  name: string;
  description: string;
  keywords: string;
  actions: string;
  autopilot: boolean;
  slaMinutes: number;
}

const defaultFormState: NewWorkflowFormState = {
  name: "",
  description: "",
  keywords: "",
  actions: "",
  autopilot: true,
  slaMinutes: 30,
};

const highlightColors = [
  "from-violet-500/20",
  "from-emerald-500/20",
  "from-sky-500/20",
  "from-amber-500/20",
  "from-pink-500/20",
];

function formatRelativeTime(dateIso: string) {
  const delta = Date.now() - new Date(dateIso).getTime();
  const minutes = Math.round(delta / (1000 * 60));
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function computeProcessingVelocity(processed: ProcessedEmail[]) {
  if (!processed.length) return 0;
  const recent = processed.slice(0, 5);
  const totalRuntime = recent.reduce((acc, item) => {
    const runtime = item.actions.reduce(
      (actionAcc, action) => actionAcc + action.runtimeSeconds,
      0,
    );
    return acc + runtime;
  }, 0);
  const avgSeconds = totalRuntime / recent.length || 1;
  return Math.round((60 / avgSeconds) * 10) / 10;
}

function generateMockEmail(counter: number): EmailPayload {
  const templates = [
    {
      subject: `Scholarship follow-up #${counter}`,
      sender: `awards@brightfuture${counter}.edu`,
      preview:
        "We're excited to move you to the final round pending a short form.",
      body: `Hello again,

We loved your profile and just need you to complete the finalist questionnaire. Please upload your updated transcript and personal video statement.

Submit here: https://apply.brightfuture.edu/finalist

Thanks!`,
      tags: ["scholarship", "follow-up"],
    },
    {
      subject: `Backend role opportunity – Round ${counter}`,
      sender: `recruiter${counter}@techhire.io`,
      preview: "Can you apply through our Greenhouse portal this afternoon?",
      body: `Hi,

Loved your OSS work. Please apply via https://careers.techhire.io/apply so we can trigger the hiring loop. Need this today.

Cheers,
Recruiting Team`,
      tags: ["job", "backend"],
    },
    {
      subject: `Quick documentation question`,
      sender: `ops${counter}@growthloops.com`,
      preview:
        "Client asked for confirmation on the onboarding packet you mentioned.",
      body: `Hey!

Can you confirm if the onboarding packet was sent? Need a short reply to the client.

Thanks!`,
      tags: ["support", "client"],
    },
  ];

  const template = templates[counter % templates.length];

  return {
    id: `email-generated-${counter}`,
    subject: template.subject,
    sender: template.sender,
    senderName: template.sender.split("@")[0],
    to: "you@example.com",
    preview: template.preview,
    body: template.body,
    receivedAt: new Date().toISOString(),
    tags: template.tags,
  };
}

export function AgentDashboard() {
  const [workflows, setWorkflows] = useState<Workflow[]>(defaultWorkflows);
  const [emailQueue, setEmailQueue] = useState<EmailPayload[]>(seedEmails);
  const [processedEmails, setProcessedEmails] = useState<ProcessedEmail[]>([]);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(
    seedEmails[0]?.id ?? null,
  );
  const [actionLog, setActionLog] = useState<ActionLogEntry[]>([]);
  const [whatsappMessages, setWhatsappMessages] = useState<
    WhatsAppNotification[]
  >([]);
  const [formState, setFormState] =
    useState<NewWorkflowFormState>(defaultFormState);
  const [toast, setToast] = useState<string | null>(null);
  const generatedCountRef = useRef(0);

  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(null), 3500);
      return () => clearTimeout(id);
    }
    return () => {};
  }, [toast]);

  const selectedEmail = useMemo(() => {
    if (selectedEmailId) {
      return emailQueue.find((email) => email.id === selectedEmailId) ?? null;
    }
    return emailQueue[0] ?? null;
  }, [emailQueue, selectedEmailId]);

  const stats = useMemo(
    () => ({
      queue: emailQueue.length,
      completed: processedEmails.length,
      whatsapp: whatsappMessages.length,
      velocity: computeProcessingVelocity(processedEmails),
    }),
    [emailQueue.length, processedEmails, whatsappMessages.length],
  );

  const handleRunAutomation = (email: EmailPayload | null) => {
    if (!email) return;

    const { processedEmail, logs, whatsappMessages: whatsapp } = runAutomation(
      email,
      workflows,
    );

    setProcessedEmails((prev) => [processedEmail, ...prev].slice(0, 15));
    setEmailQueue((prev) => prev.filter((item) => item.id !== email.id));
    setSelectedEmailId((prev) => {
      if (prev === email.id) {
        const next = emailQueue.filter((item) => item.id !== email.id)[0];
        return next?.id ?? null;
      }
      return prev;
    });
    setActionLog((prev) => [...logs, ...prev].slice(0, 40));
    setWhatsappMessages((prev) => [...whatsapp, ...prev].slice(0, 20));
    setToast(`Automation finished for “${email.subject}”`);
  };

  const handleGenerateEmail = () => {
    generatedCountRef.current += 1;
    const email = generateMockEmail(generatedCountRef.current);
    setEmailQueue((prev) => [email, ...prev]);
    setToast(`New email ingested: ${email.subject}`);
    setSelectedEmailId(email.id);
  };

  const handleFormChange = <K extends keyof NewWorkflowFormState>(
    key: K,
    value: NewWorkflowFormState[K],
  ) => {
    setFormState((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleCreateWorkflow = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.name.trim()) {
      setToast("Workflow name required");
      return;
    }
    const keywords = formState.keywords
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    const actions = formState.actions
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const [rawType, rawSummary, rawDetails] = line.split("|").map((part) =>
          (part ?? "").trim(),
        );
        const type = automationTypes.includes(
          rawType as AutomationActionType,
        )
          ? (rawType as AutomationActionType)
          : "custom";

        return {
          id: `custom-${formState.name}-${index}`,
          type,
          summary: rawSummary || `Custom action ${index + 1}`,
          details:
            rawDetails ||
            "Automatically executed as part of the custom workflow.",
        };
      });

    if (!actions.length) {
      actions.push({
        id: `custom-${formState.name}-default`,
        type: "analysis",
        summary: "Analyze email context",
        details: "Generate structured summary and recommended response.",
      });
    }

    const workflow: Workflow = {
      id: formState.name.toLowerCase().replace(/\s+/g, "-"),
      name: formState.name,
      description:
        formState.description ||
        "Custom automation created from the dashboard.",
      trigger: {
        keywords: keywords.length ? keywords : [formState.name],
        categories: ["custom"],
        autoDetect: true,
      },
      actions,
      autopilot: formState.autopilot,
      slaMinutes: formState.slaMinutes,
      successMetric: "Automation executed per custom configuration",
      playbookHighlights: ["Custom workflow"],
    };

    setWorkflows((prev) => [workflow, ...prev]);
    setFormState(defaultFormState);
    setToast(`Workflow “${workflow.name}” created`);
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 p-6 md:p-10">
      <header className="flex flex-col gap-6 rounded-3xl bg-gradient-to-br from-zinc-100 via-white to-white p-8 shadow-sm ring-1 ring-black/5">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold uppercase tracking-[0.3em] text-indigo-500">
            Agent Ops Command
          </span>
          <h1 className="text-3xl font-semibold text-zinc-900 md:text-4xl">
            Inbox automation pilot for scholarships, jobs, and everything else
          </h1>
          <p className="max-w-2xl text-sm text-zinc-600 md:text-base">
            Configure workflows that read every email, submit applications
            automatically, and surface confirmations on WhatsApp without leaving
            this dashboard.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 shadow-inner ring-1 ring-black/5">
            <p className="text-sm text-zinc-500">Queued emails</p>
            <p className="text-2xl font-semibold text-zinc-900">
              {stats.queue}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-inner ring-1 ring-black/5">
            <p className="text-sm text-zinc-500">Automations completed</p>
            <p className="text-2xl font-semibold text-zinc-900">
              {stats.completed}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-inner ring-1 ring-black/5">
            <p className="text-sm text-zinc-500">WhatsApp updates</p>
            <p className="text-2xl font-semibold text-zinc-900">
              {stats.whatsapp}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-inner ring-1 ring-black/5">
            <p className="text-sm text-zinc-500">Runs / minute (avg)</p>
            <p className="text-2xl font-semibold text-zinc-900">
              {stats.velocity.toFixed(1)}
            </p>
          </div>
        </div>
      </header>

      <main className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section className="flex flex-col gap-4 rounded-3xl bg-white/70 p-6 shadow-sm ring-1 ring-black/5 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">
                Live inbox feed
              </h2>
              <p className="text-sm text-zinc-500">
                Enriched emails ready for autopilot routing
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerateEmail}
              className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700"
            >
              Ingest sample
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {emailQueue.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500">
                Inbox is empty. Ingest a sample to keep the agent busy.
              </div>
            ) : (
              emailQueue.map((email, index) => (
                <button
                  key={email.id}
                  type="button"
                  onClick={() => setSelectedEmailId(email.id)}
                  className={`flex flex-col gap-2 rounded-2xl border px-4 py-3 text-left transition ${
                    selectedEmail?.id === email.id
                      ? "border-zinc-900 bg-zinc-900/5 ring-1 ring-zinc-900/30"
                      : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-100/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-zinc-900">
                      {email.subject}
                    </p>
                    <span className="text-xs text-zinc-500">
                      {formatRelativeTime(email.receivedAt)}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-600">{email.preview}</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-zinc-900/5 px-2 py-1 text-xs font-medium text-zinc-700">
                      {email.sender}
                    </span>
                    {email.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-600"
                      >
                        {tag}
                      </span>
                    ))}
                    <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-500">
                      Rank #{index + 1}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <header className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">
                Automation brief
              </h2>
              <p className="text-sm text-zinc-500">
                Preview of the playbook the agent will execute
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleRunAutomation(selectedEmail)}
              disabled={!selectedEmail}
              className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition enabled:hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              Run automation
            </button>
          </header>

          {selectedEmail ? (
            <div className="flex flex-col gap-4">
              <article className="rounded-2xl bg-zinc-900 text-zinc-50">
                <div className="flex flex-col gap-4 border-b border-white/10 p-5">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-300">
                      Selected email
                    </p>
                    <h3 className="mt-1 text-xl font-semibold">
                      {selectedEmail.subject}
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
                    <span className="rounded-full border border-white/20 px-3 py-1 font-medium">
                      {selectedEmail.sender}
                    </span>
                    <span className="rounded-full border border-white/20 px-3 py-1">
                      {formatRelativeTime(selectedEmail.receivedAt)}
                    </span>
                    {selectedEmail.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-white/10 px-3 py-1"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-3 p-5 text-sm leading-relaxed text-zinc-200">
                  {selectedEmail.body.split("\n").map((line, index) => (
                    <p key={`${line}-${index}`}>{line}</p>
                  ))}
                </div>
              </article>

              <div className="grid gap-4 md:grid-cols-2">
                {workflows.slice(0, 4).map((workflow, index) => (
                  <div
                    key={workflow.id}
                    className={`rounded-2xl border border-zinc-200 bg-gradient-to-br ${highlightColors[index % highlightColors.length]} p-4`}
                  >
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">
                        Workflow
                      </span>
                      <h3 className="text-base font-semibold text-zinc-900">
                        {workflow.name}
                      </h3>
                      <p className="text-sm text-zinc-600 line-clamp-2">
                        {workflow.description}
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
                        {workflow.trigger.keywords.slice(0, 4).map((keyword) => (
                          <span
                            key={keyword}
                            className="rounded-full bg-white/80 px-2 py-1 font-medium text-zinc-700 shadow-sm"
                          >
                            #{keyword}
                          </span>
                        ))}
                        <span className="rounded-full bg-white/80 px-2 py-1 text-xs">
                          SLA: {workflow.slaMinutes}m
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {processedEmails.length > 0 && (
                <div className="rounded-2xl border border-dashed border-zinc-200 p-4">
                  <h3 className="text-sm font-semibold text-zinc-900">
                    Recent completions
                  </h3>
                  <ul className="mt-3 flex flex-col gap-2 text-sm text-zinc-600">
                    {processedEmails.slice(0, 3).map((item) => (
                      <li key={item.email.id} className="flex flex-col">
                        <span className="font-medium text-zinc-800">
                          {item.summary}
                        </span>
                        <span className="text-xs text-zinc-500">
                          Confidence {(item.confidence * 100).toFixed(0)}% •{" "}
                          {item.workflowIds.join(", ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-zinc-200 p-10 text-sm text-zinc-500">
              Select an email from the queue to see the automation plan.
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">
              Agent telemetry
            </h2>
            <p className="text-sm text-zinc-500">
              Logs, WhatsApp updates, and workflow designer
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900">
                WhatsApp confirmations
              </h3>
              <span className="text-xs text-zinc-500">
                {whatsappMessages.length} sent
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {whatsappMessages.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-200 p-4 text-sm text-zinc-500">
                  No WhatsApp messages yet. Run an automation to broadcast
                  confirmation.
                </div>
              ) : (
                whatsappMessages.slice(0, 3).map((message) => (
                  <div
                    key={message.id}
                    className="rounded-2xl border border-zinc-200 p-4 text-sm text-zinc-700"
                  >
                    <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
                      <span>{message.to}</span>
                      <span>{formatRelativeTime(message.timestamp)}</span>
                    </div>
                    <pre className="whitespace-pre-wrap text-zinc-700">
                      {message.message}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900">
                Automation log
              </h3>
              <span className="text-xs text-zinc-500">
                {actionLog.length} events
              </span>
            </div>
            <div className="flex max-h-60 flex-col gap-3 overflow-auto pr-1">
              {actionLog.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-200 p-4 text-sm text-zinc-500">
                  No events yet.
                </div>
              ) : (
                actionLog.slice(0, 6).map((log) => (
                  <div
                    key={log.id}
                    className="rounded-2xl border border-zinc-200 p-4 text-sm"
                  >
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <span>{log.workflowId}</span>
                      <span>{formatRelativeTime(log.timestamp)}</span>
                    </div>
                    <p className="mt-2 font-medium text-zinc-800">
                      {log.title}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-600">
                      {log.body}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <form
            onSubmit={handleCreateWorkflow}
            className="mt-auto flex flex-col gap-3 rounded-2xl border border-zinc-200 p-4"
          >
            <h3 className="text-sm font-semibold text-zinc-900">
              Design new workflow
            </h3>
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
              Name
              <input
                required
                value={formState.name}
                onChange={(event) =>
                  handleFormChange("name", event.target.value)
                }
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
              Description
              <textarea
                value={formState.description}
                onChange={(event) =>
                  handleFormChange("description", event.target.value)
                }
                rows={2}
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
              Keywords (comma separated)
              <input
                value={formState.keywords}
                onChange={(event) =>
                  handleFormChange("keywords", event.target.value)
                }
                placeholder="scholarship, stipend"
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
              Actions (one per line: type | summary | details)
              <textarea
                value={formState.actions}
                onChange={(event) =>
                  handleFormChange("actions", event.target.value)
                }
                rows={3}
                placeholder="submit_application | Apply on portal | Use stored profile to submit"
                className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </label>
            <div className="flex items-center justify-between text-xs text-zinc-600">
              <label className="flex items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={formState.autopilot}
                  onChange={(event) =>
                    handleFormChange("autopilot", event.target.checked)
                  }
                  className="size-4 rounded border border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                />
                Autopilot enabled
              </label>
              <label className="flex items-center gap-2">
                SLA
                <input
                  type="number"
                  min={5}
                  value={formState.slaMinutes}
                  onChange={(event) =>
                    handleFormChange("slaMinutes", Number(event.target.value))
                  }
                  className="w-16 rounded-xl border border-zinc-200 px-2 py-1 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
                min
              </label>
            </div>
            <button
              type="submit"
              className="mt-2 rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
            >
              Save workflow
            </button>
            <p className="text-[11px] text-zinc-400">
              Supported action types: {automationTypes.join(", ")}.
            </p>
          </form>
        </aside>
      </main>

      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 flex justify-center px-4">
          <div className="pointer-events-auto rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white shadow-lg">
            {toast}
          </div>
        </div>
      ) : null}
    </div>
  );
}
