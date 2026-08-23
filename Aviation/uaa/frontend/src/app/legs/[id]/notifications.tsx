'use client';

import { useEffect, useState } from 'react';
import {
  listNotifications,
  sendCrewNotification,
  sendTeamNotification,
  sendAgentServiceReport,
  getAgentWhatsAppLink,
  type NotificationComm,
} from '@/lib/api-client';

export default function Notifications({ legId }: { legId: string }) {
  const [notifications, setNotifications] = useState<NotificationComm[]>([]);
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    const token = localStorage.getItem('uaa_token');
    if (!token) return Promise.resolve();
    return listNotifications(token, legId)
      .then(setNotifications)
      .catch(() => setNotifications([]));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legId]);

  async function handleSend(label: string, action: (token: string) => Promise<unknown>) {
    const token = localStorage.getItem('uaa_token');
    if (!token) return;
    setSending(label);
    setError(null);
    try {
      await action(token);
      await refresh();
    } catch {
      setError(`Could not send the ${label} notification. Check the leg has the required contact details.`);
    } finally {
      setSending(null);
    }
  }

  async function handleWhatsApp() {
    const token = localStorage.getItem('uaa_token');
    if (!token) return;
    setSending('WhatsApp');
    setError(null);
    try {
      const { url } = await getAgentWhatsAppLink(token, legId);
      window.open(url, '_blank', 'noopener,noreferrer');
      await refresh();
    } catch {
      setError('Could not build a WhatsApp link. Check the leg has an agent phone number on file.');
    } finally {
      setSending(null);
    }
  }

  return (
    <fieldset className="notifications-section">
      <legend>Notifications</legend>

      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}

      <div className="notification-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={sending !== null}
          onClick={() => handleSend('Crew', (t) => sendCrewNotification(t, legId))}
        >
          {sending === 'Crew' ? 'Sending…' : 'Notify Crew'}
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={sending !== null}
          onClick={() => handleSend('Team', (t) => sendTeamNotification(t, legId))}
        >
          {sending === 'Team' ? 'Sending…' : 'Notify Team'}
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={sending !== null}
          onClick={() => handleSend('Agent Service Report', (t) => sendAgentServiceReport(t, legId))}
        >
          {sending === 'Agent Service Report' ? 'Sending…' : 'Request Agent Service Report'}
        </button>
        <button type="button" className="btn-primary" disabled={sending !== null} onClick={handleWhatsApp}>
          {sending === 'WhatsApp' ? 'Opening…' : 'WhatsApp Agent'}
        </button>
      </div>

      <table className="legs-table notifications-table">
        <thead>
          <tr>
            <th>Sent</th>
            <th>To</th>
            <th>Subject</th>
          </tr>
        </thead>
        <tbody>
          {notifications.map((n) => (
            <tr key={n.id}>
              <td className="col-mono">{new Date(n.sentAt).toLocaleString()}</td>
              <td>{n.toAddress}</td>
              <td>{n.subject}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </fieldset>
  );
}
