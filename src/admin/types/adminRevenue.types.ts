/**
 * Admin revenue types.
 * TODO: Align with real Bizzi Cloud API responses.
 */

export interface RevenueByPlan {
  plan: string;
  mrr: number;
  users: number;
}

export interface RevenueDataPoint {
  date: string;
  mrr: number;
  revenue: number;
  cost: number;
}
