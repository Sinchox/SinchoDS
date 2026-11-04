export interface ProductVariant {
  id: string; // uuid or internal id
  product_id?: string;
  variant_id?: string | number | null; // e.g. site internal id
  option_id?: string | null;
  name: string; // flavour, size, etc.
  sku: string | null;
  ean: string | null;
  price: string | number | null;
  original_price: string | number | null;
  stock_quantity: number | null;
  availability: 'InStock' | 'OutOfStock' | 'PreOrder' | string | null;
  expiry_date?: string | null;
  available_online?: boolean | null;
  raw_data?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface Product {
  id: string; // uuid
  supplier_id: string; // e.g. 'pluspower'
  supplier_name?: string;
  supplier_product_id?: string | null;
  url: string;
  title: string;
  brand: string | null;
  category: string | null;
  price: string | number | null; // current supplier cost
  original_price: string | number | null;
  discount_percentage?: number | null;
  currency: string;
  sku: string | null;
  ean: string | null;
  availability: 'InStock' | 'OutOfStock' | 'PreOrder' | string | null;
  stock_quantity: number | null;
  description: string | null;
  ingredients: string | null;
  nutrition: string | null;
  images: string[];
  variants: ProductVariant[];
  raw_jsonld?: any;
  import_source: 'live_scraper' | 'sitemap' | 'html_import' | 'manual' | 'zenrows_scraper';
  status: 'ready' | 'needs_review' | 'blocked' | 'error';
  error?: string | null;
  created_at: string;
  updated_at: string;
  // eBay relation
  ebay_listing_id?: string | null;
  ebay_status?: 'not_listed' | 'draft' | 'active' | 'ended' | 'error';
  last_synced_at?: string | null;
}

export interface Supplier {
  id: string;
  name: string;
  baseUrl: string;
  logoText: string;
  status: 'active' | 'disabled' | 'maintenance';
  lastSyncAt: string | null;
  productCount: number;
  failedCount: number;
  description: string;
  supportedFeatures: {
    sitemap: boolean;
    variants: boolean;
    lotExpiry: boolean;
    liveScraping: boolean;
    htmlImport: boolean;
  };
}

export interface PricingRule {
  targetMarginPercent: number; // e.g. 25 (%)
  targetFixedProfit: number; // e.g. 5 (€)
  supplierShippingCost: number; // e.g. 4.90 (€)
  ebayFeePercent: number; // e.g. 11.5 (%)
  ebayFixedFee: number; // e.g. 0.35 (€)
  paymentFeePercent: number; // e.g. 0 (%)
  vatRatePercent: number; // e.g. 22 (%)
}

export interface PricingCalculation {
  supplierCost: number;
  supplierShipping: number;
  totalCost: number;
  recommendedPrice: number;
  expectedEbayFees: number;
  expectedNetProfit: number;
  profitMarginPercent: number;
  breakEvenPrice: number;
}

export interface EbayListingVariant {
  sku: string;
  name: string;
  ean: string | null;
  price: number;
  quantity: number;
  expiryDate?: string | null;
}

export interface EbayListing {
  id: string;
  product_id: string;
  supplier_id: string;
  supplier_url: string;
  marketplace_id: string; // 'EBAY_IT'
  title: string; // max 80 chars
  subtitle?: string;
  category_id: string;
  category_name?: string;
  condition_id: string; // 'NEW' (1000)
  price: number;
  original_supplier_cost: number;
  expected_profit: number;
  quantity: number;
  sku: string | null;
  ean: string | null;
  brand: string | null;
  description_html: string;
  images: string[];
  item_specifics: Record<string, string>;
  shipping_policy_id?: string;
  return_policy_id?: string;
  payment_policy_id?: string;
  status: 'draft' | 'active' | 'ended' | 'error';
  validation_status?: 'ready' | 'needs_review' | 'invalid';
  validation_errors?: string[];
  word_count?: number;
  ebay_item_id?: string | null;
  ebay_offer_id?: string | null;
  error_message?: string | null;
  variants: EbayListingVariant[];
  created_at: string;
  updated_at: string;
  published_at?: string | null;
}

export interface ListingValidationCheck {
  id: string;
  label: string;
  passed: boolean;
  message: string;
  severity: 'error' | 'warning';
}

export interface ListingValidationResult {
  isValid: boolean;
  isReady: boolean;
  wordCount: number;
  wordCountValid: boolean;
  titleValid: boolean;
  checks: ListingValidationCheck[];
}

export interface EbayAccountConfig {
  clientId: string;
  clientSecret: string;
  ruName: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  marketplaceId: string;
  connected: boolean;
  tokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  sellerUsername?: string | null;
}

export interface PriceHistoryItem {
  id: string;
  product_id: string;
  supplier_id: string;
  old_price: number | null;
  new_price: number | null;
  old_stock: number | null;
  new_stock: number | null;
  changed_at: string;
}

export interface Order {
  id: string;
  ebay_order_id: string;
  created_at: string;
  buyer_username: string;
  total_paid: number;
  currency: string;
  status: 'pending_fulfillment' | 'fulfilled' | 'cancelled' | 'refunded';
  items: {
    product_id: string;
    title: string;
    variant_name?: string;
    sku: string;
    quantity: number;
    sale_price: number;
    supplier_cost: number;
    supplier_url: string;
  }[];
  tracking_number?: string | null;
  carrier?: string | null;
}

export interface ScrapingJobItem {
  url: string;
  status: 'pending' | 'processing' | 'success' | 'blocked' | 'failed';
  error?: string;
  product?: Product;
}

export interface ImportHistoryItem {
  id: string;
  url: string;
  title: string;
  source: 'live_scraper' | 'sitemap' | 'html_import' | 'manual' | 'zenrows_scraper';
  status: 'success' | 'blocked' | 'failed';
  message: string;
  timestamp: string;
  supplier_id?: string;
}

export interface ScraperSettings {
  supabaseUrl: string;
  supabaseAnonKey: string;
  defaultDelaySeconds: number;
  defaultBatchSize: number;
  csvDelimiter: string;
  autoFormatEuroPrices: boolean;
  userAgent: string;
  // eBay & Pricing defaults
  ebayConfig: EbayAccountConfig;
  defaultPricingRule: PricingRule;
}
