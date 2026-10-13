import { notificationDto, pageOf, type NotificationDto, type Page } from '@iskcon/contracts';
import { request, requestWithHeaders } from './request';

export interface NotificationPage extends Page<NotificationDto> {
  unread: number;
}

export const notificationsApi = {
  list: async (page = 1, pageSize = 20): Promise<NotificationPage> => {
    const { data, headers } = await requestWithHeaders('/notifications', { query: { page, pageSize }, schema: pageOf(notificationDto) });
    const n = Number(headers.get('x-unread-count'));
    return { ...data, unread: Number.isFinite(n) ? n : 0 };
  },
  markRead: (id: string) => request<void>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => request<void>('/notifications/read-all', { method: 'POST' }),
};
