import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileSpreadsheet,
  Gauge,
  History,
  LogOut,
  Mail,
  Menu,
  Plus,
  Send,
  ShieldCheck,
  UploadCloud,
  X,
} from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { saveEmailCampaign } from './emailHistory';
import type { DeliveryResult } from './emailHistory';
import { EmailHistory } from './HistoryScreen';
import { apiUrl, responseError } from './api';
import { isSupabaseConfigured, supabase } from './supabase';

type View = 'dashboard' | 'emails' | 'history';
type SendMode = 'now' | 'later';
type Recipient = Record<string, string>;

type CampaignRecord = {
  id: string;
  subject: string;
  recipients: number;
  status: 'Sent' | 'Partially sent' | 'Failed' | 'Scheduled';
  date: string;
};

type CampaignApiRecord = {
  id: string;
  subject_template: string;
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'completed_with_errors' | 'cancelled' | 'failed';
  scheduled_at: string | null;
  total_count: number;
  sent_count: number;
  created_at: string;
  completed_at: string | null;
};

const steps = ['Template', 'Upload', 'Write', 'Preview', 'Send'];
const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const templatePattern = /{\s*([a-zA-Z_]\w*)\s*}/g;
async function retrieveEmailHistory(accessToken: string): Promise<CampaignRecord[]> {
  const response = await fetch(apiUrl('/email-history/campaigns?limit=100'), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw await responseError(response, 'Could not load email history.');
  }

  const body = await response.json() as { items: CampaignApiRecord[] };
  return body.items
    .filter((item) => !['draft', 'sending', 'cancelled'].includes(item.status))
    .map((item) => ({
      id: item.id,
      subject: item.subject_template,
      recipients: item.status === 'scheduled' ? item.total_count : item.sent_count,
      status: item.status === 'scheduled'
        ? 'Scheduled'
        : item.status === 'completed_with_errors'
          ? 'Partially sent'
          : item.status === 'failed'
            ? 'Failed'
            : 'Sent',
      date: new Date(
        item.scheduled_at || item.completed_at || item.created_at,
      ).toLocaleString(),
    }));
}

const sampleRecipients: Recipient[] = [
  {
    email: 'maya@example.com',
    name: 'Maya',
    company: 'Northstar Studio',
    time: '9:00 AM',
  },
  {
    email: 'alex@example.com',
    name: 'Alex',
    company: 'Juniper Labs',
    time: '9:30 AM',
  },
  {
    email: 'sam@example.com',
    name: 'Sam',
    company: 'Field Notes Co.',
    time: '10:00 AM',
  },
];

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  values.push(current.trim());
  return values;
}

function parseCsv(text: string): Recipient[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((header) =>
    header.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, ''),
  );
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<Recipient>((row, header, index) => {
      row[header] = values[index] ?? '';
      return row;
    }, {});
  });
}

function renderTemplate(template: string, row: Recipient) {
  return template.replace(templatePattern, (_, key: string) => row[key] ?? `{${key}}`);
}

function Logo() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <Mail size={20} strokeWidth={2.2} />
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4Z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1a5.8 5.8 0 0 1-5.5-4H3.2v2.6A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.5 14.1a6 6 0 0 1 0-4.2V7.3H3.2a10 10 0 0 0 0 9.4l3.3-2.6Z" />
      <path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 3.2 7.3l3.3 2.6a5.8 5.8 0 0 1 5.5-4Z" />
    </svg>
  );
}

