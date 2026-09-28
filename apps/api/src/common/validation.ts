import type { IsURLOptions } from 'validator';

// User-supplied links are rendered as <a href>/<img src>/<iframe> on public
// pages, so only real http(s) URLs are accepted — never javascript: or data:.
export const HTTP_URL_OPTIONS: IsURLOptions = { require_protocol: true, protocols: ['http', 'https'] };

export const urlMessage = (field: string) => `${field} must be a full link starting with https://`;
