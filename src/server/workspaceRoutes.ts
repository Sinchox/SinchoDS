import express, { Response } from 'express';
import {
  requireWorkspaceContext,
  AuthenticatedWorkspaceRequest,
  resolveUserMembership,
  inMemoryMemberships,
} from './workspaceMiddleware.js';
import {
  listWorkspaceProducts,
  getWorkspaceProduct,
  saveWorkspaceProduct,
  deleteWorkspaceProduct,
  bulkDeleteWorkspaceProducts,
  listWorkspaceSuppliers,
  saveWorkspaceSupplier,
  deleteWorkspaceSupplier,
  getWorkspaceEbayStatus,
  saveWorkspaceEbayTokens,
  getWorkspaceEbayTokensForPublishing,
  listWorkspaceEbayListings,
  saveWorkspaceEbayListing,
  deleteWorkspaceEbayListing,
  listWorkspaceOrders,
  saveWorkspaceOrder,
  listWorkspacePriceHistory,
  recordWorkspacePriceChange,
  listWorkspaceImportHistory,
  addWorkspaceImportHistory,
  clearWorkspaceImportHistory,
} from './workspaceStore.js';
import { verifyAuthUser, getWorkspaceConfig, createServiceRoleClient } from './workspace.js';

export const workspaceRouter = express.Router();

// ==============================================================================
// 1. WORKSPACE SWITCHING & MEMBERSHIP DIRECTORY
// ==============================================================================

/**
 * GET /api/workspaces
 * List all workspaces the authenticated user is a verified member of.
 */
workspaceRouter.get('/workspaces', async (req: AuthenticatedWorkspaceRequest, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const { user, error } = await verifyAuthUser(authHeader);

    if (error || !user) {
      res.status(401).json({ ok: false, error: error || 'Unauthorized' });
      return;
    }

    const config = getWorkspaceConfig();
    const workspaces: { id: string; name: string; role: string }[] = [];

    if (config.supabaseUrl && config.serviceRoleKey) {
      try {
        const client = createServiceRoleClient(config.supabaseUrl, config.serviceRoleKey);
        if (client) {
          const { data, error: qError } = await client
            .from('workspace_members')
            .select('workspace_id, role, workspaces (id, name, slug)')
            .eq('user_id', user.id);

          if (!qError && Array.isArray(data)) {
            for (const item of data) {
              const ws = item.workspaces as any;
              workspaces.push({
                id: item.workspace_id,
                name: ws?.name || 'Workspace',
                role: item.role,
              });
            }
          }
        }
      } catch {
        // Fallback
      }
    }

    // In-memory registry fallback / merge
    const local = inMemoryMemberships.get(user.id) || [];
    for (const mem of local) {
      if (!workspaces.some((w) => w.id === mem.workspaceId)) {
        workspaces.push({
          id: mem.workspaceId,
          name: `Workspace ${mem.workspaceId.slice(0, 8)}`,
          role: mem.role,
        });
      }
    }

    res.json({ ok: true, workspaces });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || 'Error listing workspaces' });
  }
});

/**
 * GET /api/workspaces/current
 * Returns verified active workspace details for the caller.
 */
workspaceRouter.get(
  '/workspaces/current',
  requireWorkspaceContext({ minRole: 'viewer' }),
  async (req: AuthenticatedWorkspaceRequest, res: Response) => {
    res.json({
      ok: true,
      workspace: req.workspace,
      user: req.user,
    });
  }
);

/**
 * POST /api/workspaces/switch
 * Validates target workspace membership server-side.
 */
workspaceRouter.post('/workspaces/switch', async (req: AuthenticatedWorkspaceRequest, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const { user, error } = await verifyAuthUser(authHeader);

    if (error || !user) {
      res.status(401).json({ ok: false, error: error || 'Unauthorized' });
      return;
    }

    const targetWorkspaceId = (req.body?.workspaceId || req.body?.workspace_id || '').trim();
    if (!targetWorkspaceId) {
      res.status(400).json({ ok: false, error: 'targetWorkspaceId is required.' });
      return;
    }

    const membership = await resolveUserMembership(user.id, targetWorkspaceId);
    if (!membership) {
      res.status(403).json({
        ok: false,
        error: 'Access Denied: You are not a member of the requested workspace.',
        workspaceId: targetWorkspaceId,
      });
      return;
    }

    res.json({
      ok: true,
      workspaceId: membership.workspaceId,
      role: membership.role,
      message: `Successfully switched to workspace ${membership.workspaceId}`,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || 'Error switching workspace' });
  }
});

