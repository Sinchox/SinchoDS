import { Product, Supplier, EbayListing, Order, PriceHistoryItem, ImportHistoryItem } from '../types.js';
import { INITIAL_SUPPLIERS } from '../utils/suppliers.js';
import { WorkspaceRole, hasMinimumRole } from './workspaceMiddleware.js';
import { getWorkspaceConfig, createServiceRoleClient } from './workspace.js';

export interface EbayAccountData {
  workspaceId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  environment: 'PRODUCTION' | 'SANDBOX';
  sellerUsername: string;
}

export interface WorkspaceMetadata {
  id: string;
  name: string;
  slug: string;
  created_by: string;
}

// Global suppliers accessible to ALL workspaces (read-only for regular workspaces)
const globalSuppliers: Supplier[] = INITIAL_SUPPLIERS.map((s) => ({
  ...s,
  // Ensure pluspower is designated as global
  id: s.id,
}));

// Scoped In-Memory Storage Partitions (Keyed strictly by workspaceId)
const workspaceProductsStore = new Map<string, Product[]>();
const workspaceSuppliersStore = new Map<string, Supplier[]>();
const workspaceEbayAccountsStore = new Map<string, EbayAccountData>();
const workspaceEbayListingsStore = new Map<string, EbayListing[]>();
const workspaceOrdersStore = new Map<string, Order[]>();
const workspacePriceHistoryStore = new Map<string, PriceHistoryItem[]>();
const workspaceImportHistoryStore = new Map<string, ImportHistoryItem[]>();
const workspaceInfoStore = new Map<string, WorkspaceMetadata>();

export function clearWorkspaceStore(): void {
  workspaceProductsStore.clear();
  workspaceSuppliersStore.clear();
  workspaceEbayAccountsStore.clear();
  workspaceEbayListingsStore.clear();
  workspaceOrdersStore.clear();
  workspacePriceHistoryStore.clear();
  workspaceImportHistoryStore.clear();
  workspaceInfoStore.clear();
}

export function registerWorkspaceMetadata(meta: WorkspaceMetadata): void {
  workspaceInfoStore.set(meta.id, meta);
}

// ==============================================================================
// 1. PRODUCTS & VARIANTS
// ==============================================================================

export async function listWorkspaceProducts(workspaceId: string): Promise<Product[]> {
  const config = getWorkspaceConfig();
  if (config.supabaseUrl && config.serviceRoleKey) {
    try {
      const client = createServiceRoleClient(config.supabaseUrl, config.serviceRoleKey);
      if (client) {
        const { data, error } = await client
          .from('products')
          .select('*, product_variants(*)')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          return data.map((row: any) => ({
            id: row.id,
            supplier_id: row.supplier_id || 'pluspower',
            supplier_name: row.supplier_name || 'PlusPower Supplements',
            supplier_product_id: row.supplier_product_id || null,
            url: row.url,
            title: row.title,
            brand: row.brand,
            category: row.category,
            price: row.price !== null ? Number(row.price) : null,
            original_price: row.original_price !== null ? Number(row.original_price) : null,
            discount_percentage: row.discount_percentage,
            currency: row.currency || 'EUR',
            sku: row.sku,
            ean: row.ean,
            availability: row.availability,
            stock_quantity: row.stock_quantity,
            description: row.description,
            ingredients: row.ingredients,
            nutrition: row.nutrition,
            images: Array.isArray(row.images) ? row.images : [],
            import_source: row.import_source || 'html_import',
            status: row.status || 'ready',
            error: row.error,
            created_at: row.created_at,
            updated_at: row.updated_at,
            ebay_listing_id: row.ebay_listing_id || null,
            ebay_status: row.ebay_status || 'not_listed',
            last_synced_at: row.last_synced_at || null,
            variants: Array.isArray(row.product_variants) ? row.product_variants : [],
          }));
        }
      }
    } catch {
      // Fallback to local scoped store
    }
  }

  const list = workspaceProductsStore.get(workspaceId) || [];
  return [...list];
}

export async function getWorkspaceProduct(workspaceId: string, productId: string): Promise<Product | null> {
  const products = await listWorkspaceProducts(workspaceId);
  return products.find((p) => p.id === productId) || null;
}

