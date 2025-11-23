import React, { useState, useMemo } from 'react';
import { 
  Users, Calendar, DollarSign, Upload, Download, 
  Plus, Trash2, TrendingUp, Briefcase, ChevronRight, BrainCircuit, UserPlus, X
} from 'lucide-react';
import { Release, Resource, Allocation, Location, CONSTANTS } from './types';
import { getMonthList, calculateMonthlyResourceCostUSD, calculateReleaseTotalCostUSD, generateCSV, parseCSV, formatCurrency } from './utils';
import { generateExecutiveSummary } from './services/geminiService';

const App: React.FC = () => {
  // --- State ---
  const [activeTab, setActiveTab] = useState<'releases' | 'resources' | 'allocation' | 'reports'>('releases');
  
  const [releases, setReleases] = useState<Release[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  
  // Forms State
  const [newRelease, setNewRelease] = useState<Partial<Release>>({ name: '', startMonth: '', endMonth: '' });
  const [newResource, setNewResource] = useState<Partial<Resource>>({ name: '', role: '', location: Location.Offshore, rateCAD: 0 });
  const [selectedReleaseId, setSelectedReleaseId] = useState<string>('');
  
  // Allocation View State
  const [resourceToAddId, setResourceToAddId] = useState<string>('');

  // AI State
  const [aiSummary, setAiSummary] = useState<string>('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // --- Actions ---

  const handleAddRelease = () => {
    if (newRelease.name && newRelease.startMonth && newRelease.endMonth) {
      const id = crypto.randomUUID();
      setReleases([...releases, { ...newRelease, id } as Release]);
      setNewRelease({ name: '', startMonth: '', endMonth: '' });
      if (!selectedReleaseId) setSelectedReleaseId(id);
    }
  };

  const handleDeleteRelease = (id: string) => {
    setReleases(releases.filter(r => r.id !== id));
    setAllocations(allocations.filter(a => a.releaseId !== id));
    if (selectedReleaseId === id) setSelectedReleaseId('');
  };

  const handleAddResource = () => {
    if (newResource.name && newResource.role && newResource.rateCAD) {
      setResources([...resources, { ...newResource, id: crypto.randomUUID() } as Resource]);
      setNewResource({ name: '', role: '', location: Location.Offshore, rateCAD: 0 });
    }
  };

  const handleAssignResourceToRelease = () => {
    if (!selectedReleaseId || !resourceToAddId) return;
    
    const release = releases.find(r => r.id === selectedReleaseId);
    if (!release) return;

    const months = getMonthList(release.startMonth, release.endMonth);
    const newAllocations: Allocation[] = months.map(m => ({
        id: crypto.randomUUID(),
        releaseId: release.id,
        resourceId: resourceToAddId,
        monthStr: m,
        percentage: 1 // Default to 100% allocation
    }));

    setAllocations([...allocations, ...newAllocations]);
    setResourceToAddId('');
  };

  const handleRemoveResourceFromRelease = (resourceId: string) => {
    if (!selectedReleaseId) return;
    setAllocations(allocations.filter(a => !(a.releaseId === selectedReleaseId && a.resourceId === resourceId)));
  };

  const handleUpdateAllocation = (releaseId: string, resourceId: string, monthStr: string, val: number) => {
    const existingIndex = allocations.findIndex(
      a => a.releaseId === releaseId && a.resourceId === resourceId && a.monthStr === monthStr
    );

    const newAllocation: Allocation = {
      id: existingIndex >= 0 ? allocations[existingIndex].id : crypto.randomUUID(),
      releaseId,
      resourceId,
      monthStr,
      percentage: val
    };

    if (existingIndex >= 0) {
      const updated = [...allocations];
      updated[existingIndex] = newAllocation;
      setAllocations(updated);
    } else {
      setAllocations([...allocations, newAllocation]);
    }
  };

  const handleExportCSV = () => {
    const csv = generateCSV(releases, resources, allocations);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estimate_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const parsed = parseCSV(text);
      setReleases(parsed.releases);
      setResources(parsed.resources);
      setAllocations(parsed.allocations);
      if (parsed.releases.length > 0) setSelectedReleaseId(parsed.releases[0].id);
      alert(`Imported ${parsed.releases.length} releases and ${parsed.resources.length} resources.`);
    };
    reader.readAsText(file);
  };

  const handleGenerateSummary = async () => {
    const rel = releases.find(r => r.id === selectedReleaseId);
    if (!rel) return;
    setIsGeneratingAi(true);
    setAiSummary('');
    const summary = await generateExecutiveSummary(rel, resources, allocations);
    setAiSummary(summary);
    setIsGeneratingAi(false);
  };

  // --- Derived Data for UI ---
  const activeRelease = releases.find(r => r.id === selectedReleaseId);
  const activeReleaseMonths = activeRelease ? getMonthList(activeRelease.startMonth, activeRelease.endMonth) : [];
  
  // Calculate Costs for Report
  const costData = useMemo(() => {
    if (!activeRelease) return { total: 0, byMonth: [], byResource: [] };

    let totalReleaseCost = 0;
    const byMonth: Record<string, number> = {};
    const byResource: Record<string, number> = {};

    activeReleaseMonths.forEach(m => byMonth[m] = 0);
    resources.forEach(r => byResource[r.id] = 0);

    allocations.filter(a => a.releaseId === activeRelease.id).forEach(alloc => {
      const resource = resources.find(r => r.id === alloc.resourceId);
      if (resource && activeReleaseMonths.includes(alloc.monthStr)) {
        const cost = calculateMonthlyResourceCostUSD(resource, alloc.percentage);
        totalReleaseCost += cost;
        byMonth[alloc.monthStr] = (byMonth[alloc.monthStr] || 0) + cost;
        byResource[resource.id] = (byResource[resource.id] || 0) + cost;
      }
    });

    return { total: totalReleaseCost, byMonth, byResource };
  }, [allocations, activeRelease, resources, activeReleaseMonths]);


  // --- Render Components ---

  const renderReleaseManager = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-corporate-800 mb-4 flex items-center gap-2">
          <Plus size={20} /> Create New Release
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Release Name</label>
            <input 
              type="text" 
              className="w-full bg-slate-800 text-white border border-slate-600 rounded p-2 focus:ring-2 focus:ring-corporate-500 outline-none placeholder-slate-400"
              value={newRelease.name}
              onChange={e => setNewRelease({...newRelease, name: e.target.value})}
              placeholder="e.g. Q4 Migration"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Start Month</label>
            <input 
              type="month" 
              className="w-full bg-slate-800 text-white border border-slate-600 rounded p-2 focus:ring-2 focus:ring-corporate-500 outline-none placeholder-slate-400"
              value={newRelease.startMonth}
              onChange={e => setNewRelease({...newRelease, startMonth: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">End Month</label>
            <input 
              type="month" 
              className="w-full bg-slate-800 text-white border border-slate-600 rounded p-2 focus:ring-2 focus:ring-corporate-500 outline-none placeholder-slate-400"
              value={newRelease.endMonth}
              onChange={e => setNewRelease({...newRelease, endMonth: e.target.value})}
            />
          </div>
          <button 
            onClick={handleAddRelease}
            className="bg-corporate-600 text-white px-4 py-2 rounded hover:bg-corporate-700 transition-colors font-semibold"
          >
            Add Release
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {releases.map(rel => (
          <div key={rel.id} className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-corporate-500 flex justify-between items-center group hover:shadow-md transition-all">
            <div>
              <h3 className="font-bold text-lg text-slate-800">{rel.name}</h3>
              <p className="text-sm text-slate-500">{rel.startMonth} to {rel.endMonth}</p>
            </div>
            <button onClick={() => handleDeleteRelease(rel.id)} className="text-slate-400 hover:text-red-500 transition-colors">
              <Trash2 size={18} />
            </button>
          </div>
        ))}
        {releases.length === 0 && (
          <div className="col-span-full text-center py-10 text-slate-400 italic">
            No releases created yet. Start by adding one above.
          </div>
        )}
      </div>
    </div>
  );

  const renderResourceManager = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-corporate-800 mb-4 flex items-center gap-2">
          <Users size={20} /> Add Resource
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-slate-600 mb-1">Full Name</label>
            <input 
              type="text" 
              className="w-full bg-slate-800 text-white border border-slate-600 rounded p-2 focus:ring-2 focus:ring-corporate-500 outline-none placeholder-slate-400"
              value={newResource.name}
              onChange={e => setNewResource({...newResource, name: e.target.value})}
              placeholder="e.g. Jane Doe"
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-slate-600 mb-1">Role</label>
            <input 
              type="text" 
              className="w-full bg-slate-800 text-white border border-slate-600 rounded p-2 focus:ring-2 focus:ring-corporate-500 outline-none placeholder-slate-400"
              value={newResource.role}
              onChange={e => setNewResource({...newResource, role: e.target.value})}
              placeholder="e.g. Senior Dev"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Location</label>
            <select 
              className="w-full bg-slate-800 text-white border border-slate-600 rounded p-2 focus:ring-2 focus:ring-corporate-500 outline-none"
              value={newResource.location}
              onChange={e => setNewResource({...newResource, location: e.target.value as Location})}
            >
              <option value={Location.Offshore}>Offshore (9hr)</option>
              <option value={Location.Onsite}>Onsite (8hr)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Rate (CAD/hr)</label>
            <input 
              type="number" 
              className="w-full bg-slate-800 text-white border border-slate-600 rounded p-2 focus:ring-2 focus:ring-corporate-500 outline-none placeholder-slate-400"
              value={newResource.rateCAD || ''}
              onChange={e => setNewResource({...newResource, rateCAD: parseFloat(e.target.value)})}
              placeholder="0.00"
            />
          </div>
          <button 
            onClick={handleAddResource}
            className="bg-corporate-600 text-white px-4 py-2 rounded hover:bg-corporate-700 transition-colors font-semibold"
          >
            Add Resource
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="p-4 font-semibold text-slate-600">Name</th>
              <th className="p-4 font-semibold text-slate-600">Role</th>
              <th className="p-4 font-semibold text-slate-600">Location</th>
              <th className="p-4 font-semibold text-slate-600 text-right">Rate (CAD)</th>
              <th className="p-4 font-semibold text-slate-600 text-right">Rate (USD Est.)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {resources.map(res => (
              <tr key={res.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-4 font-medium text-slate-800">{res.name}</td>
                <td className="p-4 text-slate-600">{res.role}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${res.location === Location.Onsite ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                    {res.location}
                  </span>
                </td>
                <td className="p-4 text-right text-slate-700 font-mono">{formatCurrency(res.rateCAD, 'CAD')}</td>
                <td className="p-4 text-right text-slate-500 font-mono text-sm">
                  {formatCurrency(res.rateCAD / CONSTANTS.USD_TO_CAD, 'USD')}
                </td>
              </tr>
            ))}
            {resources.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-slate-400 italic">No resources available.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderAllocation = () => {
    if (!activeRelease) {
      return (
        <div className="text-center py-20 bg-white rounded shadow-sm border border-dashed border-slate-300">
          <p className="text-slate-500 text-lg">Please select or create a release first.</p>
        </div>
      );
    }

    // Determine assigned vs unassigned resources for this release
    const assignedResourceIds = new Set(
        allocations.filter(a => a.releaseId === activeRelease.id).map(a => a.resourceId)
    );
    const assignedResources = resources.filter(r => assignedResourceIds.has(r.id));
    const availableResources = resources.filter(r => !assignedResourceIds.has(r.id));

    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-4 rounded shadow-sm gap-4">
          <div>
            <h3 className="font-bold text-lg text-corporate-800">
                Allocation Matrix: <span className="text-corporate-600">{activeRelease.name}</span>
            </h3>
            <div className="text-sm text-slate-500">
                {activeRelease.startMonth} &rarr; {activeRelease.endMonth}
            </div>
          </div>
          
          <div className="flex items-center gap-2 w-full md:w-auto">
             <div className="relative flex-1 md:flex-initial">
               <select 
                  className="w-full md:w-64 bg-slate-800 text-white border border-slate-600 rounded p-2 pr-8 focus:ring-2 focus:ring-corporate-500 outline-none appearance-none"
                  value={resourceToAddId}
                  onChange={e => setResourceToAddId(e.target.value)}
               >
                 <option value="" disabled>-- Select Resource to Add --</option>
                 {availableResources.map(r => (
                   <option key={r.id} value={r.id}>{r.name} - {r.role}</option>
                 ))}
                 {availableResources.length === 0 && <option disabled>All resources assigned</option>}
               </select>
               <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-white">
                  <ChevronRight size={16} className="rotate-90" />
               </div>
             </div>
             <button 
                onClick={handleAssignResourceToRelease}
                disabled={!resourceToAddId}
                className="bg-corporate-600 text-white px-4 py-2 rounded hover:bg-corporate-700 transition-colors font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
             >
                <UserPlus size={18} /> Add
             </button>
          </div>
        </div>
        
        {assignedResources.length > 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
            <table className="w-full min-w-max text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="p-3 font-semibold text-slate-700 sticky left-0 bg-slate-50 z-10 shadow-sm border-r border-slate-200 min-w-[200px]">Resource</th>
                  {activeReleaseMonths.map(m => (
                    <th key={m} className="p-3 font-semibold text-slate-600 text-center min-w-[100px]">
                      {m}
                    </th>
                  ))}
                  <th className="p-3 font-semibold text-slate-600 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assignedResources.map(res => (
                  <tr key={res.id} className="hover:bg-slate-50">
                    <td className="p-3 font-medium text-slate-800 sticky left-0 bg-white hover:bg-slate-50 z-10 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      <div className="flex flex-col">
                        <span>{res.name}</span>
                        <span className="text-xs text-slate-400">{res.role}</span>
                      </div>
                    </td>
                    {activeReleaseMonths.map(m => {
                      const alloc = allocations.find(a => 
                        a.releaseId === activeRelease.id && 
                        a.resourceId === res.id && 
                        a.monthStr === m
                      );
                      const val = alloc ? alloc.percentage : 0;
                      
                      return (
                        <td key={m} className="p-2 text-center">
                          <input 
                            type="number" 
                            min="0" max="1" step="0.1"
                            className={`w-16 text-center border rounded p-1 text-sm outline-none focus:ring-1 focus:ring-corporate-500 ${val > 0 ? 'bg-blue-50 border-blue-200 font-semibold text-blue-800' : 'bg-white border-slate-200 text-slate-400'}`}
                            value={val}
                            onChange={e => {
                              let v = parseFloat(e.target.value);
                              if (isNaN(v)) v = 0;
                              if (v > 1) v = 1;
                              handleUpdateAllocation(activeRelease.id, res.id, m, v);
                            }}
                          />
                        </td>
                      );
                    })}
                    <td className="p-2 text-center">
                        <button 
                            onClick={() => handleRemoveResourceFromRelease(res.id)}
                            className="text-slate-300 hover:text-red-500 transition-colors p-1"
                            title="Remove from release"
                        >
                            <X size={18} />
                        </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
            <div className="text-center py-16 bg-slate-50 rounded border border-dashed border-slate-300">
                <Users className="mx-auto text-slate-300 mb-2" size={48} />
                <p className="text-slate-500">No resources assigned to this release yet.</p>
                <p className="text-slate-400 text-sm">Select a resource above and click "Add".</p>
            </div>
        )}
      </div>
    );
  };

  const renderReports = () => {
    // Global Summary Data
    const globalSummary = releases.map(r => ({
        ...r,
        totalCost: calculateReleaseTotalCostUSD(r, resources, allocations)
    }));
    const totalGlobalCost = globalSummary.reduce((sum, item) => sum + item.totalCost, 0);

    return (
      <div className="space-y-8 animate-fade-in">
        
        {/* Global Summary Section */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
             <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                   <DollarSign size={18} className="text-green-600" /> Portfolio Cost Summary
                </h3>
             </div>
             <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold">
                    <tr>
                        <th className="px-6 py-3">Release Name</th>
                        <th className="px-6 py-3">Duration</th>
                        <th className="px-6 py-3 text-right">Total Cost (USD)</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {globalSummary.map(item => (
                        <tr key={item.id} className={`hover:bg-slate-50 ${item.id === selectedReleaseId ? 'bg-blue-50/50' : ''}`}>
                            <td className="px-6 py-3 font-medium text-slate-700">{item.name}</td>
                            <td className="px-6 py-3 text-slate-500 text-sm">{item.startMonth} - {item.endMonth}</td>
                            <td className="px-6 py-3 text-right font-mono text-slate-700">{formatCurrency(item.totalCost, 'USD')}</td>
                        </tr>
                    ))}
                    {globalSummary.length === 0 && (
                        <tr><td colSpan={3} className="px-6 py-4 text-center text-slate-400 italic">No releases found.</td></tr>
                    )}
                </tbody>
                <tfoot className="bg-slate-100 font-bold text-slate-800 border-t border-slate-200">
                    <tr>
                        <td colSpan={2} className="px-6 py-3 text-right">Grand Total</td>
                        <td className="px-6 py-3 text-right font-mono text-lg">{formatCurrency(totalGlobalCost, 'USD')}</td>
                    </tr>
                </tfoot>
             </table>
        </div>

        {activeRelease && (
            <>
                <div className="relative">
                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                        <div className="w-full border-t border-slate-200"></div>
                    </div>
                    <div className="relative flex justify-center">
                        <span className="bg-corporate-50 px-2 text-sm text-slate-500">Detailed Breakdown: {activeRelease.name}</span>
                    </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-corporate-600 to-corporate-800 text-white p-6 rounded-lg shadow-md">
                    <h4 className="text-corporate-200 text-sm font-semibold uppercase tracking-wider mb-2">Project Cost (USD)</h4>
                    <div className="text-4xl font-bold">{formatCurrency(costData.total, 'USD')}</div>
                    <div className="text-sm mt-2 text-corporate-300">Converted @ 1.32 CAD</div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                    <h4 className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-2">Total Duration</h4>
                    <div className="text-3xl font-bold text-slate-800">{activeReleaseMonths.length} Months</div>
                    <div className="text-sm mt-2 text-slate-500">{activeRelease.startMonth} - {activeRelease.endMonth}</div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                    <h4 className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-2">Assigned Resources</h4>
                    <div className="text-3xl font-bold text-slate-800">
                    {allocations.filter(a => a.releaseId === activeRelease.id && a.monthStr === activeReleaseMonths[0]).length}
                    </div>
                    <div className="text-sm mt-2 text-slate-500">Active Allocations</div>
                </div>
                </div>

                {/* Detailed Table */}
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                    <DollarSign size={18} /> Cost Breakdown by Resource
                    </h3>
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded border border-yellow-200">USD Estimates</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                        <th className="p-3 pl-6 font-semibold text-slate-600 sticky left-0 bg-slate-50 border-r border-slate-200">Resource</th>
                        <th className="p-3 font-semibold text-slate-600">Rate (USD)</th>
                        {activeReleaseMonths.map(m => (
                            <th key={m} className="p-3 font-semibold text-slate-600 text-right min-w-[100px]">{m}</th>
                        ))}
                        <th className="p-3 pr-6 font-semibold text-slate-800 text-right bg-slate-100">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {resources.map(res => {
                            // Only show if allocated to this release
                            const isAllocated = allocations.some(a => a.releaseId === activeRelease.id && a.resourceId === res.id);
                            if (!isAllocated) return null;

                            const totalResCost = costData.byResource[res.id] || 0;

                            return (
                                <tr key={res.id} className="hover:bg-slate-50 group">
                                <td className="p-3 pl-6 font-medium text-slate-800 sticky left-0 bg-white group-hover:bg-slate-50 border-r border-slate-200">
                                    {res.name} <span className="text-xs text-slate-400 block">{res.role}</span>
                                </td>
                                <td className="p-3 text-slate-500">
                                    {formatCurrency(res.rateCAD / CONSTANTS.USD_TO_CAD, 'USD')}/hr
                                </td>
                                {activeReleaseMonths.map(m => {
                                    const alloc = allocations.find(a => a.releaseId === activeRelease.id && a.resourceId === res.id && a.monthStr === m);
                                    const cost = alloc ? calculateMonthlyResourceCostUSD(res, alloc.percentage) : 0;
                                    return (
                                    <td key={m} className={`p-3 text-right font-mono ${cost > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                                        {cost > 0 ? formatCurrency(cost, 'USD').replace('$', '') : '-'}
                                    </td>
                                    );
                                })}
                                <td className="p-3 pr-6 text-right font-bold text-slate-800 bg-slate-50">
                                    {formatCurrency(totalResCost, 'USD')}
                                </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot className="bg-slate-100 border-t border-slate-300 font-bold text-slate-800">
                        <tr>
                        <td colSpan={2} className="p-3 pl-6 sticky left-0 bg-slate-100 border-r border-slate-300">Monthly Totals</td>
                        {activeReleaseMonths.map(m => (
                            <td key={m} className="p-3 text-right font-mono">
                            {formatCurrency(costData.byMonth[m] || 0, 'USD').replace('$', '')}
                            </td>
                        ))}
                        <td className="p-3 pr-6 text-right bg-slate-200">
                            {formatCurrency(costData.total, 'USD')}
                        </td>
                        </tr>
                    </tfoot>
                    </table>
                </div>
                </div>

                {/* AI Executive Summary */}
                <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-blue-100 rounded-lg p-6">
                <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
                        <BrainCircuit className="text-indigo-600" /> AI Executive Summary
                    </h3>
                    <button 
                        onClick={handleGenerateSummary}
                        disabled={isGeneratingAi}
                        className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                        {isGeneratingAi ? 'Analyzing...' : 'Generate Summary'}
                    </button>
                </div>
                
                {aiSummary ? (
                    <div className="prose prose-sm max-w-none text-indigo-900">
                    <p className="whitespace-pre-line leading-relaxed">{aiSummary}</p>
                    </div>
                ) : (
                    <p className="text-sm text-indigo-400 italic">
                    Click "Generate Summary" to get an AI-powered analysis of the resource allocation and cost drivers for this release.
                    </p>
                )}
                </div>
            </>
        )}
        
        {!activeRelease && (
            <div className="text-center py-12 text-slate-400">
                <p>Select a specific release from the dropdown above to view its detailed resource breakdown.</p>
            </div>
        )}
      </div>
    );
  };

  // --- Main Layout ---

  return (
    <div className="min-h-screen flex flex-col font-sans text-slate-800">
      {/* Header */}
      <header className="bg-corporate-800 text-white shadow-lg sticky top-0 z-30">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="bg-white/10 p-2 rounded-lg">
                <TrendingUp size={24} className="text-blue-300" />
             </div>
             <div>
               <h1 className="text-2xl font-bold tracking-tight">EstiMate<span className="text-blue-400">Pro</span></h1>
               <p className="text-xs text-slate-300">Resource Planning & Cost Estimation</p>
             </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:flex gap-2">
               <label className="flex items-center gap-2 bg-corporate-700 hover:bg-corporate-600 px-3 py-2 rounded cursor-pointer transition-colors text-sm">
                  <Upload size={16} /> Import CSV
                  <input type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
               </label>
               <button onClick={handleExportCSV} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-3 py-2 rounded transition-colors text-sm font-medium">
                  <Download size={16} /> Export Data
               </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-8">
        
        {/* Release Selector Bar */}
        <div className="mb-8 flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-lg shadow-sm border border-slate-200">
           <div className="flex items-center gap-4 w-full md:w-auto">
              <span className="font-semibold text-slate-600 whitespace-nowrap">Active Release:</span>
              <select 
                className="w-full md:w-64 border border-slate-300 rounded p-2 text-slate-800 bg-slate-50 focus:ring-2 focus:ring-corporate-500"
                value={selectedReleaseId}
                onChange={e => setSelectedReleaseId(e.target.value)}
              >
                <option value="" disabled>-- Select a Release --</option>
                {releases.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
           </div>
           
           <div className="flex bg-slate-100 rounded-lg p-1 w-full md:w-auto overflow-x-auto">
              {[
                { id: 'releases', label: 'Releases', icon: Calendar },
                { id: 'resources', label: 'Resources', icon: Users },
                { id: 'allocation', label: 'Allocations', icon: Briefcase },
                { id: 'reports', label: 'Cost Summary', icon: DollarSign },
              ].map(tab => (
                 <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-corporate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                 >
                    <tab.icon size={16} /> {tab.label}
                 </button>
              ))}
           </div>
        </div>

        {/* Tab Content */}
        <div className="min-h-[500px]">
          {activeTab === 'releases' && renderReleaseManager()}
          {activeTab === 'resources' && renderResourceManager()}
          {activeTab === 'allocation' && renderAllocation()}
          {activeTab === 'reports' && renderReports()}
        </div>

      </main>

      {/* Footer */}
      <footer className="bg-slate-100 border-t border-slate-200 py-6 text-center text-slate-500 text-sm">
        <p>&copy; {new Date().getFullYear()} EstiMate Pro. All Cost Estimates in USD.</p>
        <p className="mt-1">Exchange Rate: 1 USD = {CONSTANTS.USD_TO_CAD} CAD</p>
      </footer>
    </div>
  );
};

export default App;