// ==============================================================================
// 2. PRODUCTS & VARIANTS
// ==============================================================================

/**
 * GET /api/products
 * List products for verified workspace.
 */
workspaceRouter.get(
  '/products',
  requireWorkspaceContext({ minRole: 'viewer' }),
  async (req: AuthenticatedWorkspaceRequest, res: Response) => {
    try {
      const products = await listWorkspaceProducts(req.workspace!.id);
      res.json({ ok: true, products, workspaceId: req.workspace!.id });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Error fetching products' });
    }
  }
);

/**
 * GET /api/products/:id
 */
workspaceRouter.get(
  '/products/:id',
  requireWorkspaceContext({ minRole: 'viewer' }),
  async (req: AuthenticatedWorkspaceRequest, res: Response) => {
    try {
      const product = await getWorkspaceProduct(req.workspace!.id, req.params.id);
      if (!product) {
        res.status(404).json({ ok: false, error: 'Product not found in this workspace' });
        return;
      }
      res.json({ ok: true, product });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Error fetching product' });
    }
  }
);

/**
 * POST /api/products
 * Saves product scoped strictly to req.workspace.id (requires manager, admin, or owner)
 */
workspaceRouter.post(
  '/products',
  requireWorkspaceContext({ minRole: 'manager' }),
  async (req: AuthenticatedWorkspaceRequest, res: Response) => {
    try {
      const rawProduct = req.body?.product || req.body;
      if (!rawProduct || !rawProduct.title || !rawProduct.url) {
        res.status(400).json({ ok: false, error: 'Product title and url are required.' });
        return;
      }

      const result = await saveWorkspaceProduct(req.workspace!.id, rawProduct);
      if (!result.ok) {
        res.status(400).json({ ok: false, error: result.error });
        return;
      }
      res.json({ ok: true, product: result.product, workspaceId: req.workspace!.id });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Error saving product' });
    }
  }
);

/**
 * PUT /api/products/:id
 */
workspaceRouter.put(
  '/products/:id',
  requireWorkspaceContext({ minRole: 'manager' }),
  async (req: AuthenticatedWorkspaceRequest, res: Response) => {
    try {
      const rawProduct = req.body?.product || req.body;
      rawProduct.id = req.params.id;

      const result = await saveWorkspaceProduct(req.workspace!.id, rawProduct);
      if (!result.ok) {
        res.status(400).json({ ok: false, error: result.error });
        return;
      }
      res.json({ ok: true, product: result.product });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Error updating product' });
    }
  }
);

/**
 * DELETE /api/products/:id
 */
workspaceRouter.delete(
  '/products/:id',
  requireWorkspaceContext({ minRole: 'manager' }),
  async (req: AuthenticatedWorkspaceRequest, res: Response) => {
    try {
      const success = await deleteWorkspaceProduct(req.workspace!.id, req.params.id);
      if (!success) {
        res.status(404).json({ ok: false, error: 'Product not found in this workspace' });
        return;
      }
      res.json({ ok: true, message: 'Product deleted from workspace' });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Error deleting product' });
    }
  }
);

/**
 * POST /api/products/bulk-delete
 */
workspaceRouter.post(
  '/products/bulk-delete',
  requireWorkspaceContext({ minRole: 'manager' }),
  async (req: AuthenticatedWorkspaceRequest, res: Response) => {
    try {
      const ids = req.body?.ids;
      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ ok: false, error: 'ids array is required.' });
        return;
      }
      await bulkDeleteWorkspaceProducts(req.workspace!.id, ids);
      res.json({ ok: true, count: ids.length });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Error deleting products' });
    }
  }
);

// ==============================================================================
// 3. SUPPLIERS (Global + Workspace-Specific)
// ==============================================================================

/**
 * GET /api/suppliers
 * Returns global suppliers + workspace's suppliers.
 */
workspaceRouter.get(
  '/suppliers',
  requireWorkspaceContext({ minRole: 'viewer' }),
  async (req: AuthenticatedWorkspaceRequest, res: Response) => {
    try {
      const suppliers = await listWorkspaceSuppliers(req.workspace!.id);
      res.json({ ok: true, suppliers, workspaceId: req.workspace!.id });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Error listing suppliers' });
    }
  }
);

