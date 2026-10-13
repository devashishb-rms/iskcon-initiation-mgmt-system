import { pageOf, reviewQueueItem, type Page, type ReviewQueueItem } from '@iskcon/contracts';
import { request } from './request';

export const reviewApi = {
  queue: (page: number, pageSize = 50): Promise<Page<ReviewQueueItem>> =>
    request('/review-queue', { query: { page, pageSize }, schema: pageOf(reviewQueueItem) }),
};
