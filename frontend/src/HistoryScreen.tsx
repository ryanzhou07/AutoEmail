import { CalendarClock, Mail, Search, Send, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { apiUrl, responseError } from './api';

type Campaign = {
  id: string;
  subject_template: string;
  status: string;
  scheduled_at: string | null;
  total_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
};

type Recipient = {
  id: string;
  email_address: string;
  recipient_name: string | null;
  merge_data: Record<string, string>;
  rendered_subject: string | null;
  rendered_body: string | null;
  status: string;
  gmail_message_id: string | null;
  error_message: string | null;
  attempt_count: number;
  sent_at: string | null;
};

type Props = {
  accessToken: string;
  initialCampaignId?: string | null;
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not sent yet';
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ');
}

export function EmailHistory({ accessToken, initialCampaignId }: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<string | null>(initialCampaignId ?? null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingRecipients, setLoadingRecipients] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void fetch(apiUrl('/email-history/campaigns?limit=100'), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        if (!response.ok) throw await responseError(response, 'Could not load email campaigns.');
        return response.json() as Promise<{ items: Campaign[] }>;
      })
      .then(({ items }) => {
        if (!active) return;
        setCampaigns(items);
        setError('');
        if (!items.length) setLoadingRecipients(false);
        setCampaignId((current) => {
          if (current && items.some((item) => item.id === current)) return current;
          return items[0]?.id ?? null;
        });
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Could not load email campaigns.');
      })
      .finally(() => {
        if (active) setLoadingCampaigns(false);
      });
    return () => { active = false; };
  }, [accessToken]);

  useEffect(() => {
    if (!campaignId) return;
    let active = true;
    void fetch(apiUrl(`/email-history/campaigns/${campaignId}/recipients?limit=500`), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        if (!response.ok) throw await responseError(response, 'Could not load campaign recipients.');
        return response.json() as Promise<{ items: Recipient[] }>;
      })
      .then(({ items }) => {
        if (!active) return;
        setRecipients(items);
        setRecipientId(items[0]?.id ?? null);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Could not load campaign recipients.');
      })
      .finally(() => {
        if (active) setLoadingRecipients(false);
      });
    return () => { active = false; };
  }, [accessToken, campaignId]);

  const selectedCampaign = campaigns.find((item) => item.id === campaignId) ?? null;
  const filteredRecipients = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return recipients;
    return recipients.filter((recipient) =>
      recipient.email_address.toLowerCase().includes(query)
      || recipient.recipient_name?.toLowerCase().includes(query),
    );
  }, [recipients, search]);
  const selectedRecipient = recipients.find((item) => item.id === recipientId) ?? null;

  function selectCampaign(id: string) {
    setCampaignId(id);
    setRecipients([]);
    setRecipientId(null);
    setSearch('');
    setError('');
    setLoadingRecipients(true);
  }

  return (
    <section className="page-content history-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">DELIVERY RECORDS</span>
          <h1>Email history</h1>
          <p>Review campaigns, recipients, and the exact Gmail content sent.</p>
        </div>
      </header>

      {error && <div className="inline-error history-error">{error}</div>}

      <div className="history-shell">
        <aside className="campaign-browser">
          <div className="history-section-title">
            <div><strong>Campaigns</strong><span>{campaigns.length} total</span></div>
            <Mail size={18} />
          </div>
          {loadingCampaigns ? (
            <p className="history-placeholder">Loading campaigns…</p>
          ) : campaigns.length ? (
            <div className="campaign-list">
              {campaigns.map((campaign) => (
                <button
                  className={campaign.id === campaignId ? 'selected' : ''}
                  key={campaign.id}
                  onClick={() => selectCampaign(campaign.id)}
                >
                  <span className="campaign-list-icon">
                    {campaign.status === 'scheduled' ? <CalendarClock /> : <Send />}
                  </span>
                  <span>
                    <strong>{campaign.subject_template}</strong>
                    <small>{campaign.total_count} recipients · {formatDate(campaign.scheduled_at || campaign.created_at)}</small>
                  </span>
                  <b>{statusLabel(campaign.status)}</b>
                </button>
              ))}
            </div>
          ) : (
            <p className="history-placeholder">No campaigns have been saved yet.</p>
          )}
        </aside>

        <div className="recipient-browser">
          <div className="history-section-title recipient-heading">
            <div>
              <strong>{selectedCampaign?.subject_template || 'Recipients'}</strong>
              <span>{selectedCampaign ? `${selectedCampaign.sent_count} sent · ${selectedCampaign.failed_count} failed` : 'Select a campaign'}</span>
            </div>
            <Users size={18} />
          </div>
          <label className="history-search">
            <Search size={17} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search recipient email…"
              disabled={!campaignId}
            />
          </label>
          {loadingRecipients ? (
            <p className="history-placeholder">Loading recipients…</p>
          ) : filteredRecipients.length ? (
            <div className="history-recipient-list">
              {filteredRecipients.map((recipient) => (
                <button
                  className={recipient.id === recipientId ? 'selected' : ''}
                  key={recipient.id}
                  onClick={() => setRecipientId(recipient.id)}
                >
                  <span className="row-avatar">{(recipient.recipient_name || recipient.email_address).slice(0, 1).toUpperCase()}</span>
                  <span>
                    <strong>{recipient.recipient_name || 'Unnamed recipient'}</strong>
                    <small>{recipient.email_address}</small>
                  </span>
                  <b className={`delivery-status ${recipient.status}`}>{statusLabel(recipient.status)}</b>
                </button>
              ))}
            </div>
          ) : (
            <p className="history-placeholder">{search ? 'No recipient emails match your search.' : 'No recipients found.'}</p>
          )}
        </div>

        <article className="gmail-record">
          {selectedRecipient ? (
            <>
              <div className="gmail-record-header">
                <div>
                  <span className="eyebrow">GMAIL RECORD</span>
                  <h2>{selectedRecipient.recipient_name || selectedRecipient.email_address}</h2>
                  <p>{selectedRecipient.email_address}</p>
                </div>
                <b className={`delivery-status ${selectedRecipient.status}`}>{statusLabel(selectedRecipient.status)}</b>
              </div>
              <dl className="gmail-metadata">
                <div><dt>Sent</dt><dd>{formatDate(selectedRecipient.sent_at)}</dd></div>
                <div><dt>Attempts</dt><dd>{selectedRecipient.attempt_count}</dd></div>
                <div className="wide"><dt>Gmail message ID</dt><dd><code>{selectedRecipient.gmail_message_id || 'Not assigned'}</code></dd></div>
              </dl>
              {selectedRecipient.error_message && <div className="inline-error history-error">{selectedRecipient.error_message}</div>}
              <div className="gmail-message">
                <div><span>To</span><strong>{selectedRecipient.email_address}</strong></div>
                <div><span>Subject</span><strong>{selectedRecipient.rendered_subject || 'No subject recorded'}</strong></div>
                <p>{selectedRecipient.rendered_body || 'No message body recorded.'}</p>
              </div>
              {Object.keys(selectedRecipient.merge_data).length > 0 && (
                <div className="merge-data">
                  <strong>CSV data</strong>
                  <div>{Object.entries(selectedRecipient.merge_data).map(([key, value]) => <span key={key}><b>{key}</b>{value}</span>)}</div>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state gmail-empty"><span><Mail /></span><strong>Select a recipient</strong><p>The Gmail delivery record will appear here.</p></div>
          )}
        </article>
      </div>
    </section>
  );
}