export async function saveWorkspaceProduct(
  workspaceId: string,
  product: Product
): Promise<{ ok: boolean; product: Product; error?: string }> {
  // CRITICAL SECURITY ENFORCEMENT:
  // Overwrite any workspace_id passed in the payload with the verified workspaceId
  const scopedProduct: Product = {
    ...product,
    supplier_id: product.supplier_id || 'pluspower',
    supplier_name: product.supplier_name || (product.supplier_id === 'pluspower' ? 'PlusPower Supplements' : 'Supplier'),
    created_at: product.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const config = getWorkspaceConfig();
  if (config.supabaseUrl && config.serviceRoleKey) {
    try {
      const client = createServiceRoleClient(config.supabaseUrl, config.serviceRoleKey);
      if (client) {
        const payload = {
          id: scopedProduct.id,
          workspace_id: workspaceId, // Strictly scoped
          supplier_id: scopedProduct.supplier_id,
          supplier_name: scopedProduct.supplier_name,
          supplier_product_id: scopedProduct.supplier_product_id,
          url: scopedProduct.url,
          title: scopedProduct.title,
          brand: scopedProduct.brand,
          category: scopedProduct.category,
          price: scopedProduct.price,
          original_price: scopedProduct.original_price,
          discount_percentage: scopedProduct.discount_percentage,
          currency: scopedProduct.currency,
          sku: scopedProduct.sku,
          ean: scopedProduct.ean,
          availability: scopedProduct.availability,
          stock_quantity: scopedProduct.stock_quantity,
          description: scopedProduct.description,
          ingredients: scopedProduct.ingredients,
          nutrition: scopedProduct.nutrition,
          images: scopedProduct.images,
          raw_jsonld: scopedProduct.raw_jsonld,
          import_source: scopedProduct.import_source,
          status: scopedProduct.status,
          error: scopedProduct.error,
          ebay_listing_id: scopedProduct.ebay_listing_id,
          ebay_status: scopedProduct.ebay_status,
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { data: savedProd, error: pError } = await client
          .from('products')
          .upsert(payload, { onConflict: 'workspace_id,url' })
          .select()
          .single();

        if (pError) {
          return { ok: false, product: scopedProduct, error: pError.message };
        }

        scopedProduct.id = savedProd.id;

        // Variants sync
        if (scopedProduct.variants && scopedProduct.variants.length > 0) {
          await client.from('product_variants').delete().eq('product_id', savedProd.id);
          const variantPayloads = scopedProduct.variants.map((v) => ({
            product_id: savedProd.id,
            variant_id: v.variant_id ? String(v.variant_id) : null,
            option_id: v.option_id ? String(v.option_id) : null,
            name: v.name,
            sku: v.sku,
            ean: v.ean,
            price: v.price,
            original_price: v.original_price,
            stock_quantity: v.stock_quantity,
            availability: v.availability,
            expiry_date: v.expiry_date,
            available_online: v.available_online,
            raw_data: v.raw_data || {},
          }));
          await client.from('product_variants').insert(variantPayloads);
        }

        return { ok: true, product: scopedProduct };
      }
    } catch {
      // Fallback to in-memory store
    }
  }

  // Scoped in-memory partition update
  const list = workspaceProductsStore.get(workspaceId) || [];
  const existingIdx = list.findIndex((p) => p.id === scopedProduct.id || p.url === scopedProduct.url);
  if (existingIdx >= 0) {
    list[existingIdx] = scopedProduct;
  } else {
    list.unshift(scopedProduct);
  }
  workspaceProductsStore.set(workspaceId, list);

  return { ok: true, product: scopedProduct };
}

export async function deleteWorkspaceProduct(workspaceId: string, productId: string): Promise<boolean> {
  const config = getWorkspaceConfig();
  if (config.supabaseUrl && config.serviceRoleKey) {
    try {
      const client = createServiceRoleClient(config.supabaseUrl, config.serviceRoleKey);
      if (client) {
        // Must filter strictly by BOTH id AND workspace_id
        const { error } = await client
          .from('products')
          .delete()
          .eq('id', productId)
          .eq('workspace_id', workspaceId);

        if (!error) return true;
      }
    } catch {
      // Fallback
    }
  }

  const list = workspaceProductsStore.get(workspaceId) || [];
  const filtered = list.filter((p) => p.id !== productId);
  const deleted = filtered.length < list.length;
  workspaceProductsStore.set(workspaceId, filtered);
  return deleted;
}

export async function bulkDeleteWorkspaceProducts(workspaceId: string, productIds: string[]): Promise<boolean> {
  const config = getWorkspaceConfig();
  if (config.supabaseUrl && config.serviceRoleKey) {
    try {
      const client = createServiceRoleClient(config.supabaseUrl, config.serviceRoleKey);
      if (client) {
        await client
          .from('products')
          .delete()
          .in('id', productIds)
          .eq('workspace_id', workspaceId);
        return true;
      }
    } catch {
      // Fallback
    }
  }

  const list = workspaceProductsStore.get(workspaceId) || [];
  const filtered = list.filter((p) => !productIds.includes(p.id));
  workspaceProductsStore.set(workspaceId, filtered);
  return true;
}

// ==============================================================================
// 2. SUPPLIERS (Global Reusable + Workspace-Specific)
// ==============================================================================

export async function listWorkspaceSuppliers(workspaceId: string): Promise<Supplier[]> {
  const config = getWorkspaceConfig();
  if (config.supabaseUrl && config.serviceRoleKey) {
    try {
      const client = createServiceRoleClient(config.supabaseUrl, config.serviceRoleKey);
      if (client) {
        // Query global suppliers OR suppliers belonging to this workspace
        const { data, error } = await client
          .from('suppliers')
          .select('*')
          .or(`is_global.eq.true,workspace_id.eq.${workspaceId}`);

        if (!error && Array.isArray(data)) {
          return data.map((row: any) => ({
            id: row.id,
            name: row.name,
            baseUrl: row.base_url,
            logoText: row.logo_text || row.name.slice(0, 2).toUpperCase(),
            status: row.is_active ? 'active' : 'disabled',
            lastSyncAt: row.last_sync_at,
            productCount: row.product_count || 0,
            failedCount: 0,
            description: row.description || '',
            supportedFeatures: row.config?.features || {
              sitemap: true,
              variants: true,
              lotExpiry: true,
              liveScraping: true,
              htmlImport: true,
            },
          }));
        }
      }
    } catch {
      // Fallback
    }
  }

  // Combine global reusable suppliers with workspace-specific suppliers
  const custom = workspaceSuppliersStore.get(workspaceId) || [];
  return [...globalSuppliers, ...custom];
}

export async function saveWorkspaceSupplier(
  workspaceId: string,
  supplier: Supplier,
  userRole: WorkspaceRole
): Promise<{ ok: boolean; supplier?: Supplier; error?: string }> {
  if (!hasMinimumRole(userRole, 'manager')) {
    return { ok: false, error: 'Access Denied: Role manager or higher is required to manage suppliers.' };
  }

  // Prevent modifying global suppliers
  const isGlobal = globalSuppliers.some((s) => s.id === supplier.id);
  if (isGlobal) {
    return { ok: false, error: 'Access Denied: Global reusable suppliers are system-wide and cannot be modified.' };
  }

  const customList = workspaceSuppliersStore.get(workspaceId) || [];
  const existingIdx = customList.findIndex((s) => s.id === supplier.id);
  if (existingIdx >= 0) {
    customList[existingIdx] = supplier;
  } else {
    customList.push(supplier);
  }
  workspaceSuppliersStore.set(workspaceId, customList);

  return { ok: true, supplier };
}

export async function deleteWorkspaceSupplier(
  workspaceId: string,
  supplierId: string,
  userRole: WorkspaceRole
): Promise<{ ok: boolean; error?: string }> {
  if (!hasMinimumRole(userRole, 'admin')) {
    return { ok: false, error: 'Access Denied: Role admin or higher is required to delete suppliers.' };
  }

  // Prevent deleting global suppliers
  if (globalSuppliers.some((s) => s.id === supplierId)) {
    return { ok: false, error: 'Access Denied: Global reusable suppliers cannot be deleted.' };
  }

  const customList = workspaceSuppliersStore.get(workspaceId) || [];
  const filtered = customList.filter((s) => s.id !== supplierId);
  if (filtered.length === customList.length) {
    return { ok: false, error: 'Supplier not found in this workspace.' };
  }
  workspaceSuppliersStore.set(workspaceId, filtered);
  return { ok: true };
}

// ==============================================================================
// 3. EBAY ACCOUNTS & CREDENTIALS ISOLATION
// ==============================================================================

export async function getWorkspaceEbayStatus(workspaceId: string): Promise<{
  connected: boolean;
  environment: 'PRODUCTION' | 'SANDBOX';
  sellerUsername: string | null;
  expiresAt: string | null;
}> {
  const config = getWorkspaceConfig();
  if (config.supabaseUrl && config.serviceRoleKey) {
    try {
      const client = createServiceRoleClient(config.supabaseUrl, config.serviceRoleKey);
      if (client) {
        // Query safe non-credential columns only
        const { data, error } = await client
          .from('ebay_accounts')
          .select('connected, environment, seller_username, token_expires_at')
          .eq('workspace_id', workspaceId)
          .maybeSingle();

        if (!error && data) {
          const isExpired = data.token_expires_at ? new Date(data.token_expires_at).getTime() < Date.now() : true;
          return {
            connected: Boolean(data.connected && !isExpired),
            environment: data.environment || 'PRODUCTION',
            sellerUsername: data.seller_username,
            expiresAt: data.token_expires_at,
          };
        }
      }
    } catch {
      // Fallback
    }
  }

  const account = workspaceEbayAccountsStore.get(workspaceId);
  if (!account || !account.accessToken || account.expiresAt <= Date.now()) {
    return {
      connected: false,
      environment: 'PRODUCTION',
      sellerUsername: null,
      expiresAt: null,
    };
  }

  return {
    connected: true,
    environment: account.environment,
    sellerUsername: account.sellerUsername,
    expiresAt: new Date(account.expiresAt).toISOString(),
  };
}

export async function saveWorkspaceEbayTokens(
  workspaceId: string,
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    environment: 'PRODUCTION' | 'SANDBOX';
    sellerUsername: string;
    clientId?: string;
  }
): Promise<void> {
  const expiresAt = Date.now() + (tokens.expiresIn || 7200) * 1000;
  const tokenRecord: EbayAccountData = {
    workspaceId,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt,
    environment: tokens.environment,
    sellerUsername: tokens.sellerUsername,
  };

  const config = getWorkspaceConfig();
  if (config.supabaseUrl && config.serviceRoleKey) {
    try {
      const client = createServiceRoleClient(config.supabaseUrl, config.serviceRoleKey);
      if (client) {
        await client.from('ebay_accounts').upsert(
          {
            workspace_id: workspaceId,
            client_id: tokens.clientId || 'EBAY_CLIENT',
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            environment: tokens.environment,
            seller_username: tokens.sellerUsername,
            connected: true,
            token_expires_at: new Date(expiresAt).toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'workspace_id' }
        );
      }
    } catch {
      // Fallback
    }
  }

  workspaceEbayAccountsStore.set(workspaceId, tokenRecord);
}

export async function getWorkspaceEbayTokensForPublishing(workspaceId: string): Promise<{
  accessToken: string;
  environment: 'PRODUCTION' | 'SANDBOX';
} | null> {
  const config = getWorkspaceConfig();
  if (config.supabaseUrl && config.serviceRoleKey) {
    try {
      const client = createServiceRoleClient(config.supabaseUrl, config.serviceRoleKey);
      if (client) {
        const { data } = await client
          .from('ebay_accounts')
          .select('access_token, environment, token_expires_at')
          .eq('workspace_id', workspaceId)
          .maybeSingle();

        if (data && data.access_token) {
          const isExpired = data.token_expires_at ? new Date(data.token_expires_at).getTime() < Date.now() : false;
          if (!isExpired) {
            return {
              accessToken: data.access_token,
              environment: data.environment || 'PRODUCTION',
            };
          }
        }
      }
    } catch {
      // Fallback
    }
  }

  const account = workspaceEbayAccountsStore.get(workspaceId);
  if (account && account.accessToken && account.expiresAt > Date.now()) {
    return {
      accessToken: account.accessToken,
      environment: account.environment,
    };
  }
  return null;
}

// ==============================================================================
// 4. EBAY LISTINGS
// ==============================================================================

export async function listWorkspaceEbayListings(workspaceId: string): Promise<EbayListing[]> {
  const config = getWorkspaceConfig();
  if (config.supabaseUrl && config.serviceRoleKey) {
    try {
      const client = createServiceRoleClient(config.supabaseUrl, config.serviceRoleKey);
      if (client) {
        const { data, error } = await client
          .from('ebay_listings')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          return data;
        }
      }
    } catch {
      // Fallback
    }
  }

  return [...(workspaceEbayListingsStore.get(workspaceId) || [])];
}

