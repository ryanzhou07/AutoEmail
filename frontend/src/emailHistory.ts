import { supabase } from './supabase';

export type DeliveryResult = {
  recipient: Record<string, string>;
  renderedSubject: string;
  renderedBody: string;
  status: 'queued' | 'sent' | 'failed';
  gmailMessageId?: string;
  errorMessage?: string;
  sentAt?: string;
};

type SaveCampaignInput = {
  userId: string;
  senderEmail: string;
  subjectTemplate: string;
  bodyTemplate: string;
  status: 'scheduled' | 'completed' | 'completed_with_errors' | 'failed';
  deliveries: DeliveryResult[];
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
};

export async function saveEmailCampaign(input: SaveCampaignInput): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const sentCount = input.deliveries.filter((item) => item.status === 'sent').length;
  const failedCount = input.deliveries.filter((item) => item.status === 'failed').length;
  const { data: campaign, error: campaignError } = await supabase
    .from('email_campaigns')
    .insert({
      user_id: input.userId,
      name: input.subjectTemplate,
      sender_email: input.senderEmail,
      subject_template: input.subjectTemplate,
      body_template: input.bodyTemplate,
      status: input.status,
      scheduled_at: input.scheduledAt ?? null,
      scheduled_timezone: input.scheduledAt
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : null,
      total_count: input.deliveries.length,
      sent_count: sentCount,
      failed_count: failedCount,
      started_at: input.startedAt ?? null,
      completed_at: input.completedAt ?? null,
    })
    .select('id')
    .single();

  if (campaignError || !campaign) {
    throw new Error(campaignError?.message || 'Could not save email history.');
  }

  const { error: recipientError } = await supabase.from('email_recipients').insert(
    input.deliveries.map((delivery, index) => ({
      campaign_id: campaign.id,
      user_id: input.userId,
      source_row_number: index + 1,
      email_address: delivery.recipient.email,
      recipient_name: delivery.recipient.name || null,
      merge_data: delivery.recipient,
      rendered_subject: delivery.renderedSubject,
      rendered_body: delivery.renderedBody,
      status: delivery.status,
      gmail_message_id: delivery.gmailMessageId ?? null,
      error_message: delivery.errorMessage ?? null,
      attempt_count: delivery.status === 'queued' ? 0 : 1,
      sent_at: delivery.sentAt ?? null,
    })),
  );

  if (recipientError) {
    await supabase.from('email_campaigns').delete().eq('id', campaign.id);
    throw new Error(recipientError.message || 'Could not save recipient history.');
  }

  return campaign.id as string;
}