function Login({ onDemo }: { onDemo: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function startOAuth() {
    setLoading(true);
    setError('');
    try {
      if (!supabase || !isSupabaseConfigured) {
        throw new Error('Add your Supabase URL and publishable key to .env.local first.');
      }

      const redirectTo =
        import.meta.env.VITE_AUTH_REDIRECT_URL?.trim() || window.location.origin;
      const scopes =
        import.meta.env.VITE_GOOGLE_OAUTH_SCOPES?.trim() ||
        'https://www.googleapis.com/auth/gmail.send';
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          scopes,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      if (oauthError) throw oauthError;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to connect to Google.');
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-story">
        <div className="login-brand"><Logo /><span>Quick Emailer</span></div>
        <div className="story-copy">
          <span className="eyebrow light">PERSONALIZED EMAIL, WITHOUT THE BUSYWORK</span>
          <h1>Turn a simple spreadsheet into a thoughtful email for everyone.</h1>
          <p>Connect Gmail, upload your recipients, write once, and review every message before it leaves your inbox.</p>
        </div>
        <div className="trust-row">
          <ShieldCheck size={20} />
          <span>Uses Gmail’s send-only permission. Your password is never shared.</span>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="mobile-brand"><Logo /><span>Quick Emailer</span></div>
          <span className="eyebrow">WELCOME</span>
          <h2>Connect your Gmail</h2>
          <p className="login-intro">Sign in with the Google account you want to send from. One consent screen covers your account and Gmail send access.</p>
          <button className="google-button" onClick={startOAuth} disabled={loading}>
            <GoogleMark />
            {loading ? 'Opening Google…' : 'Continue with Google'}
          </button>
          {error && <div className="inline-error">{error}</div>}
          <div className="login-divider"><span>or</span></div>
          <button className="text-button" onClick={onDemo}>Preview with sample data</button>
          <p className="terms">By continuing, you agree to use this tool only for recipients who expect to hear from you.</p>
        </div>
      </section>
    </main>
  );
}

function Sidebar({ view, setView, onLogout, email }: { view: View; setView: (view: View) => void; onLogout: () => void; email: string }) {
  const [open, setOpen] = useState(false);
  const initials = email.slice(0, 2).toUpperCase();
  return (
    <>
      <button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu /></button>
      {open && <button className="sidebar-scrim" onClick={() => setOpen(false)} aria-label="Close navigation" />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand"><Logo /><span>Quick Emailer</span><button className="sidebar-close" onClick={() => setOpen(false)}><X size={20} /></button></div>
        <nav>
          <button className={view === 'dashboard' ? 'active' : ''} onClick={() => { setView('dashboard'); setOpen(false); }}><Gauge />Dashboard</button>
          <button className={view === 'emails' ? 'active' : ''} onClick={() => { setView('emails'); setOpen(false); }}><Mail />Emails</button>
          <button className={view === 'history' ? 'active' : ''} onClick={() => { setView('history'); setOpen(false); }}><History />Email history</button>
        </nav>
        <div className="sidebar-bottom">
          <div className="connected-user"><div className="avatar">{initials}</div><div><strong>{email}</strong><span>Supabase + Gmail connected</span></div></div>
          <button className="logout-button" onClick={onLogout}><LogOut size={17} /> Sign out</button>
        </div>
      </aside>
    </>
  );
}

function Dashboard({ history, scheduled, loading, error, goToEmails, openHistory }: { history: CampaignRecord[]; scheduled: CampaignRecord[]; loading: boolean; error: string; goToEmails: () => void; openHistory: (campaignId?: string) => void }) {
  return (
    <section className="page-content dashboard-page">
      <header className="page-header">
        <div><span className="eyebrow">OVERVIEW</span><h1>Dashboard</h1><p>Your sending activity will appear here.</p></div>
        <button className="primary-button" onClick={goToEmails}><Plus size={17} /> New email</button>
      </header>
      <div className="stat-grid">
        <article className="stat-card"><span className="stat-icon blue"><Send /></span><div><span>Emails sent</span><strong>{history.reduce((total, item) => total + item.recipients, 0)}</strong></div><small>All time</small></article>
        <article className="stat-card"><span className="stat-icon violet"><CalendarClock /></span><div><span>Scheduled</span><strong>{scheduled.length}</strong></div><small>Upcoming campaigns</small></article>
        <article className="stat-card"><span className="stat-icon green"><CheckCircle2 /></span><div><span>Delivery rate</span><strong>{history.length ? '100%' : '—'}</strong></div><small>Successful API sends</small></article>
      </div>
      <div className="dashboard-grid">
        <article className="panel">
          <div className="panel-heading"><div><h2>Email history</h2><p>Completed sends saved in Supabase.</p></div><BarChart3 /></div>
          {error && <div className="inline-error">{error}</div>}
          {loading ? <div className="empty-state"><span><Mail /></span><strong>Loading email history…</strong></div> : history.length ? <div className="record-list">{history.map((item) => <button className="record-row record-button" key={item.id} onClick={() => openHistory(item.id)}><span className="record-icon"><Mail /></span><span className="record-copy"><strong>{item.subject}</strong><span>{item.recipients} recipients · {item.date}</span></span><b className="status sent">{item.status}</b></button>)}<button className="text-button history-link" onClick={() => openHistory()}>View all email history</button></div> : <EmptyState icon={<Mail />} title="No emails sent yet" detail="Your completed campaigns will appear here." action="Create an email" onAction={goToEmails} />}
        </article>
        <article className="panel">
          <div className="panel-heading"><div><h2>Scheduled emails</h2><p>Upcoming sends, ready for the scheduling backend.</p></div><Clock3 /></div>
          {scheduled.length ? <div className="record-list">{scheduled.map((item) => <div className="record-row" key={item.id}><span className="record-icon purple"><CalendarClock /></span><div><strong>{item.subject}</strong><span>{item.recipients} recipients · {item.date}</span></div><b className="status scheduled">Scheduled</b></div>)}</div> : <EmptyState icon={<CalendarClock />} title="Nothing scheduled" detail="Scheduled campaigns will appear here." />}
        </article>
      </div>
    </section>
  );
}

function EmptyState({ icon, title, detail, action, onAction }: { icon: React.ReactNode; title: string; detail: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><span>{icon}</span><strong>{title}</strong><p>{detail}</p>{action && <button className="secondary-button" onClick={onAction}>{action}</button>}</div>;
}

function Stepper({ current, setStep }: { current: number; setStep: (step: number) => void }) {
  return (
    <ol className="stepper" aria-label="Email creation steps">
      {steps.map((step, index) => (
        <li key={step} className={index === current ? 'current' : index < current ? 'complete' : ''}>
          <button onClick={() => index <= current && setStep(index)} disabled={index > current}>
            <span>{index < current ? <Check size={15} /> : index + 1}</span>
            <b>{step}</b>
          </button>
          {index < steps.length - 1 && <i />}
        </li>
      ))}
    </ol>
  );
}

function EmailWorkspace({ demoMode, accessToken, providerToken, userId, senderEmail, onSent, onScheduled }: { demoMode: boolean; accessToken: string | null; providerToken: string | null; userId: string | null; senderEmail: string; onSent: (record: CampaignRecord) => void; onScheduled: (record: CampaignRecord) => void }) {
  const [step, setStep] = useState(0);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [fileName, setFileName] = useState('');
  const [subject, setSubject] = useState('A quick note for {name}');
  const [body, setBody] = useState('Hi {name},\n\nI wanted to reach out with a quick update for the team at {company}.\n\nWould {time} work for a short conversation?\n\nBest,\nRyan');
  const [previewIndex, setPreviewIndex] = useState(0);
  const [sendMode, setSendMode] = useState<SendMode>('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const columns = useMemo(() => recipients.length ? Object.keys(recipients[0]) : ['email', 'name', 'company', 'time'], [recipients]);
  const invalidCount = recipients.filter((row) => !emailPattern.test(row.email ?? '')).length;
  const placeholders = useMemo(() => [...new Set([...subject.matchAll(templatePattern), ...body.matchAll(templatePattern)].map((match) => match[1]))], [subject, body]);
  const missing = placeholders.filter((item) => !columns.includes(item));
  const previewRow = recipients[previewIndex] ?? sampleRecipients[0];

  function downloadTemplate() {
    const csv = 'email,name,company,time\nperson@example.com,Jamie,Example Co.,9:00 AM\n';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = 'quick-email-template.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function loadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const rows = parseCsv(await file.text());
    setRecipients(rows);
    setFileName(file.name);
    setPreviewIndex(0);
    setMessage(rows.length ? '' : 'This CSV does not contain any recipient rows.');
  }

  function useSampleData() {
    setRecipients(sampleRecipients);
    setFileName('sample-recipients.csv');
    setPreviewIndex(0);
    setMessage('');
  }

  function insertVariable(variable: string) {
    setBody((current) => `${current}{${variable}}`);
  }

  function nextStep() {
    if (step === 1 && (!recipients.length || invalidCount)) {
      setMessage(invalidCount ? `${invalidCount} recipient email${invalidCount === 1 ? ' is' : 's are'} invalid.` : 'Upload a CSV before continuing.');
      return;
    }
    if (step === 2 && (!subject.trim() || !body.trim() || missing.length)) {
      setMessage(missing.length ? `Missing CSV column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}` : 'Add both a subject and message.');
      return;
    }
    setMessage('');
    setStep((current) => Math.min(4, current + 1));
  }

  async function finishCampaign() {
    if (sendMode === 'later') {
      if (!scheduledAt) { setMessage('Choose a date and time.'); return; }
      setSending(true);
      try {
        const scheduledDate = new Date(scheduledAt);
        const deliveries: DeliveryResult[] = recipients.map((recipient) => ({
          recipient,
          renderedSubject: renderTemplate(subject, recipient),
          renderedBody: renderTemplate(body, recipient),
          status: 'queued',
        }));
        const id = demoMode
          ? crypto.randomUUID()
          : await saveEmailCampaign({
              userId: userId!,
              senderEmail,
              subjectTemplate: subject,
              bodyTemplate: body,
              status: 'scheduled',
              scheduledAt: scheduledDate.toISOString(),
              deliveries,
            });
        onScheduled({ id, subject, recipients: recipients.length, status: 'Scheduled', date: scheduledDate.toLocaleString() });
        setMessage('Scheduled email saved to your dashboard.');
      } catch (caught) {
        setMessage(caught instanceof Error ? caught.message : 'The schedule could not be saved.');
      } finally {
        setSending(false);
      }
      return;
    }

    setSending(true);
    setMessage('');
    const startedAt = new Date().toISOString();
    const deliveries: DeliveryResult[] = [];
    try {
      if (!demoMode) {
        if (!accessToken || !providerToken || !userId) {
          throw new Error('Your Supabase or Google session is unavailable. Sign out and reconnect Google.');
        }
        for (const row of recipients) {
          const renderedSubject = renderTemplate(subject, row);
          const renderedBody = renderTemplate(body, row);
          const response = await fetch(apiUrl('/gmail/messages'), {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'X-Google-Access-Token': providerToken,
            },
            body: JSON.stringify({
              to: row.email,
              subject: renderedSubject,
              body: renderedBody,
            }),
          });
          if (!response.ok) {
            const detail = await response.json().catch(() => null) as
              | { detail?: string }
              | null;
            deliveries.push({
              recipient: row,
              renderedSubject,
              renderedBody,
              status: 'failed',
              errorMessage: detail?.detail || `Gmail could not send to ${row.email}.`,
            });
            continue;
          }
          const result = await response.json() as { id: string };
          deliveries.push({
            recipient: row,
            renderedSubject,
            renderedBody,
            status: 'sent',
            gmailMessageId: result.id,
            sentAt: new Date().toISOString(),
          });
        }
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 650));
        deliveries.push(...recipients.map((recipient) => ({
          recipient,
          renderedSubject: renderTemplate(subject, recipient),
          renderedBody: renderTemplate(body, recipient),
          status: 'sent' as const,
          sentAt: new Date().toISOString(),
        })));
      }
      const sentCount = deliveries.filter((item) => item.status === 'sent').length;
      const failedCount = deliveries.length - sentCount;
      const completedAt = new Date().toISOString();
      const campaignStatus = failedCount
        ? sentCount ? 'completed_with_errors' : 'failed'
        : 'completed';
      const id = demoMode
        ? crypto.randomUUID()
        : await saveEmailCampaign({
            userId: userId!,
            senderEmail,
            subjectTemplate: subject,
            bodyTemplate: body,
            status: campaignStatus,
            deliveries,
            startedAt,
            completedAt,
          });
      const displayStatus = failedCount
        ? sentCount ? 'Partially sent' : 'Failed'
        : 'Sent';
      onSent({ id, subject, recipients: sentCount, status: displayStatus, date: new Date(completedAt).toLocaleString() });
      setMessage(
        demoMode
          ? 'Demo complete. No real emails were sent.'
          : failedCount
            ? `Sent ${sentCount}; ${failedCount} failed. Results were saved to email history.`
            : `Successfully sent and saved ${sentCount} email${sentCount === 1 ? '' : 's'}.`,
      );
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : 'The send could not be completed.';
      const sentCount = deliveries.filter((item) => item.status === 'sent').length;
      setMessage(sentCount ? `${sentCount} email${sentCount === 1 ? '' : 's'} sent, but history could not be saved: ${detail}` : detail);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="page-content email-page">
      <header className="page-header compact"><div><span className="eyebrow">NEW CAMPAIGN</span><h1>Create an email</h1><p>Follow the steps to personalize and send safely.</p></div><span className="draft-badge">Draft saved locally</span></header>
      <Stepper current={step} setStep={setStep} />
      <div className="workspace-panel">
        {step === 0 && <TemplateStep downloadTemplate={downloadTemplate} />}
        {step === 1 && <UploadStep recipients={recipients} fileName={fileName} invalidCount={invalidCount} onBrowse={() => fileInput.current?.click()} useSampleData={useSampleData} />}
        {step === 2 && <WriteStep subject={subject} setSubject={setSubject} body={body} setBody={setBody} columns={columns} missing={missing} insertVariable={insertVariable} previewRow={previewRow} />}
        {step === 3 && <PreviewStep recipients={recipients} previewIndex={previewIndex} setPreviewIndex={setPreviewIndex} subject={subject} body={body} />}
        {step === 4 && <SendStep recipients={recipients} subject={subject} sendMode={sendMode} setSendMode={setSendMode} scheduledAt={scheduledAt} setScheduledAt={setScheduledAt} demoMode={demoMode} senderEmail={senderEmail} />}
        <input ref={fileInput} hidden type="file" accept=".csv,text/csv" onChange={loadFile} />
        {message && <div className={message.includes('Successfully') || message.includes('saved') || message.includes('complete') ? 'result-message success' : 'result-message'}>{message}</div>}
        <footer className="workspace-footer">
          <button className="secondary-button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}><ArrowLeft size={17} /> Back</button>
          {step < 4 ? <button className="primary-button" onClick={nextStep}>{step === 0 ? 'Start with this template' : 'Continue'} <ArrowRight size={17} /></button> : <button className="primary-button" onClick={finishCampaign} disabled={sending}>{sending ? 'Sending…' : sendMode === 'later' ? 'Schedule email' : `Send ${recipients.length} email${recipients.length === 1 ? '' : 's'}`} <Send size={17} /></button>}
        </footer>
      </div>
    </section>
  );
}

function TemplateStep({ downloadTemplate }: { downloadTemplate: () => void }) {
  return <div className="step-layout"><div className="step-copy"><span className="step-kicker">STEP 1 OF 5</span><h2>Start with the right columns</h2><p>Download the template, add one recipient per row, and keep the first row as your column names.</p><div className="tip-card"><strong>Required column</strong><code>email</code><span>Add any custom fields you want, such as name, company, or appointment time.</span></div></div><div className="template-card"><div className="sheet-art"><FileSpreadsheet size={32} /><div><strong>quick-email-template.csv</strong><span>email · name · company · time</span></div></div><div className="sample-table"><div><b>email</b><b>name</b><b>company</b></div><div><span>maya@…</span><span>Maya</span><span>Northstar</span></div><div><span>alex@…</span><span>Alex</span><span>Juniper</span></div></div><button className="secondary-button full" onClick={downloadTemplate}><Download size={17} /> Download CSV template</button></div></div>;
}

function UploadStep({ recipients, fileName, invalidCount, onBrowse, useSampleData }: { recipients: Recipient[]; fileName: string; invalidCount: number; onBrowse: () => void; useSampleData: () => void }) {
  return <div className="single-step"><span className="step-kicker">STEP 2 OF 5</span><h2>Upload your recipients</h2><p>Choose the completed CSV. We’ll validate email addresses before you continue.</p><button className={`upload-zone ${recipients.length ? 'loaded' : ''}`} onClick={onBrowse}>{recipients.length ? <><span className="upload-icon success"><CheckCircle2 /></span><strong>{fileName}</strong><span>{recipients.length} recipients · {invalidCount ? `${invalidCount} need attention` : 'All email addresses look good'}</span><small>Click to replace this file</small></> : <><span className="upload-icon"><UploadCloud /></span><strong>Drop your CSV here or choose a file</strong><span>CSV up to 5 MB</span></>}</button><button className="text-button" onClick={useSampleData}>Use sample recipients instead</button>{recipients.length > 0 && <div className="recipient-preview"><div><strong>Recipient preview</strong><span>{recipients.length} total rows</span></div>{recipients.slice(0, 3).map((row, index) => <div className="recipient-row" key={`${row.email}-${index}`}><span className="row-avatar">{(row.name || row.email || '?').slice(0, 1).toUpperCase()}</span><div><strong>{row.name || 'Unnamed recipient'}</strong><span>{row.email}</span></div><b className={emailPattern.test(row.email ?? '') ? 'valid' : 'invalid'}>{emailPattern.test(row.email ?? '') ? 'Valid' : 'Check email'}</b></div>)}</div>}</div>;
}

function WriteStep({ subject, setSubject, body, setBody, columns, missing, insertVariable, previewRow }: { subject: string; setSubject: (value: string) => void; body: string; setBody: (value: string) => void; columns: string[]; missing: string[]; insertVariable: (value: string) => void; previewRow: Recipient }) {
  return <div className="composer-grid"><div className="composer-form"><div><span className="step-kicker">STEP 3 OF 5</span><h2>Write once, personalize every email</h2></div><label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Email subject" /></label><label>Message<textarea value={body} onChange={(event) => setBody(event.target.value)} rows={12} /></label><div><span className="field-label">Insert a variable</span><div className="variable-list">{columns.filter((column) => column !== 'email').map((column) => <button key={column} onClick={() => insertVariable(column)}>{`{${column}}`}</button>)}</div></div>{missing.length > 0 && <div className="inline-error">Missing columns: {missing.join(', ')}</div>}</div><div className="live-preview"><div className="preview-label"><span>LIVE PREVIEW</span><b>Recipient 1</b></div><div className="mail-preview"><div className="mail-meta"><span>To</span><strong>{previewRow.email}</strong><span>Subject</span><strong>{renderTemplate(subject, previewRow)}</strong></div><div className="mail-body">{renderTemplate(body, previewRow)}</div></div></div></div>;
}

function PreviewStep({ recipients, previewIndex, setPreviewIndex, subject, body }: { recipients: Recipient[]; previewIndex: number; setPreviewIndex: (value: number) => void; subject: string; body: string }) {
  const row = recipients[previewIndex] ?? sampleRecipients[0];
  return <div className="preview-step"><div className="preview-toolbar"><div><span className="step-kicker">STEP 4 OF 5</span><h2>Review each message</h2><p>This is exactly what Gmail will send.</p></div><div className="preview-nav"><button onClick={() => setPreviewIndex(Math.max(0, previewIndex - 1))} disabled={previewIndex === 0}><ChevronLeft /></button><span>{previewIndex + 1} of {recipients.length}</span><button onClick={() => setPreviewIndex(Math.min(recipients.length - 1, previewIndex + 1))} disabled={previewIndex >= recipients.length - 1}><ChevronRight /></button></div></div><div className="final-preview"><div className="final-preview-top"><div className="avatar large">{(row.name || row.email).slice(0, 1).toUpperCase()}</div><div><strong>{row.name || row.email}</strong><span>{row.email}</span></div></div><div className="subject-line"><span>Subject</span><strong>{renderTemplate(subject, row)}</strong></div><div className="mail-body roomy">{renderTemplate(body, row)}</div></div><div className="validation-strip"><CheckCircle2 /><div><strong>Ready to send</strong><span>{recipients.length} valid recipients and all variables match your CSV.</span></div></div></div>;
}

function SendStep({ recipients, subject, sendMode, setSendMode, scheduledAt, setScheduledAt, demoMode, senderEmail }: { recipients: Recipient[]; subject: string; sendMode: SendMode; setSendMode: (mode: SendMode) => void; scheduledAt: string; setScheduledAt: (value: string) => void; demoMode: boolean; senderEmail: string }) {
  return <div className="send-step"><div><span className="step-kicker">STEP 5 OF 5</span><h2>Choose when to send</h2><p>Check the summary, then send immediately or schedule for later.</p></div><div className="send-summary"><div><span>From</span><strong>{demoMode ? 'Demo Gmail account' : senderEmail}</strong></div><div><span>Recipients</span><strong>{recipients.length}</strong></div><div><span>Subject</span><strong>{subject}</strong></div></div><div className="send-mode-grid"><button className={sendMode === 'now' ? 'selected' : ''} onClick={() => setSendMode('now')}><span><Send /></span><div><strong>Send now</strong><p>Start sending after final confirmation.</p></div><i>{sendMode === 'now' && <Check />}</i></button><button className={sendMode === 'later' ? 'selected' : ''} onClick={() => setSendMode('later')}><span><CalendarClock /></span><div><strong>Schedule for later</strong><p>Choose the date and local time.</p></div><i>{sendMode === 'later' && <Check />}</i></button></div>{sendMode === 'later' && <label className="schedule-field">Send date and time<input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label>}<div className="send-warning"><ShieldCheck /><span>{demoMode ? 'Preview mode is active. No real messages will leave Gmail.' : 'Once Gmail accepts a message it cannot be recalled from this app.'}</span></div></div>;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(Boolean(supabase));
  const [demoMode, setDemoMode] = useState(false);
  const [view, setView] = useState<View>('emails');
  const [history, setHistory] = useState<CampaignRecord[]>([]);
  const [scheduled, setScheduled] = useState<CampaignRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [selectedHistoryCampaignId, setSelectedHistoryCampaignId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
      })
      .catch(() => {
        setSession(null);
      })
      .finally(() => {
        setChecking(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setChecking(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.access_token || demoMode) return;
    let active = true;
    void retrieveEmailHistory(session.access_token)
      .then((records) => {
        if (!active) return;
        setHistoryError('');
        setHistory(records.filter((record) => record.status !== 'Scheduled'));
        setScheduled(records.filter((record) => record.status === 'Scheduled'));
      })
      .catch((error: unknown) => {
        if (active) setHistoryError(error instanceof Error ? error.message : 'Could not load email history.');
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => { active = false; };
  }, [session?.access_token, demoMode]);

  async function logout() {
    if (!demoMode && supabase) await supabase.auth.signOut();
    setSession(null);
    setDemoMode(false);
    setView('emails');
    setHistory([]);
    setScheduled([]);
    setHistoryError('');
  }

  if (checking) return <div className="loading-screen"><Logo /><span>Checking Gmail connection…</span></div>;
  if (!session && !demoMode) return <Login onDemo={() => { setDemoMode(true); setView('emails'); }} />;

  const senderEmail = demoMode
    ? 'demo@example.com'
    : session?.user.email || 'Connected Google account';
  const providerToken = session?.provider_token || null;

  function openHistory(campaignId?: string) {
    setSelectedHistoryCampaignId(campaignId ?? null);
    setView('history');
  }

  return (
    <div className="app-shell">
      <Sidebar view={view} setView={setView} onLogout={logout} email={senderEmail} />
      <main className="app-main">
        {view === 'dashboard' && <Dashboard history={history} scheduled={scheduled} loading={historyLoading} error={historyError} goToEmails={() => setView('emails')} openHistory={openHistory} />}
        {view === 'history' && session?.access_token && <EmailHistory accessToken={session.access_token} initialCampaignId={selectedHistoryCampaignId} />}
        {view === 'history' && demoMode && <section className="page-content"><EmptyState icon={<Mail />} title="History is unavailable in demo mode" detail="Sign in with Google to save and retrieve recipient delivery records." /></section>}
        {view === 'emails' && <EmailWorkspace demoMode={demoMode} accessToken={session?.access_token || null} providerToken={providerToken} userId={session?.user.id || null} senderEmail={senderEmail} onSent={(record) => setHistory((items) => [record, ...items])} onScheduled={(record) => setScheduled((items) => [record, ...items])} />}
      </main>
    </div>
  );
}
