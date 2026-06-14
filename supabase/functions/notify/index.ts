// supabase/functions/notify/index.ts
//
// One email entry point for the collaboration layer, sent via Resend.
// Invoke from a Server Action after the DB mutation, e.g.:
//   await supabase.functions.invoke('notify', { body: { type: 'request_submitted', requestId } })
//
// Env (supabase secrets set ...):
//   RESEND_API_KEY, RESEND_FROM (e.g. "Family Calendar <calendar@yourdomain.com>"),
//   SITE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Types handled:
//   invitation         { invitationId }                 -> emails the invitee the join link
//   request_submitted  { requestId }                    -> emails family admins (approvers)
//   request_decided    { requestId }                    -> emails the requester the outcome
//   trip_added         { tripId }                        -> emails all family members

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const RESEND_FROM = Deno.env.get('RESEND_FROM')!;
const SITE_URL = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '');

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function page(title: string, bodyHtml: string) {
  return `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:520px;margin:0 auto;color:#1f2a37">
    <h2 style="color:#2b8fb3;margin:0 0 12px">${title}</h2>${bodyHtml}
    <p style="color:#8a95a3;font-size:12px;margin-top:24px">Family Calendar · a private shared calendar</p>
  </div>`;
}

async function send(to: string | string[], subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: RESEND_FROM, to: Array.isArray(to) ? to : [to], subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return res.json();
}

// emails of every member of a family (optionally only admins)
async function familyEmails(familyId: string, adminsOnly = false): Promise<string[]> {
  let q = admin.from('family_members').select('role, profiles(email)').eq('family_id', familyId);
  if (adminsOnly) q = q.eq('role', 'admin');
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((m: any) => m.profiles?.email).filter(Boolean);
}

const fmt = (d: string) =>
  new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { type, ...p } = await req.json();

    switch (type) {
      case 'invitation': {
        const { data: inv } = await admin.from('invitations')
          .select('email, token, role, families(name), households(name)')
          .eq('id', p.invitationId).single();
        if (!inv) throw new Error('invitation not found');
        const link = `${SITE_URL}/invite?token=${inv.token}`;
        await send(inv.email, `You're invited to ${(inv as any).families?.name ?? 'a family calendar'}`,
          page('You have been invited', `
            <p>You've been invited to join <b>${(inv as any).families?.name ?? 'the family calendar'}</b>${
              (inv as any).households?.name ? ` (${(inv as any).households.name})` : ''} as <b>${inv.role}</b>.</p>
            <p><a href="${link}" style="background:#2b8fb3;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Accept invitation</a></p>
            <p style="color:#8a95a3;font-size:12px">Or paste this link: ${link}</p>`));
        break;
      }

      case 'request_submitted': {
        const { data: r } = await admin.from('time_requests')
          .select('family_id, title, request_type, start_date, end_date, note, profiles:requester_id(display_name)')
          .eq('id', p.requestId).single();
        if (!r) throw new Error('request not found');
        const to = await familyEmails(r.family_id, true);
        await send(to, `New time request: ${r.title}`,
          page('New extra-time request', `
            <p><b>${(r as any).profiles?.display_name ?? 'A parent'}</b> requested time:</p>
            <p style="background:#f1f6f9;padding:12px;border-radius:8px">
              <b>${r.title}</b> (${r.request_type})<br>${fmt(r.start_date)} – ${fmt(r.end_date)}
              ${r.note ? `<br><span style="color:#5a6573">${r.note}</span>` : ''}</p>
            <p><a href="${SITE_URL}/exceptions" style="color:#2b8fb3">Review &amp; respond →</a></p>`));
        break;
      }

      case 'request_decided': {
        const { data: r } = await admin.from('time_requests')
          .select('title, status, decision_note, proposed_start_date, proposed_end_date, profiles:requester_id(email)')
          .eq('id', p.requestId).single();
        if (!r) throw new Error('request not found');
        const email = (r as any).profiles?.email;
        const headline = r.status === 'approved' ? 'approved ✓'
          : r.status === 'denied' ? 'declined'
          : r.status === 'countered' ? 'has a proposed alternative' : r.status;
        const counter = r.status === 'countered' && r.proposed_start_date
          ? `<p>Proposed instead: <b>${fmt(r.proposed_start_date)} – ${fmt(r.proposed_end_date!)}</b></p>` : '';
        if (email) await send(email, `Your request "${r.title}" was ${headline}`,
          page(`Your request was ${headline}`, `
            <p><b>${r.title}</b></p>${counter}
            ${r.decision_note ? `<p style="color:#5a6573">“${r.decision_note}”</p>` : ''}
            <p><a href="${SITE_URL}/exceptions" style="color:#2b8fb3">Open calendar →</a></p>`));
        break;
      }

      case 'trip_added': {
        const { data: t } = await admin.from('trips')
          .select('family_id, title, destination, start_date, end_date, households(name)')
          .eq('id', p.tripId).single();
        if (!t) throw new Error('trip not found');
        const to = await familyEmails(t.family_id);
        await send(to, `Trip added: ${t.title}`,
          page('A trip was added', `
            <p><b>${t.title}</b>${t.destination ? ` — ${t.destination}` : ''}</p>
            <p>${fmt(t.start_date)} – ${fmt(t.end_date)}${
              (t as any).households?.name ? ` · with ${(t as any).households.name}` : ''}</p>
            <p style="color:#8a95a3;font-size:12px">Flight &amp; lodging details are on the trip in the app.</p>
            <p><a href="${SITE_URL}/calendar" style="color:#2b8fb3">View calendar →</a></p>`));
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `unknown type ${type}` }), { status: 400, headers: cors });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
