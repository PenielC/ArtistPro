import { IsIn } from 'class-validator';

// PARTIALLY_PAID / PAID are never set by hand — recording a payment moves the
// invoice there automatically.
export const MANUAL_INVOICE_STATUSES = ['DRAFT', 'SENT', 'VOID'] as const;
export type ManualInvoiceStatus = (typeof MANUAL_INVOICE_STATUSES)[number];

export class UpdateInvoiceStatusDto {
  @IsIn(MANUAL_INVOICE_STATUSES)
  status!: ManualInvoiceStatus;
}