export async function saveWorkspaceEbayListing(
  workspaceId: string,
  listing: EbayListing
): Promise<{ ok: boolean; listing: EbayListing; error?: string }> {
  const scopedListing: EbayListing = {
    ...listing,
    created_at: listing.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const config = getWorkspaceConfig();
  if (config.supabaseUrl && config.serviceRoleKey) {
    try {
      const client = createServiceRoleClient(config.supabaseUrl, config.serviceRoleKey);
      if (client) {
        const payload = {
          ...scopedListing,
          workspace_id: workspaceId, // Strictly scoped
        };
        const { error } = await client.from('ebay_listings').upsert(payload, { onConflict: 'id' });
        if (error) {
          return { ok: false, listing: scopedListing, error: error.message };
        }
        return { ok: true, listing: scopedListing };
      }
    } catch {
      // Fallback
    }
  }

  const list = workspaceEbayListingsStore.get(workspaceId) || [];
  const existingIdx = list.findIndex((l) => l.id === scopedListing.id);
  if (existingIdx >= 0) {
    list[existingIdx] = scopedListing;
  } else {
    list.unshift(scopedListing);
  }
  workspaceEbayListingsStore.set(workspaceId, list);
  return { ok: true, listing: scopedListing };
}

export async function deleteWorkspaceEbayListing(workspaceId: string, listingId: string): Promise<boolean> {
  const config = getWorkspaceConfig();
  if (config.supabaseUrl && config.serviceRoleKey) {
    try {
      const client = createServiceRoleClient(config.supabaseUrl, config.serviceRoleKey);
      if (client) {
        const { error } = await client
          .from('ebay_listings')
          .delete()
          .eq('id', listingId)
          .eq('workspace_id', workspaceId);
        if (!error) return true;
      }
    } catch {
      // Fallback
    }
  }

  const list = workspaceEbayListingsStore.get(workspaceId) || [];
  const filtered = list.filter((l) => l.id !== listingId);
  const deleted = filtered.length < list.length;
  workspaceEbayListingsStore.set(workspaceId, filtered);
  return deleted;
}

// ==============================================================================
// 5. ORDERS
// ==============================================================================

export async function listWorkspaceOrders(workspaceId: string): Promise<Order[]> {
  const config = getWorkspaceConfig();
  if (config.supabaseUrl && config.serviceRoleKey) {
    try {
      const client = createServiceRoleClient(config.supabaseUrl, config.serviceRoleKey);
      if (client) {
        const { data, error } = await client
          .from('orders')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          return data;
        }
      }
    } catch {
      // Fallback
    }
  }

  return [...(workspaceOrdersStore.get(workspaceId) || [])];
}

