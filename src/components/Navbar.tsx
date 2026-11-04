import React from 'react';
import {
  LayoutDashboard,
  Package,
  Layers,
  Store,
  Globe,
  Settings as SettingsIcon,
  Database,
  Tag,
} from 'lucide-react';

export type PageId = 'dashboard' | 'products' | 'suppliers' | 'listings' | 'scraper' | 'html-import' | 'settings';

interface NavbarProps {
  currentPage: PageId;
  setCurrentPage: (page: PageId) => void;
  productsCount: number;
  listingsCount: number;
  isSupabaseConnected: boolean;
  isEbayConnected: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentPage,
  setCurrentPage,
  productsCount,
  listingsCount,
  isSupabaseConnected,
  isEbayConnected,
}) => {
  const navItems = [
    { id: 'dashboard' as PageId, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'products' as PageId, label: 'Catalogue', icon: Package, badge: productsCount },
    { id: 'listings' as PageId, label: 'eBay', icon: Store, badge: listingsCount },
    { id: 'suppliers' as PageId, label: 'Suppliers', icon: Layers },
    { id: 'scraper' as PageId, label: 'Scraper', icon: Globe },
    { id: 'settings' as PageId, label: 'Settings', icon: SettingsIcon },
  ];

  return (
    <>
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 text-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setCurrentPage('dashboard')}>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-lg shadow-inner">
              ⚡
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-base sm:text-lg tracking-tight text-slate-100">SinchoDS</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  eBay Dropship
                </span>
              </div>
              <p className="text-[10px] text-slate-400 hidden sm:block">Multi-Supplier & eBay Listing Manager</p>
            </div>
          </div>

          {/* Desktop Navigation Tabs */}
          <nav className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentPage(item.id)}
                  className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-800 text-emerald-400 border border-slate-700 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="ml-1 text-[11px] px-1.5 py-0.2 rounded-full bg-slate-700 text-slate-300">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Status Indicators */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage('settings')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                isEbayConnected
                  ? 'bg-blue-950/60 text-blue-300 border-blue-800/60'
                  : 'bg-slate-850 text-slate-400 border-slate-700'
              }`}
              title={isEbayConnected ? 'eBay.it Connected' : 'eBay not yet connected'}
            >
              <Store className="w-3 h-3" />
              <span className="hidden sm:inline">{isEbayConnected ? 'eBay Active' : 'eBay Draft'}</span>
              <span className="sm:hidden">eBay</span>
            </button>

            <button
              onClick={() => setCurrentPage('settings')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                isSupabaseConnected
                  ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                  : 'bg-amber-950/60 text-amber-300 border-amber-800/60'
              }`}
            >
              <Database className="w-3 h-3" />
              <span className="hidden sm:inline">
                {isSupabaseConnected ? 'Cloud' : 'Local'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar (iPhone-First) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 pb-[env(safe-area-inset-bottom,8px)] pt-2 px-2">
        <div className="grid grid-cols-6 gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-all relative ${
                  isActive
                    ? 'text-emerald-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 active:scale-95'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-4 h-4 ${isActive ? 'stroke-[2.5px]' : 'stroke-[1.8px]'}`} />
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="absolute -top-1 -right-2 text-[8px] bg-emerald-500 text-slate-950 font-bold px-1 rounded-full min-w-3 h-3 flex items-center justify-center">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[9px] mt-1 tracking-tight truncate max-w-full">{item.label}</span>
                {isActive && (
                  <span className="w-1 h-1 rounded-full bg-emerald-400 mt-0.5 absolute bottom-0.5" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