/**
 * POST /api/suppliers
 * Adds a custom workspace supplier (cannot be global).
 */
workspaceRouter.post(
  '/suppliers',
  requireWorkspaceContext({ minRole: 'manager' }),
  async (req: AuthenticatedWorkspaceRequest, res: Response) => {
    try {
      const supplier = req.body?.supplier || req.body;
      if (!supplier || !supplier.name || !supplier.baseUrl) {
        res.status(400).json({ ok: false, error: 'Supplier name and baseUrl are required.' });
        return;
      }

      const result = await saveWorkspaceSupplier(req.workspace!.id, supplier, req.workspace!.role);
      if (!result.ok) {
        res.status(403).json({ ok: false, error: result.error });
        return;
      }
      res.json({ ok: true, supplier: result.supplier });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Error saving supplier' });
    }
  }
);

/**
 * DELETE /api/suppliers/:id
 */
workspaceRouter.delete(
  '/suppliers/:id',
  requireWorkspaceContext({ minRole: 'admin' }),
  async (req: AuthenticatedWorkspaceRequest, res: Response) => {
    try {
      const result = await deleteWorkspaceSupplier(req.workspace!.id, req.params.id, req.workspace!.role);
      if (!result.ok) {
        res.status(403).json({ ok: false, error: result.error });
        return;
      }
      res.json({ ok: true, message: 'Supplier deleted from workspace' });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Error deleting supplier' });
    }
  }
);

// ==============================================================================
// 4. EBAY LISTINGS
// ==============================================================================

/**
 * GET /api/ebay-listings
 */
workspaceRouter.get(
  '/ebay-listings',
  requireWorkspaceContext({ minRole: 'viewer' }),
  async (req: AuthenticatedWorkspaceRequest, res: Response) => {
    try {
      const listings = await listWorkspaceEbayListings(req.workspace!.id);
      res.json({ ok: true, listings, workspaceId: req.workspace!.id });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Error fetching listings' });
    }
  }
);

/**
 * POST /api/ebay-listings
 */
workspaceRouter.post(
  '/ebay-listings',
  requireWorkspaceContext({ minRole: 'manager' }),
  async (req: AuthenticatedWorkspaceRequest, res: Response) => {
    try {
      const listing = req.body?.listing || req.body;
      if (!listing || !listing.title || !listing.price) {
        res.status(400).json({ ok: false, error: 'Listing title and price are required.' });
        return;
      }

      const result = await saveWorkspaceEbayListing(req.workspace!.id, listing);
      if (!result.ok) {
        res.status(400).json({ ok: false, error: result.error });
        return;
      }
      res.json({ ok: true, listing: result.listing });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Error saving listing' });
    }
  }
);

/**
 * DELETE /api/ebay-listings/:id
 */
workspaceRouter.delete(
  '/ebay-listings/:id',
  requireWorkspaceContext({ minRole: 'manager' }),
  async (req: AuthenticatedWorkspaceRequest, res: Response) => {
    try {
      const deleted = await deleteWorkspaceEbayListing(req.workspace!.id, req.params.id);
      if (!deleted) {
        res.status(404).json({ ok: false, error: 'Listing not found in this workspace' });
        return;
      }
      res.json({ ok: true, message: 'Listing deleted' });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Error deleting listing' });
    }
  }
);

// ==============================================================================
// 5. ORDERS
// ==============================================================================

/**
 * GET /api/orders
 */
workspaceRouter.get(
  '/orders',
  requireWorkspaceContext({ minRole: 'viewer' }),
  async (req: AuthenticatedWorkspaceRequest, res: Response) => {
    try {
      const orders = await listWorkspaceOrders(req.workspace!.id);
      res.json({ ok: true, orders, workspaceId: req.workspace!.id });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Error fetching orders' });
    }
  }
);

/**
 * POST /api/orders
 */
workspaceRouter.post(
  '/orders',
  requireWorkspaceContext({ minRole: 'manager' }),
  async (req: AuthenticatedWorkspaceRequest, res: Response) => {
    try {
      const order = req.body?.order || req.body;
      if (!order || !order.id) {
        res.status(400).json({ ok: false, error: 'Order payload is required.' });
        return;
      }

      const result = await saveWorkspaceOrder(req.workspace!.id, order);
      if (!result.ok) {
        res.status(400).json({ ok: false, error: result.error });
        return;
      }
      res.json({ ok: true, order: result.order });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Error saving order' });
    }
  }
);

