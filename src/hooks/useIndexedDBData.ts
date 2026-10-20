import { useState, useEffect } from 'react';
import { MessageType } from '@/lib/message-types';

export function useIndexedDBCalendars(userEmail: string | null) {
  const [calendars, setCalendars] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userEmail) {
      setCalendars([]);
      return;
    }

    setIsLoading(true);
    chrome.runtime.sendMessage({
      type: MessageType.GET_CALENDARS,
      userEmail
    }).then(response => {
      if (response.success) {
        setCalendars(response.data);
      } else {
        setError(response.error);
      }
    }).catch(err => {
      setError(err.message);
    }).finally(() => {
      setIsLoading(false);
    });
  }, [userEmail]);

  return { calendars, isLoading, error };
}

export function useIndexedDBEvents(
  userEmail: string | null,
  startDate: Date | null,
  endDate: Date | null
) {
  const [events, setEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userEmail || !startDate || !endDate) {
      setEvents([]);
      return;
    }

    setIsLoading(true);
    chrome.runtime.sendMessage({
      type: MessageType.GET_EVENTS_BY_RANGE,
      userEmail,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    }).then(response => {
      if (response.success) {
        setEvents(response.data);
      } else {
        setError(response.error);
      }
    }).catch(err => {
      setError(err.message);
    }).finally(() => {
      setIsLoading(false);
    });
  }, [userEmail, startDate?.toISOString(), endDate?.toISOString()]);

  return { events, isLoading, error };
}
