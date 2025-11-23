import { Release, Resource, Allocation, Location, CONSTANTS } from './types';

// --- Date Helpers ---

export const getMonthList = (startStr: string, endStr: string): string[] => {
  if (!startStr || !endStr) return [];
  const start = new Date(startStr + '-02'); // Avoid timezone issues by picking 2nd
  const end = new Date(endStr + '-02');
  const months: string[] = [];
  
  const current = new Date(start);
  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    months.push(`${y}-${m}`);
    current.setMonth(current.getMonth() + 1);
  }
  return months;
};

export const formatCurrency = (val: number, currency: 'USD' | 'CAD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(val);
};

// --- Calculation Helpers ---

export const calculateMonthlyResourceCostUSD = (
  resource: Resource,
  allocationPercentage: number
): number => {
  const dailyHours = resource.location === Location.Onsite 
    ? CONSTANTS.HOURS_ONSITE 
    : CONSTANTS.HOURS_OFFSHORE;
  
  const totalMonthlyHours = CONSTANTS.DAYS_PER_MONTH * dailyHours;
  
  // Rate is CAD/hr (implied, or daily? Usually rate is hourly in these tools. 
  // Prompt says "Display the rate... sum up cost". Assuming hourly rate input based on standard practice,
  // but if rate is daily/monthly, math changes. Sticking to Hourly Rate logic based on "8 hours a day" context).
  
  // Convert CAD Rate to USD Rate
  // 1 USD = 1.32 CAD => 1 CAD = 1 / 1.32 USD
  const rateUSD = resource.rateCAD / CONSTANTS.USD_TO_CAD;
  
  return rateUSD * totalMonthlyHours * allocationPercentage;
};

export const calculateReleaseTotalCostUSD = (
  release: Release,
  resources: Resource[],
  allocations: Allocation[]
): number => {
  const months = getMonthList(release.startMonth, release.endMonth);
  let total = 0;
  
  // Filter allocations for this release first to optimize
  const relAllocations = allocations.filter(a => a.releaseId === release.id);

  relAllocations.forEach(alloc => {
    // Only count if within the release date range (handles cases where date range might have shrunk)
    if (months.includes(alloc.monthStr)) {
      const res = resources.find(r => r.id === alloc.resourceId);
      if (res) {
        total += calculateMonthlyResourceCostUSD(res, alloc.percentage);
      }
    }
  });
  
  return total;
};

// --- CSV Helpers ---

export const generateCSV = (
  releases: Release[],
  resources: Resource[],
  allocations: Allocation[]
): string => {
  const headers = [
    'Release Name', 'Start Month', 'End Month',
    'Resource Name', 'Role', 'Location', 'Rate (CAD)',
    'Month', 'Allocation %', 'Monthly Cost (USD)'
  ].join(',');

  const rows: string[] = [];

  releases.forEach(rel => {
    // Find allocations for this release
    const relAllocations = allocations.filter(a => a.releaseId === rel.id);
    // Group by resource to ensure we list even resources with 0 allocation if they are associated (optional, 
    // but here we just iterate existing allocations or cartesian product of active months).
    // The prompt says "Export monthly summary data".
    
    // We iterate months for the release
    const months = getMonthList(rel.startMonth, rel.endMonth);
    
    // Get unique resources allocated to this release at any point
    const uniqueResIds = Array.from(new Set(relAllocations.map(a => a.resourceId)));
    
    uniqueResIds.forEach(resId => {
      const res = resources.find(r => r.id === resId);
      if (!res) return;

      months.forEach(month => {
        const alloc = allocations.find(a => 
          a.releaseId === rel.id && 
          a.resourceId === res.id && 
          a.monthStr === month
        );
        const pct = alloc ? alloc.percentage : 0;
        const cost = calculateMonthlyResourceCostUSD(res, pct);

        rows.push([
          `"${rel.name}"`,
          rel.startMonth,
          rel.endMonth,
          `"${res.name}"`,
          `"${res.role}"`,
          res.location,
          res.rateCAD,
          month,
          pct,
          cost.toFixed(2)
        ].join(','));
      });
    });
  });

  return [headers, ...rows].join('\n');
};

export const parseCSV = (csvText: string): { 
  releases: Release[], 
  resources: Resource[], 
  allocations: Allocation[] 
} => {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(','); // Assume standard format

  const newReleases: Release[] = [];
  const newResources: Resource[] = [];
  const newAllocations: Allocation[] = [];

  // Helper maps to deduplicate
  const releaseMap = new Map<string, string>(); // Name -> ID
  const resourceMap = new Map<string, string>(); // Name -> ID

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
    // Basic CSV regex split handling quoted strings
    if (!row) continue;
    
    // Clean quotes
    const clean = (s: string) => s ? s.replace(/^"|"$/g, '').trim() : '';

    const relName = clean(row[0]);
    const startMonth = clean(row[1]);
    const endMonth = clean(row[2]);
    const resName = clean(row[3]);
    const resRole = clean(row[4]);
    const resLoc = clean(row[5]) as Location;
    const resRate = parseFloat(clean(row[6]));
    const month = clean(row[7]);
    const allocPct = parseFloat(clean(row[8]));

    if (!relName || !resName) continue;

    // 1. Handle Release
    let relId = releaseMap.get(relName);
    if (!relId) {
      relId = crypto.randomUUID();
      releaseMap.set(relName, relId);
      newReleases.push({
        id: relId,
        name: relName,
        startMonth,
        endMonth
      });
    }

    // 2. Handle Resource
    let resId = resourceMap.get(resName);
    if (!resId) {
      resId = crypto.randomUUID();
      resourceMap.set(resName, resId);
      newResources.push({
        id: resId,
        name: resName,
        role: resRole,
        location: resLoc,
        rateCAD: resRate
      });
    }

    // 3. Handle Allocation
    // Only add if allocation > 0 or it exists in file
    newAllocations.push({
      id: crypto.randomUUID(),
      releaseId: relId,
      resourceId: resId,
      monthStr: month,
      percentage: allocPct
    });
  }

  return { releases: newReleases, resources: newResources, allocations: newAllocations };
};