// ==============================================================================
// 6. PRICE HISTORY & IMPORT HISTORY
// ==============================================================================

/**
 * GET /api/price-history
 */
workspaceRouter.get(
  '/price-history',
  requireWorkspaceContext({ minRole: 'viewer' }),
  async (req: AuthenticatedWorkspaceRequest, res: Response) => {
    try {
      const productId = req.query.productId as string;
      const history = await listWorkspacePriceHistory(req.workspace!.id, productId);
      res.json({ ok: true, history, workspaceId: req.workspace!.id });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Error fetching price history' });
    }
  }
);

/**
 * POST /api/price-history
 */
workspaceRouter.post(
  '/price-history',
  requireWorkspaceContext({ minRole: 'manager' }),
  async (req: AuthenticatedWorkspaceRequest, res: Response) => {
    try {
      const item = req.body?.item || req.body;
      await recordWorkspacePriceChange(req.workspace!.id, item);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Error recording price change' });
    }
  }
);

/**
 * GET /api/import-history
 */
workspaceRouter.get(
  '/import-history',
  requireWorkspaceContext({ minRole: 'viewer' }),
  async (req: AuthenticatedWorkspaceRequest, res: Response) => {
    try {
      const history = await listWorkspaceImportHistory(req.workspace!.id);
      res.json({ ok: true, history, workspaceId: req.workspace!.id });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Error fetching import history' });
    }
  }
);

/**
 * POST /api/import-history
 */
workspaceRouter.post(
  '/import-history',
  requireWorkspaceContext({ minRole: 'manager' }),
  async (req: AuthenticatedWorkspaceRequest, res: Response) => {
    try {
      const item = req.body?.item || req.body;
      await addWorkspaceImportHistory(req.workspace!.id, item);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Error recording import history' });
    }
  }
);

/**
 * DELETE /api/import-history
 */
workspaceRouter.delete(
  '/import-history',
  requireWorkspaceContext({ minRole: 'admin' }),
  async (req: AuthenticatedWorkspaceRequest, res: Response) => {
    try {
      await clearWorkspaceImportHistory(req.workspace!.id);
      res.json({ ok: true, message: 'Import history cleared' });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Error clearing import history' });
    }
  }
);

// ==============================================================================
// 7. WORKSPACE-SCOPED EBAY INTEGRATION
// ==============================================================================

/**
 * GET /api/ebay/status (workspace scoped)
 */