export async function saveWorkspaceOrder(
  workspaceId: string,
  order: Order
): Promise<{ ok: boolean; order: Order; error?: string }> {
  const scopedOrder: Order = {
    ...order,
    created_at: order.created_at || new Date().toISOString(),
  };

  const config = getWorkspaceConfig();
  if (config.supabaseUrl && config.serviceRoleKey) {
    try {
      const client = createServiceRoleClient(config.supabaseUrl, config.serviceRoleKey);
      if (client) {
        const payload = {
          ...scopedOrder,
          workspace_id: workspaceId,
        };
        const { error } = await client.from('orders').upsert(payload, { onConflict: 'id' });
        if (error) return { ok: false, order: scopedOrder, error: error.message };
        return { ok: true, order: scopedOrder };
      }
    } catch {
      // Fallback
    }
  }

  const list = workspaceOrdersStore.get(workspaceId) || [];
  const existingIdx = list.findIndex((o) => o.id === scopedOrder.id);
  if (existingIdx >= 0) {
    list[existingIdx] = scopedOrder;
  } else {
    list.unshift(scopedOrder);
  }
  workspaceOrdersStore.set(workspaceId, list);
  return { ok: true, order: scopedOrder };
}

// ==============================================================================
// 6. PRICE & IMPORT HISTORY
// ==============================================================================

export async function listWorkspacePriceHistory(workspaceId: string, productId?: string): Promise<PriceHistoryItem[]> {
  const list = workspacePriceHistoryStore.get(workspaceId) || [];
  if (productId) {
    return list.filter((item) => item.product_id === productId);
  }
  return [...list];
}

export async function recordWorkspacePriceChange(workspaceId: string, item: PriceHistoryItem): Promise<void> {
  const list = workspacePriceHistoryStore.get(workspaceId) || [];
  list.unshift(item);
  workspacePriceHistoryStore.set(workspaceId, list.slice(0, 500));
}

export async function listWorkspaceImportHistory(workspaceId: string): Promise<ImportHistoryItem[]> {
  return [...(workspaceImportHistoryStore.get(workspaceId) || [])];
}

export async function addWorkspaceImportHistory(workspaceId: string, item: ImportHistoryItem): Promise<void> {
  const list = workspaceImportHistoryStore.get(workspaceId) || [];
  list.unshift(item);
  workspaceImportHistoryStore.set(workspaceId, list.slice(0, 500));
}

export async function clearWorkspaceImportHistory(workspaceId: string): Promise<void> {
  workspaceImportHistoryStore.set(workspaceId, []);
}
