import React, { useState, useMemo } from 'react';
import { Product, ProductVariant } from '../types.js';
import {
  Search,
  Filter,
  ArrowUpDown,
  Download,
  Trash2,
  Edit3,
  ExternalLink,
  Layers,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Package,
  X,
  Save,
  CheckSquare,
  Square,
  ChevronRight,
  Calendar,
  Barcode,
  Tag,
  DollarSign,
  Copy,
  Info,
  Store,
} from 'lucide-react';
import { generateProductsCsv, generateVariantsCsv, generateCombinedCsv, downloadCsv } from '../utils/csv.js';

interface ProductsProps {
  products: Product[];
  onUpdateProduct: (product: Product) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onBulkDelete: (ids: string[]) => Promise<void>;
  onOpenListingBuilder: (product: Product) => void;
}

export const Products: React.FC<ProductsProps> = ({
  products,
  onUpdateProduct,
  onDeleteProduct,
  onBulkDelete,
  onOpenListingBuilder,
}) => {
  // Search & Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'InStock' | 'OutOfStock'>('all');
  const [missingFilter, setMissingFilter] = useState<'all' | 'missing-sku' | 'missing-ean' | 'needs-review'>('all');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'price-asc' | 'price-desc' | 'name-asc' | 'name-desc'>('date-desc');

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modal / Drawer state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Product>>({});
  const [editingVariant, setEditingVariant] = useState<ProductVariant | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Extract unique brands for filter
  const allBrands = useMemo(() => {
    const brands = new Set<string>();
    products.forEach((p) => {
      if (p.brand) brands.add(p.brand);
    });
    return Array.from(brands).sort();
  }, [products]);

  // Duplicate detection map (by URL, SKU, or EAN)
  const duplicateUrlCounts = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((p) => {
      map.set(p.url, (map.get(p.url) || 0) + 1);
    });
    return map;
  }, [products]);

  // Filtered & Sorted products
  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => {
        // Search query across title, brand, SKU, EAN and variant fields
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchTitle = p.title.toLowerCase().includes(q);
          const matchBrand = p.brand ? p.brand.toLowerCase().includes(q) : false;
          const matchSku = p.sku ? p.sku.toLowerCase().includes(q) : false;
          const matchEan = p.ean ? p.ean.toLowerCase().includes(q) : false;
          const matchVariants = p.variants?.some(
            (v) =>
              v.name.toLowerCase().includes(q) ||
              (v.sku && v.sku.toLowerCase().includes(q)) ||
              (v.ean && v.ean.toLowerCase().includes(q))
          );
          if (!matchTitle && !matchBrand && !matchSku && !matchEan && !matchVariants) {
            return false;
          }
        }

        // Availability filter
        if (availabilityFilter !== 'all') {
          if (availabilityFilter === 'InStock' && p.availability !== 'InStock' && !(p.stock_quantity && p.stock_quantity > 0)) {
            return false;
          }
          if (availabilityFilter === 'OutOfStock' && p.availability !== 'OutOfStock' && !(p.stock_quantity === 0)) {
            return false;
          }
        }

        // Missing info filter
        if (missingFilter === 'missing-sku' && p.sku) return false;
        if (missingFilter === 'missing-ean' && p.ean) return false;
        if (missingFilter === 'needs-review' && p.status !== 'needs_review') return false;

        // Brand filter
        if (brandFilter !== 'all' && p.brand !== brandFilter) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'name-asc':
            return a.title.localeCompare(b.title);
          case 'name-desc':
            return b.title.localeCompare(a.title);
          case 'price-asc':
            return (Number(a.price) || 999999) - (Number(b.price) || 999999);
          case 'price-desc':
            return (Number(b.price) || -1) - (Number(a.price) || -1);
          case 'date-asc':
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          case 'date-desc':
          default:
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
      });
  }, [products, searchQuery, availabilityFilter, missingFilter, brandFilter, sortBy]);

  // Bulk selection handlers
  const handleSelectAll = () => {
    if (selectedIds.length === filteredProducts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredProducts.map((p) => p.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  // Open detail modal
  const handleOpenDetail = (product: Product) => {
    setSelectedProduct(product);
    setEditForm({ ...product });
    setIsEditing(false);
    setEditingVariant(null);
  };

  // Save product edits
  const handleSaveEdit = async () => {
    if (!selectedProduct) return;
    setIsSaving(true);
    try {
      const updated: Product = {
        ...selectedProduct,
        ...editForm,
        title: editForm.title || selectedProduct.title,
        price: editForm.price !== undefined ? editForm.price : selectedProduct.price,
        updated_at: new Date().toISOString(),
      };
      await onUpdateProduct(updated);
      setSelectedProduct(updated);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  // Save variant edit inside product
  const handleSaveVariantEdit = async () => {
    if (!selectedProduct || !editingVariant) return;
    const updatedVariants = (selectedProduct.variants || []).map((v) =>
      v.id === editingVariant.id ? editingVariant : v
    );
    const updatedProduct = {
      ...selectedProduct,
      variants: updatedVariants,
      updated_at: new Date().toISOString(),
    };
    await onUpdateProduct(updatedProduct);
    setSelectedProduct(updatedProduct);
    setEditingVariant(null);
  };

  // CSV Exports
  const handleExportFilteredProducts = (type: 'products' | 'variants' | 'combined') => {
    const listToExport =
      selectedIds.length > 0
        ? products.filter((p) => selectedIds.includes(p.id))
        : filteredProducts;

    if (listToExport.length === 0) return;

    const dateStr = new Date().toISOString().split('T')[0];
    if (type === 'products') {
      const csv = generateProductsCsv(listToExport);
      downloadCsv(`pluspower_prodotti_${dateStr}.csv`, csv);
    } else if (type === 'variants') {
      const csv = generateVariantsCsv(listToExport);
      downloadCsv(`pluspower_varianti_${dateStr}.csv`, csv);
    } else {
      const csv = generateCombinedCsv(listToExport);
      downloadCsv(`pluspower_combinato_${dateStr}.csv`, csv);
    }
  };

  return (
    <div className="space-y-4 pb-20 md:pb-8">
      {/* Header & Export Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-white flex items-center space-x-2">
            <span>Product Catalogue</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30">
              {filteredProducts.length} {filteredProducts.length === 1 ? 'product' : 'products'}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Search, manage attributes, inspect variants/flavours, and export to CSV.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 sm:pb-0">
          <div className="relative inline-block text-left">
            <button
              onClick={() => handleExportFilteredProducts('combined')}
              className="inline-flex items-center space-x-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>

          {selectedIds.length > 0 && (
            <button
              onClick={() => setBulkDeleteConfirm(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-2 bg-rose-600/90 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold transition-all shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete ({selectedIds.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-3">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by title, brand, SKU, EAN, or variant..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl pl-9 pr-9 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filters Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {/* Availability */}
          <div>
            <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-1">Availability</label>
            <select
              value={availabilityFilter}
              onChange={(e) => setAvailabilityFilter(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-emerald-500"
            >
              <option value="all">All</option>
              <option value="InStock">In Stock</option>
              <option value="OutOfStock">Out of Stock</option>
            </select>
          </div>

          {/* Missing info */}
          <div>
            <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-1">Data Quality</label>
            <select
              value={missingFilter}
              onChange={(e) => setMissingFilter(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-emerald-500"
            >
              <option value="all">All products</option>
              <option value="missing-sku">Missing SKU</option>
              <option value="missing-ean">Missing EAN</option>
              <option value="needs-review">Needs Review</option>
            </select>
          </div>

          {/* Brand */}
          <div>
            <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-1">Brand</label>
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-emerald-500 truncate"
            >
              <option value="all">All brands</option>
              {allBrands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By */}
          <div>
            <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-1">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-emerald-500"
            >
              <option value="date-desc">Newest first</option>
              <option value="date-asc">Oldest first</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="name-asc">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Select All Checkbox bar */}
      {filteredProducts.length > 0 && (
        <div className="flex items-center justify-between px-2 text-xs text-slate-400">
          <button
            onClick={handleSelectAll}
            className="flex items-center space-x-2 text-slate-300 hover:text-white"
          >
            {selectedIds.length === filteredProducts.length ? (
              <CheckSquare className="w-4 h-4 text-emerald-400" />
            ) : (
              <Square className="w-4 h-4" />
            )}
            <span>
              {selectedIds.length === filteredProducts.length ? 'Deselect all' : 'Select all'}
            </span>
          </button>
          <span>
            {selectedIds.length} of {filteredProducts.length} selected
          </span>
        </div>
      )}

      {/* Products List (Responsive Cards for iPhone / Grid for Desktop) */}
      {filteredProducts.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-10 text-center text-slate-400">
          <Package className="w-12 h-12 mx-auto text-slate-600 mb-2" />
          <p className="text-base font-semibold text-slate-300">No products found</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {searchQuery || availabilityFilter !== 'all' || missingFilter !== 'all' || brandFilter !== 'all'
              ? 'No products match the selected filters. Try resetting search criteria.'
              : 'No products in catalogue yet. Use HTML Import or Scraper to add products.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredProducts.map((product) => {
            const isSelected = selectedIds.includes(product.id);
            const isDuplicate = (duplicateUrlCounts.get(product.url) || 0) > 1;

            return (
              <div
                key={product.id}
                className={`bg-slate-900/90 border rounded-2xl p-3.5 transition-all flex flex-col justify-between hover:border-slate-700 shadow-sm ${
                  isSelected ? 'border-emerald-500/60 bg-slate-850' : 'border-slate-800'
                }`}
              >
                <div>
                  {/* Top card row: Select Checkbox, Brand, Status Badge */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSelect(product.id);
                      }}
                      className="text-slate-400 hover:text-white p-0.5"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>

                    <div className="flex items-center space-x-1.5 overflow-hidden">
                      {product.brand && (
                        <span className="text-[11px] font-semibold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full truncate max-w-[130px]">
                          {product.brand}
                        </span>
                      )}
                      {isDuplicate && (
                        <span className="text-[10px] font-bold text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded-full">
                          Duplicate
                        </span>
                      )}
                    </div>

                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        product.availability === 'InStock' || (product.stock_quantity && product.stock_quantity > 0)
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}
                    >
                      {product.availability === 'InStock' ? 'In Stock' : 'Out of Stock'}
                    </span>
                  </div>

                  {/* Main Product Info: Thumbnail & Title */}
                  <div
                    onClick={() => handleOpenDetail(product)}
                    className="flex space-x-3 cursor-pointer group"
                  >
                    {product.images && product.images.length > 0 ? (
                      <img
                        src={product.images[0]}
                        alt={product.title}
                        className="w-14 h-14 rounded-xl object-contain bg-slate-950 p-1 border border-slate-800 flex-shrink-0 group-hover:scale-105 transition-transform"
                        onError={(e) => {
                          (e.target as any).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-600 flex-shrink-0">
                        <Package className="w-6 h-6" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <h3 className="text-xs sm:text-sm font-semibold text-slate-100 group-hover:text-emerald-400 transition-colors line-clamp-2 leading-snug">
                        {product.title}
                      </h3>
                      <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-1">
                        <span className="text-sm font-bold text-white">
                          {product.price !== null ? `€ ${Number(product.price).toFixed(2)}` : 'N/A'}
                        </span>
                        {product.original_price !== null && Number(product.original_price) > (Number(product.price) || 0) && (
                          <span className="text-[11px] text-slate-500 line-through">
                            € {Number(product.original_price).toFixed(2)}
                          </span>
                        )}
                        {product.discount_percentage && (
                          <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-1 rounded">
                            -{product.discount_percentage}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Identifiers (SKU / EAN / Variants count) */}
                  <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <div className="flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                      <Barcode className="w-3 h-3 text-slate-500" />
                      <span className="text-[10px] text-slate-400">SKU:</span>
                      <span className="font-mono text-[10px]">{product.sku || 'None'}</span>
                    </div>

                    <div className="flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                      <span className="text-[10px] text-slate-400">EAN:</span>
                      <span className="font-mono text-[10px]">{product.ean || 'None'}</span>
                    </div>

                    {product.variants && product.variants.length > 0 && (
                      <div className="flex items-center space-x-1 px-2 py-0.5 rounded bg-blue-950/40 border border-blue-800/40 text-blue-300">
                        <Layers className="w-3 h-3 text-blue-400" />
                        <span className="text-[10px] font-medium">{product.variants.length} variants</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom card actions */}
                <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between gap-1">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[10px] text-slate-500">
                      {new Date(product.created_at).toLocaleDateString()}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-medium">
                      {product.supplier_name || 'PlusPower'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => onOpenListingBuilder(product)}
                      className="px-2 py-1 rounded-lg bg-blue-600/90 hover:bg-blue-500 text-white text-[11px] font-semibold inline-flex items-center space-x-1 shadow-sm"
                      title="Create eBay.it listing"
                    >
                      <Store className="w-3 h-3" />
                      <span>eBay</span>
                    </button>
                    <button
                      onClick={() => handleOpenDetail(product)}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-medium inline-flex items-center px-1"
                    >
                      Details <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(product.id)}
                      className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                      title="Delete product"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Product Detail & Edit Drawer / Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom-5">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-850 rounded-t-2xl">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {selectedProduct.import_source}
                </span>
                <h2 className="text-sm sm:text-base font-bold text-white truncate max-w-[280px] sm:max-w-md">
                  {isEditing ? 'Edit Product' : selectedProduct.title}
                </h2>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    const p = selectedProduct;
                    setSelectedProduct(null);
                    onOpenListingBuilder(p);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center space-x-1 shadow-sm"
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>eBay</span>
                </button>
                {!isEditing ? (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium inline-flex items-center space-x-1"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Edit</span>
                  </button>
                ) : (
                  <button
                    onClick={handleSaveEdit}
                    disabled={isSaving}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center space-x-1"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSaving ? 'Saving...' : 'Save'}</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setSelectedProduct(null);
                    setIsEditing(false);
                  }}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
              {/* Product URL & External Link */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-2">
                <div className="truncate text-slate-400">
                  <span className="text-slate-500 mr-1">URL:</span>
                  <a
                    href={selectedProduct.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 hover:underline font-mono text-[11px]"
                  >
                    {selectedProduct.url}
                  </a>
                </div>
                <div className="flex items-center space-x-1 flex-shrink-0">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(selectedProduct.url);
                      setCopiedUrl(true);
                      setTimeout(() => setCopiedUrl(false), 2000);
                    }}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                    title="Copy link"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <a
                    href={selectedProduct.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                    title="Open in browser"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Editing Form or View Information */}
              {isEditing ? (
                <div className="space-y-3 bg-slate-850 p-4 rounded-xl border border-slate-700">
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Product Title</label>
                    <input
                      type="text"
                      value={editForm.title || ''}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1 font-medium">Brand</label>
                      <input
                        type="text"
                        value={editForm.brand || ''}
                        onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1 font-medium">Category</label>
                      <input
                        type="text"
                        value={editForm.category || ''}
                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1 font-medium">Price (€)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.price ?? ''}
                        onChange={(e) =>
                          setEditForm({ ...editForm, price: e.target.value ? parseFloat(e.target.value) : null })
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1 font-medium">Original Price (€)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.original_price ?? ''}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            original_price: e.target.value ? parseFloat(e.target.value) : null,
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1 font-medium">SKU Code</label>
                      <input
                        type="text"
                        value={editForm.sku || ''}
                        onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1 font-medium">EAN Code</label>
                      <input
                        type="text"
                        value={editForm.ean || ''}
                        onChange={(e) => setEditForm({ ...editForm, ean: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Price</span>
                    <span className="text-sm font-bold text-white">
                      {selectedProduct.price !== null ? `€ ${Number(selectedProduct.price).toFixed(2)}` : 'N/A'}
                    </span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Brand</span>
                    <span className="text-xs font-semibold text-slate-200 truncate block">
                      {selectedProduct.brand || 'Not specified'}
                    </span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">SKU</span>
                    <span className="text-xs font-mono text-slate-200 block truncate">
                      {selectedProduct.sku || 'None'}
                    </span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">EAN</span>
                    <span className="text-xs font-mono text-slate-200 block truncate">
                      {selectedProduct.ean || 'None'}
                    </span>
                  </div>
                </div>
              )}

              {/* Product Images Preview */}
              {selectedProduct.images && selectedProduct.images.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 mb-2">Images ({selectedProduct.images.length})</h4>
                  <div className="flex space-x-2 overflow-x-auto pb-2">
                    {selectedProduct.images.map((img, idx) => (
                      <a
                        key={idx}
                        href={img}
                        target="_blank"
                        rel="noreferrer"
                        className="w-16 h-16 rounded-xl bg-slate-950 border border-slate-800 p-1 flex-shrink-0 flex items-center justify-center hover:border-emerald-500"
                      >
                        <img src={img} alt="" className="max-w-full max-h-full object-contain" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Variants Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-white flex items-center">
                    <Layers className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
                    Variants & Flavours ({selectedProduct.variants?.length || 0})
                  </h4>
                  <span className="text-[11px] text-slate-500">Independent records</span>
                </div>

                {!selectedProduct.variants || selectedProduct.variants.length === 0 ? (
                  <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-center text-slate-500">
                    No variants extracted for this product.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedProduct.variants.map((v) => (
                      <div
                        key={v.id}
                        className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-200 text-xs flex items-center space-x-2">
                            <span>{v.name}</span>
                            {v.availability && (
                              <span
                                className={`text-[10px] px-1.5 py-0.2 rounded-full font-medium ${
                                  v.availability === 'InStock'
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : 'bg-rose-500/10 text-rose-400'
                                }`}
                              >
                                {v.availability === 'InStock' ? 'In Stock' : 'Out of Stock'}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 mt-1 font-mono">
                            {v.sku && <span>SKU: {v.sku}</span>}
                            {v.ean && <span>EAN: {v.ean}</span>}
                            {v.expiry_date && (
                              <span className="text-amber-400/90 font-sans">
                                Expiry: {v.expiry_date}
                              </span>
                            )}
                            {v.stock_quantity !== null && (
                              <span className="text-slate-300 font-sans">Qty: {v.stock_quantity}</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end space-x-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-900">
                          <span className="text-xs font-bold text-white">
                            {v.price !== null ? `€ ${Number(v.price).toFixed(2)}` : 'N/A'}
                          </span>
                          <button
                            onClick={() => setEditingVariant(v)}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Description & Ingredients */}
              {selectedProduct.description && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 mb-1">Description</h4>
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-300 max-h-28 overflow-y-auto leading-relaxed">
                    {selectedProduct.description}
                  </div>
                </div>
              )}

              {selectedProduct.ingredients && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 mb-1">Ingredients</h4>
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-300 max-h-28 overflow-y-auto leading-relaxed">
                    {selectedProduct.ingredients}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-850 flex items-center justify-between rounded-b-2xl">
              <button
                onClick={() => {
                  setDeleteConfirmId(selectedProduct.id);
                  setSelectedProduct(null);
                }}
                className="text-xs text-rose-400 hover:text-rose-300 font-medium inline-flex items-center space-x-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Product</span>
              </button>
              <button
                onClick={() => {
                  setSelectedProduct(null);
                  setIsEditing(false);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Variant Mini-Modal */}
      {editingVariant && (
        <div className="fixed inset-0 z-55 flex items-center justify-center bg-black/75 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">Edit Variant: {editingVariant.name}</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Variant Name</label>
                <input
                  type="text"
                  value={editingVariant.name}
                  onChange={(e) => setEditingVariant({ ...editingVariant, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">SKU</label>
                  <input
                    type="text"
                    value={editingVariant.sku || ''}
                    onChange={(e) => setEditingVariant({ ...editingVariant, sku: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">EAN</label>
                  <input
                    type="text"
                    value={editingVariant.ean || ''}
                    onChange={(e) => setEditingVariant({ ...editingVariant, ean: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Price (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingVariant.price ?? ''}
                    onChange={(e) =>
                      setEditingVariant({
                        ...editingVariant,
                        price: e.target.value ? parseFloat(e.target.value) : null,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Stock</label>
                  <input
                    type="number"
                    value={editingVariant.stock_quantity ?? ''}
                    onChange={(e) =>
                      setEditingVariant({
                        ...editingVariant,
                        stock_quantity: e.target.value ? parseInt(e.target.value) : null,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Lot Expiry</label>
                <input
                  type="text"
                  placeholder="e.g. 30/06/2027"
                  value={editingVariant.expiry_date || ''}
                  onChange={(e) => setEditingVariant({ ...editingVariant, expiry_date: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setEditingVariant(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveVariantEdit}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
              >
                Save Variant
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-55 flex items-center justify-center bg-black/75 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-5 space-y-3">
            <h3 className="text-sm font-bold text-white">Confirm Deletion</h3>
            <p className="text-xs text-slate-400">
              Are you sure you want to delete this product and all associated variants? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const id = deleteConfirmId;
                  setDeleteConfirmId(null);
                  await onDeleteProduct(id);
                }}
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Dialog */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 z-55 flex items-center justify-center bg-black/75 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-5 space-y-3">
            <h3 className="text-sm font-bold text-white">Confirm Bulk Deletion</h3>
            <p className="text-xs text-slate-400">
              Are you sure you want to delete the {selectedIds.length} selected products? All associated records and variants will be deleted from the database.
            </p>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setBulkDeleteConfirm(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setBulkDeleteConfirm(false);
                  const ids = [...selectedIds];
                  setSelectedIds([]);
                  await onBulkDelete(ids);
                }}
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold"
              >
                Delete {selectedIds.length} Products
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
