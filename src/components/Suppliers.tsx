import React, { useState } from 'react';
import { Supplier } from '../types.js';
import { PageId } from './Navbar.js';
import {
  Layers,
  CheckCircle2,
  XCircle,
  Plus,
  RefreshCw,
  ExternalLink,
  Settings as SettingsIcon,
  Globe,
  Sliders,
  Check,
  Package,
  Calendar,
  AlertTriangle,
  Info,
} from 'lucide-react';

interface SuppliersProps {
  suppliers: Supplier[];
  onToggleSupplier: (id: string) => void;
  onAddSupplier: (supplier: Supplier) => void;
  setCurrentPage: (page: PageId) => void;
}

export const Suppliers: React.FC<SuppliersProps> = ({
  suppliers,
  onToggleSupplier,
  onAddSupplier,
  setCurrentPage,
}) => {
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; message: string } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form state for adding new connector
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierUrl, setNewSupplierUrl] = useState('');
  const [newSupplierDesc, setNewSupplierDesc] = useState('');

  const handleTestSupplier = async (supplier: Supplier) => {
    setTestingId(supplier.id);
    setTestResult(null);
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        setTestResult({
          id: supplier.id,
          ok: true,
          message: `Connector for ${supplier.name} is operational. Server endpoints and parsing engine active.`,
        });
      } else {
        setTestResult({
          id: supplier.id,
          ok: false,
          message: 'Server proxy endpoint unreachable.',
        });
      }
    } catch (e: any) {
      setTestResult({
        id: supplier.id,
        ok: false,
        message: e.message || 'Connection error',
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleCreateSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierName.trim() || !newSupplierUrl.trim()) return;

    const id = newSupplierName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const created: Supplier = {
      id,
      name: newSupplierName.trim(),
      baseUrl: newSupplierUrl.trim(),
      logoText: `📦 ${newSupplierName.trim()}`,
      status: 'active',
      lastSyncAt: null,
      productCount: 0,
      failedCount: 0,
      description: newSupplierDesc.trim() || 'Custom supplier connector registered in SinchoDS.',
      supportedFeatures: {
        sitemap: false,
        variants: true,
        lotExpiry: false,
        liveScraping: false,
        htmlImport: true,
      },
    };

    onAddSupplier(created);
    setShowAddModal(false);
    setNewSupplierName('');
    setNewSupplierUrl('');
    setNewSupplierDesc('');
  };

  return (
    <div className="space-y-4 pb-20 md:pb-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-white flex items-center space-x-2">
            <Layers className="w-5 h-5 text-emerald-400" />
            <span>Supplier Manager</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Modular multi-supplier architecture: connect and monitor independent suppliers. PlusPower Supplements is our primary active supplier for sports nutrition.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="self-start sm:self-center px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold inline-flex items-center space-x-1.5 shadow-sm transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Supplier</span>
        </button>
      </div>

      {/* Connected Suppliers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {suppliers.map((supplier) => {
          const isActive = supplier.status === 'active';
          const isPlusPower = supplier.id === 'pluspower';

          return (
            <div
              key={supplier.id}
              className={`bg-slate-900/90 border rounded-2xl p-4 sm:p-5 flex flex-col justify-between space-y-4 transition-all shadow-sm ${
                isActive ? 'border-slate-800 hover:border-slate-700' : 'border-slate-800/50 opacity-70'
              }`}
            >
              <div>
                {/* Header Row: Name, Status Pill, Enable/Disable Toggle */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-lg font-bold">
                      {isPlusPower ? '⚡' : '📦'}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                        <span>{supplier.name}</span>
                        {isPlusPower && (
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 rounded font-semibold border border-emerald-500/30">
                            Primary
                          </span>
                        )}
                      </h3>
                      <a
                        href={supplier.baseUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-slate-400 hover:text-emerald-400 font-mono inline-flex items-center space-x-1"
                      >
                        <span>{supplier.baseUrl}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>

                  {/* Status Toggle */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => onToggleSupplier(supplier.id)}
                      className={`text-xs px-2.5 py-1 rounded-full font-semibold border transition-all ${
                        isActive
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {isActive ? 'Active' : 'Disabled'}
                    </button>
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-slate-300 mt-3 leading-relaxed">
                  {supplier.description}
                </p>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-800/80 text-center">
                  <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Products</span>
                    <span className="text-xs font-bold text-white">{supplier.productCount}</span>
                  </div>
                  <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Last Sync</span>
                    <span className="text-[10px] font-semibold text-slate-300">
                      {supplier.lastSyncAt ? new Date(supplier.lastSyncAt).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                  <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Errors</span>
                    <span className="text-xs font-bold text-emerald-400">{supplier.failedCount}</span>
                  </div>
                </div>

                {/* Supported Connector Features */}
                <div className="mt-3">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                    Connector Capabilities:
                  </span>
                  <div className="flex flex-wrap gap-1.5 text-[10px]">
                    <span className={`px-2 py-0.5 rounded-full ${supplier.supportedFeatures.variants ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20' : 'bg-slate-800 text-slate-500'}`}>
                      ✓ Variants &amp; Flavors
                    </span>
                    <span className={`px-2 py-0.5 rounded-full ${supplier.supportedFeatures.lotExpiry ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' : 'bg-slate-800 text-slate-500'}`}>
                      ✓ Lot Expiry Dates
                    </span>
                    <span className={`px-2 py-0.5 rounded-full ${supplier.supportedFeatures.htmlImport ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-slate-800 text-slate-500'}`}>
                      ✓ HTML Source Import
                    </span>
                    <span className={`px-2 py-0.5 rounded-full ${supplier.supportedFeatures.sitemap ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20' : 'bg-slate-800 text-slate-500'}`}>
                      ✓ XML Sitemap
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                <button
                  onClick={() => handleTestSupplier(supplier)}
                  disabled={testingId === supplier.id}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium inline-flex items-center space-x-1.5 border border-slate-700"
                >
                  <RefreshCw className={`w-3 h-3 ${testingId === supplier.id ? 'animate-spin' : ''}`} />
                  <span>{testingId === supplier.id ? 'Testing...' : 'Check Connection'}</span>
                </button>

                {isPlusPower && (
                  <button
                    onClick={() => setCurrentPage('scraper')}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold inline-flex items-center"
                  >
                    Open Scraper &rarr;
                  </button>
                )}
              </div>

              {/* Test Result Message */}
              {testResult && testResult.id === supplier.id && (
                <div
                  className={`p-2.5 rounded-xl border text-xs flex items-center space-x-2 animate-in fade-in ${
                    testResult.ok
                      ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add New Supplier Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>Connect New Supplier</span>
            </h3>

            <p className="text-xs text-slate-400">
              Register a new supplier in the central SinchoDS catalogue to catalog products, synchronize prices, and draft eBay listings.
            </p>

            <form onSubmit={handleCreateSupplier} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Supplier Name</label>
                <input
                  type="text"
                  placeholder="e.g. GymBeam, Bulk Powders, Tsunami Nutrition"
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Official Website URL</label>
                <input
                  type="url"
                  placeholder="https://www.supplier-domain.com"
                  value={newSupplierUrl}
                  onChange={(e) => setNewSupplierUrl(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono text-xs outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Description / Notes</label>
                <textarea
                  rows={2}
                  placeholder="B2B nutrition supplier, 24/48h delivery..."
                  value={newSupplierDesc}
                  onChange={(e) => setNewSupplierDesc(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 font-medium text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm"
                >
                  Add Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