workspaceRouter.get(
  '/ebay/status',
  requireWorkspaceContext({ minRole: 'viewer' }),
  async (req: AuthenticatedWorkspaceRequest, res: Response) => {
    try {
      const status = await getWorkspaceEbayStatus(req.workspace!.id);
      res.json({
        ok: true,
        workspaceId: req.workspace!.id,
        ...status,
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Error getting eBay status' });
    }
  }
);

/**
 * POST /api/ebay/exchange-code (requires admin or owner of workspace)
 */
workspaceRouter.post(
  '/ebay/exchange-code',
  requireWorkspaceContext({ minRole: 'admin' }),
  async (req: AuthenticatedWorkspaceRequest, res: Response) => {
    try {
      const { code, clientId, clientSecret, ruName, environment } = req.body;

      if (!code || !clientId || !clientSecret || !ruName) {
        res.status(400).json({
          ok: false,
          error: 'All parameters (code, clientId, clientSecret, ruName) are required.',
        });
        return;
      }

      const env = (environment || 'PRODUCTION').toUpperCase();
      const tokenEndpoint = env === 'SANDBOX'
        ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
        : 'https://api.ebay.com/identity/v1/oauth2/token';

      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const params = new URLSearchParams();
      params.append('grant_type', 'authorization_code');
      params.append('code', code);
      params.append('redirect_uri', ruName);

      const tokenRes = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basicAuth}`,
        },
        body: params.toString(),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        res.status(tokenRes.status).json({
          ok: false,
          error: tokenData.error_description || tokenData.error || 'eBay token exchange error',
        });
        return;
      }

      // Save tokens strictly scoped to this workspace
      await saveWorkspaceEbayTokens(req.workspace!.id, {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
        environment: env as any,
        sellerUsername: 'Connected eBay Account',
        clientId,
      });

      // Never return access_token or refresh_token to client!
      res.json({
        ok: true,
        connected: true,
        workspaceId: req.workspace!.id,
        expiresIn: tokenData.expires_in,
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Error during token exchange' });
    }
  }
);

/**
 * POST /api/ebay/publish (workspace scoped)
 */
workspaceRouter.post(
  '/ebay/publish',
  requireWorkspaceContext({ minRole: 'manager' }),
  async (req: AuthenticatedWorkspaceRequest, res: Response) => {
    try {
      const { listing } = req.body;
      if (!listing) {
        res.status(400).json({ ok: false, error: 'Listing payload is required.' });
        return;
      }

      if (listing.title && listing.title.length > 80) {
        res.status(400).json({
          ok: false,
          error: `Title exceeds the 80 character limit allowed by eBay (${listing.title.length}/80).`,
        });
        return;
      }

      const tokens = await getWorkspaceEbayTokensForPublishing(req.workspace!.id);

      if (tokens && tokens.accessToken) {
        const apiHost = tokens.environment === 'SANDBOX'
          ? 'https://api.sandbox.ebay.com'
          : 'https://api.ebay.com';

        const sku = listing.sku || `SINCHO-${listing.id.substring(0, 8)}`;

        const inventoryPayload = {
          availability: {
            shipToLocationAvailability: {
              quantity: listing.quantity || 1,
            },
          },
          condition: listing.condition_id || 'NEW',
          product: {
            title: listing.title,
            description: listing.description_html,
            aspects: listing.item_specifics || {},
            brand: listing.brand || 'Generic',
            imageUrls: listing.images || [],
            ean: listing.ean ? [listing.ean] : undefined,
          },
        };

        const invRes = await fetch(`${apiHost}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
            'Content-Language': 'it-IT',
          },
          body: JSON.stringify(inventoryPayload),
        });

        if (!invRes.ok && invRes.status !== 204 && invRes.status !== 201 && invRes.status !== 200) {
          const invErr = await invRes.text();
          res.status(400).json({
            ok: false,
            error: `eBay Inventory Item error: ${invErr}`,
          });
          return;
        }

        const offerPayload = {
          sku,
          marketplaceId: listing.marketplace_id || 'EBAY_IT',
          format: 'FIXED_PRICE',
          pricingSummary: {
            price: {
              value: Number(listing.price).toFixed(2),
              currency: 'EUR',
            },
          },
          categoryId: listing.category_id || '180959',
          listingPolicies: {
            shippingPolicyId: listing.shipping_policy_id || undefined,
            returnPolicyId: listing.return_policy_id || undefined,
            paymentPolicyId: listing.payment_policy_id || undefined,
          },
        };

        const offerRes = await fetch(`${apiHost}/sell/inventory/v1/offer`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
            'Content-Language': 'it-IT',
          },
          body: JSON.stringify(offerPayload),
        });

        const offerData = await offerRes.json();
        if (!offerRes.ok) {
          res.status(400).json({
            ok: false,
            error: offerData.errors?.[0]?.message || 'eBay Offer creation error',
          });
          return;
        }

        const offerId = offerData.offerId;
        const pubRes = await fetch(`${apiHost}/sell/inventory/v1/offer/${offerId}/publish`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        const pubData = await pubRes.json();
        if (!pubRes.ok) {
          res.status(400).json({
            ok: false,
            error: pubData.errors?.[0]?.message || 'eBay Offer publication error',
          });
          return;
        }

        // Save published listing with workspace scoping
        await saveWorkspaceEbayListing(req.workspace!.id, {
          ...listing,
          status: 'active',
          ebay_item_id: pubData.listingId,
          ebay_offer_id: offerId,
          published_at: new Date().toISOString(),
        });

        res.json({
          ok: true,
          status: 'active',
          ebayItemId: pubData.listingId,
          ebayOfferId: offerId,
          workspaceId: req.workspace!.id,
          message: 'Listing successfully published to eBay.it!',
        });
        return;
      }

      // Not connected for this workspace
      res.json({
        ok: false,
        notConnected: true,
        status: 'draft',
        workspaceId: req.workspace!.id,
        message: 'eBay account not authorized for this workspace. Please connect eBay Developer credentials in Settings.',
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Internal publication error' });
    }
  }
);
