export enum Location {
  Onsite = 'Onsite',
  Offshore = 'Offshore',
}

export interface Release {
  id: string;
  name: string;
  startMonth: string; // YYYY-MM
  endMonth: string;   // YYYY-MM
}

export interface Resource {
  id: string;
  name: string;
  role: string;
  location: Location;
  rateCAD: number;
}

export interface Allocation {
  id: string;
  releaseId: string;
  resourceId: string;
  monthStr: string; // YYYY-MM
  percentage: number; // 0.0 to 1.0
}

export interface MonthlyCostBreakdown {
  monthStr: string;
  costUSD: number;
  hours: number;
  allocations: {
    resourceName: string;
    costUSD: number;
    percentage: number;
  }[];
}

export const CONSTANTS = {
  USD_TO_CAD: 1.32,
  DAYS_PER_MONTH: 21,
  HOURS_ONSITE: 8,
  HOURS_OFFSHORE: 9,
};