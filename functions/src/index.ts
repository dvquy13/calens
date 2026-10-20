import {setGlobalOptions} from "firebase-functions";
import {onRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import {verifyGoogleToken, GoogleTokenInfo} from "./auth";
import {handleDiagnostics, createFirestoreStore} from "./diagnostics";

// Define secrets
const lemonSqueezyApiKey = defineSecret("LEMONSQUEEZY_API_KEY");
const lemonSqueezyWebhookSecret = defineSecret("LEMONSQUEEZY_WEBHOOK_SECRET");
const discordFeedbackWebhook = defineSecret("DISCORD_FEEDBACK_WEBHOOK_URL");

// Initialize Firebase Admin
admin.initializeApp();

setGlobalOptions({maxInstances: 10});

/**
 * Cloud Function: checkSubscription
 *
 * Validates user's Google ID token and returns a constant "active" status.
 * Calens is free for everyone, so no Firestore reads or writes happen here.
 */
export const checkSubscription = onRequest({
  cors: true,
  maxInstances: 10,
}, async (req, res) => {
  // Only accept POST requests
  if (req.method !== "POST") {
    res.status(405).json({error: "Method not allowed"});
    return;
  }

  try {
    const {email, idToken} = req.body;

    if (!email || !idToken) {
      res.status(400).json({error: "Missing email or idToken"});
      return;
    }

    // Verify Google OAuth access token using Google's tokeninfo endpoint
    let tokenInfo: GoogleTokenInfo;
    try {
      tokenInfo = await verifyGoogleToken(idToken);
      logger.info("Token verified:", {email: tokenInfo.email});
    } catch (error) {
      logger.error("Token verification error:", error);
      res.status(401).json({error: "Invalid token"});
      return;
    }

    // Verify email matches token
    if (tokenInfo.email !== email) {
      logger.error("Email mismatch:", {
        provided: email,
        inToken: tokenInfo.email,
      });
      res.status(401).json({error: "Email mismatch"});
      return;
    }

    // Verify email is verified
    if (!tokenInfo.email_verified) {
      res.status(401).json({error: "Email not verified"});
      return;
    }

    // Free for everyone: no user docs, no trial, no gating.
    // "active" + whitelisted keeps old clients from showing the paywall.
    res.json({
      canUseFeatures: true,
      subscriptionStatus: "active",
      whitelisted: true,
    });
  } catch (error) {
    logger.error("checkSubscription error:", error);
    res.status(500).json({error: "Internal server error"});
  }
});

/**
 * Cloud Function: createCheckout
 *
 * Creates a LemonSqueezy checkout URL via API
 * Milestone 4: Dynamic checkout creation
 */
export const createCheckout = onRequest({
  cors: true,
  maxInstances: 10,
  secrets: [lemonSqueezyApiKey],
}, async (req, res) => {
  // Only accept POST requests
  if (req.method !== "POST") {
    res.status(405).json({error: "Method not allowed"});
    return;
  }

  try {
    const {email, idToken} = req.body;

    if (!email || !idToken) {
      res.status(400).json({error: "Missing email or idToken"});
      return;
    }

    // Verify Google OAuth access token
    let tokenInfo: any;
    try {
      const tokenInfoResponse = await fetch(
        `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${idToken}`,
      );

      if (!tokenInfoResponse.ok) {
        logger.error(
          "Token verification failed:",
          await tokenInfoResponse.text(),
        );
        res.status(401).json({error: "Invalid token"});
        return;
      }

      tokenInfo = await tokenInfoResponse.json();
    } catch (error) {
      logger.error("Token verification error:", error);
      res.status(401).json({error: "Invalid token"});
      return;
    }

    // Verify email matches token
    if (tokenInfo.email !== email) {
      logger.error("Email mismatch:", {
        provided: email,
        inToken: tokenInfo.email,
      });
      res.status(401).json({error: "Email mismatch"});
      return;
    }

    // Get LemonSqueezy API key from secret
    const apiKey = lemonSqueezyApiKey.value();
    if (!apiKey) {
      logger.error("LEMONSQUEEZY_API_KEY not configured");
      res.status(500).json({error: "API key not configured"});
      return;
    }

    // LemonSqueezy configuration
    const storeId = "255407";

    // Variant IDs for different pricing tiers (Live mode)
    const VARIANT_IDS = {
      monthly: "1211529",
      annual: "1211527",
      lifetime: "1211528",
    };

    // Get pricing tier from request (default to monthly)
    const requestedTier = req.body.pricingTier || "monthly";
    const pricingTier = requestedTier as keyof typeof VARIANT_IDS;
    const variantId = VARIANT_IDS[pricingTier] || VARIANT_IDS.monthly;

    logger.info("Creating checkout:", {email, pricingTier, variantId});

    // Fetch Remote Config for active promotions
    let discountCode: string | null = null;
    try {
      const remoteConfig = admin.remoteConfig();
      const template = await remoteConfig.getTemplate();
      const activePromotionsParam = template.parameters?.active_promotions;

      if (activePromotionsParam && activePromotionsParam.defaultValue) {
        const valueString =
          (activePromotionsParam.defaultValue as any).value || "{}";
        const activePromotions = JSON.parse(valueString);

        // Find first active promotion
        for (const promotion of Object.values(activePromotions)) {
          const promo = promotion as any;
          if (promo && promo.active && promo.appliesTo?.includes(pricingTier)) {
            discountCode = promo.code;
            logger.info("Applying promotion:", {
              code: discountCode,
              tier: pricingTier,
            });
            break;
          }
        }
      }
    } catch (error) {
      // Don't fail checkout if Remote Config fetch fails
      logger.warn(
        "Failed to fetch Remote Config, proceeding without discount:",
        error,
      );
    }

    // Build checkout attributes
    const checkoutAttributes: any = {
      checkout_data: {
        email: email,
        custom: {
          user_email: email,
        },
      },
    };

    // Add discount code if active promotion found
    if (discountCode) {
      checkoutAttributes.checkout_data.discount_code = discountCode;
    }

    // Create checkout via LemonSqueezy API
    const checkoutResponse = await fetch(
      "https://api.lemonsqueezy.com/v1/checkouts",
      {
        method: "POST",
        headers: {
          "Accept": "application/vnd.api+json",
          "Content-Type": "application/vnd.api+json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          data: {
            type: "checkouts",
            attributes: checkoutAttributes,
            relationships: {
              store: {
                data: {
                  type: "stores",
                  id: storeId,
                },
              },
              variant: {
                data: {
                  type: "variants",
                  id: variantId,
                },
              },
            },
          },
        }),
      },
    );

    if (!checkoutResponse.ok) {
      const errorText = await checkoutResponse.text();
      logger.error("LemonSqueezy API error:", errorText);
      res.status(500).json({error: "Failed to create checkout"});
      return;
    }

    const checkoutData = await checkoutResponse.json();
    const checkoutUrl = checkoutData.data?.attributes?.url;

    if (!checkoutUrl) {
      logger.error("No checkout URL in response:", checkoutData);
      res.status(500).json({error: "No checkout URL returned"});
      return;
    }

    logger.info("Checkout created:", {email, checkoutUrl});
    res.json({checkoutUrl});
  } catch (error) {
    logger.error("createCheckout error:", error);
    res.status(500).json({error: "Internal server error"});
  }
});

/**
 * Cloud Function: getPromotionConfig
 *
 * Fetches active promotion configuration from Firebase Remote Config
 * Milestone 6: Launch Promotion - 50% Discount
 */
export const getPromotionConfig = onRequest({
  cors: true,
  maxInstances: 10,
}, async (req, res) => {
  // Only accept POST requests
  if (req.method !== "POST") {
    res.status(405).json({error: "Method not allowed"});
    return;
  }

  try {
    const {idToken} = req.body;

    if (!idToken) {
      res.status(400).json({error: "Missing idToken"});
      return;
    }

    // Verify Google OAuth access token
    try {
      const tokenInfoResponse = await fetch(
        `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${idToken}`,
      );

      if (!tokenInfoResponse.ok) {
        logger.error(
          "Token verification failed:",
          await tokenInfoResponse.text(),
        );
        res.status(401).json({error: "Invalid token"});
        return;
      }
    } catch (error) {
      logger.error("Token verification error:", error);
      res.status(401).json({error: "Invalid token"});
      return;
    }

    // Fetch Remote Config using Firebase Admin SDK
    try {
      const remoteConfig = admin.remoteConfig();
      const template = await remoteConfig.getTemplate();
      const activePromotionsParam = template.parameters?.active_promotions;

      if (!activePromotionsParam || !activePromotionsParam.defaultValue) {
        logger.warn("No active_promotions parameter found in Remote Config");
        res.json({activePromotions: null});
        return;
      }

      // Extract the JSON value
      const valueString =
        (activePromotionsParam.defaultValue as any).value || "{}";
      const activePromotions = JSON.parse(valueString);

      logger.info("Fetched promotion config:", activePromotions);
      res.json({activePromotions});
    } catch (error) {
      logger.error("Failed to fetch Remote Config:", error);
      res.status(500).json({error: "Failed to fetch promotion config"});
    }
  } catch (error) {
    logger.error("getPromotionConfig error:", error);
    res.status(500).json({error: "Internal server error"});
  }
});

/**
 * Cloud Function: getPublicPromotionConfig
 *
 * Public endpoint for fetching promotion configuration from Firebase Remote
 * Config.
 * No authentication required - promotion info is public.
 * Used by landing page to display promotional pricing.
 */
export const getPublicPromotionConfig = onRequest({
  cors: true,
  maxInstances: 10,
}, async (req, res) => {
  // Accept GET or POST requests
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({error: "Method not allowed"});
    return;
  }

  try {
    // Fetch Remote Config using Firebase Admin SDK
    const remoteConfig = admin.remoteConfig();
    const template = await remoteConfig.getTemplate();
    const activePromotionsParam = template.parameters?.active_promotions;

    if (!activePromotionsParam || !activePromotionsParam.defaultValue) {
      logger.info("No active_promotions parameter found in Remote Config");
      res.json({activePromotions: null});
      return;
    }

    // Extract the JSON value
    const valueString =
      (activePromotionsParam.defaultValue as any).value || "{}";
    const activePromotions = JSON.parse(valueString);

    logger.info("Public promotion config fetched:", activePromotions);
    res.json({activePromotions});
  } catch (error) {
    logger.error("getPublicPromotionConfig error:", error);
    res.status(500).json({error: "Failed to fetch promotion config"});
  }
});

/**
 * Cloud Function: createPublicCheckout
 *
 * Public endpoint for creating a LemonSqueezy checkout URL.
 * No authentication required - used by landing page.
 * Applies variant and discount code based on pricing tier.
 */
export const createPublicCheckout = onRequest({
  cors: true,
  maxInstances: 10,
  secrets: [lemonSqueezyApiKey],
}, async (req, res) => {
  // Accept GET or POST requests
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({error: "Method not allowed"});
    return;
  }

  try {
    // Get LemonSqueezy API key from secret
    const apiKey = lemonSqueezyApiKey.value();
    if (!apiKey) {
      logger.error("LEMONSQUEEZY_API_KEY not configured");
      res.status(500).json({error: "API key not configured"});
      return;
    }

    // LemonSqueezy configuration
    const storeId = "255407";

    // Variant IDs for different pricing tiers (Live mode)
    const VARIANT_IDS = {
      monthly: "1211529",
      annual: "1211527",
      lifetime: "1211528",
    };

    // Get pricing tier from request (default to annual for landing page)
    const requestedTier =
      req.query.pricingTier || req.body?.pricingTier || "annual";
    const pricingTier = requestedTier as keyof typeof VARIANT_IDS;
    const variantId = VARIANT_IDS[pricingTier] || VARIANT_IDS.annual;

    logger.info("Creating public checkout:", {pricingTier, variantId});

    // Fetch Remote Config for active promotions
    let discountCode: string | null = null;
    try {
      const remoteConfig = admin.remoteConfig();
      const template = await remoteConfig.getTemplate();
      const activePromotionsParam = template.parameters?.active_promotions;

      if (activePromotionsParam && activePromotionsParam.defaultValue) {
        const valueString =
          (activePromotionsParam.defaultValue as any).value || "{}";
        const activePromotions = JSON.parse(valueString);

        // Find first active promotion that applies to this tier
        for (const promotion of Object.values(activePromotions)) {
          const promo = promotion as any;
          if (promo && promo.active && promo.appliesTo?.includes(pricingTier)) {
            discountCode = promo.code;
            logger.info("Applying promotion:", {
              code: discountCode,
              tier: pricingTier,
            });
            break;
          }
        }
      }
    } catch (error) {
      // Don't fail checkout if Remote Config fetch fails
      logger.warn(
        "Failed to fetch Remote Config, proceeding without discount:",
        error,
      );
    }

    // Build checkout attributes (no email pre-fill for public checkout)
    const checkoutAttributes: any = {
      checkout_data: {},
    };

    // Add discount code if active promotion found
    if (discountCode) {
      checkoutAttributes.checkout_data.discount_code = discountCode;
    }

    // Create checkout via LemonSqueezy API
    const checkoutResponse = await fetch(
      "https://api.lemonsqueezy.com/v1/checkouts",
      {
        method: "POST",
        headers: {
          "Accept": "application/vnd.api+json",
          "Content-Type": "application/vnd.api+json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          data: {
            type: "checkouts",
            attributes: checkoutAttributes,
            relationships: {
              store: {
                data: {
                  type: "stores",
                  id: storeId,
                },
              },
              variant: {
                data: {
                  type: "variants",
                  id: variantId,
                },
              },
            },
          },
        }),
      },
    );

    if (!checkoutResponse.ok) {
      const errorText = await checkoutResponse.text();
      logger.error("LemonSqueezy API error:", errorText);
      res.status(500).json({error: "Failed to create checkout"});
      return;
    }

    const checkoutData = await checkoutResponse.json();
    const checkoutUrl = checkoutData.data?.attributes?.url;

    if (!checkoutUrl) {
      logger.error("No checkout URL in response:", checkoutData);
      res.status(500).json({error: "No checkout URL returned"});
      return;
    }

    logger.info("Public checkout created:", {pricingTier, checkoutUrl});
    res.json({checkoutUrl});
  } catch (error) {
    logger.error("createPublicCheckout error:", error);
    res.status(500).json({error: "Internal server error"});
  }
});

/**
 * Cloud Function: lemonSqueezyWebhook
 *
 * Handles LemonSqueezy webhook events for subscription management
 * Milestone 4: Basic payment flow with monthly subscription
 */
export const lemonSqueezyWebhook = onRequest({
  cors: true,
  maxInstances: 10,
  secrets: [lemonSqueezyWebhookSecret],
  // Ensure we have access to raw request body for signature verification
  invoker: "public",
}, async (req, res) => {
  // Only accept POST requests
  if (req.method !== "POST") {
    res.status(405).json({error: "Method not allowed"});
    return;
  }

  try {
    // Get webhook secret
    const webhookSecret = lemonSqueezyWebhookSecret.value();
    if (!webhookSecret) {
      logger.error("LEMONSQUEEZY_WEBHOOK_SECRET not configured");
      res.status(500).json({error: "Webhook secret not configured"});
      return;
    }

    // Verify webhook signature
    const signature = req.headers["x-signature"] as string;
    if (!signature) {
      logger.error("Missing webhook signature");
      res.status(401).json({error: "Missing signature"});
      return;
    }

    // Get raw body for signature verification
    // Firebase Cloud Functions v2 provides rawBody as a Buffer
    const rawBody =
      (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
    const hmac = crypto.createHmac("sha256", webhookSecret);
    const digest = hmac.update(rawBody).digest("hex");

    if (signature !== digest) {
      logger.error("Invalid webhook signature", {
        received: signature,
        computed: digest,
        hasRawBody: !!(req as any).rawBody,
      });
      res.status(401).json({error: "Invalid signature"});
      return;
    }

    // Parse webhook event
    const event = req.body;
    const eventName = event.meta?.event_name;
    const customData = event.meta?.custom_data;
    const userEmail = customData?.user_email;

    if (!userEmail) {
      logger.error("Missing user_email in webhook custom data");
      res.status(400).json({error: "Missing user_email"});
      return;
    }

    logger.info("Webhook event received:", {
      eventName,
      userEmail,
      subscriptionId: event.data?.id,
    });

    const db = admin.firestore();
    const userRef = db.collection("users").doc(userEmail);
    const now = admin.firestore.Timestamp.now();

    // Handle different webhook events
    switch (eventName) {
    case "subscription_created": {
      // User completed payment, activate subscription
      const subscriptionData = event.data?.attributes;
      const variantId = subscriptionData?.variant_id;

      // Determine pricing tier based on variant ID (Live mode)
      let pricingTier = "monthly";
      if (variantId === 1211529) {
        pricingTier = "monthly";
      } else if (variantId === 1211527) {
        pricingTier = "annual";
      } else if (variantId === 1211528) {
        pricingTier = "lifetime";
      }

      const subscriptionEndDate = subscriptionData?.renews_at ?
        admin.firestore.Timestamp.fromDate(
          new Date(subscriptionData.renews_at),
        ) :
        null;

      await userRef.update({
        "subscriptionStatus": "active",
        pricingTier,
        "subscriptionStartDate": now,
        subscriptionEndDate,
        "lemonSqueezyCustomerId": subscriptionData?.customer_id?.toString(),
        "lemonSqueezySubscriptionId": event.data?.id?.toString(),
        "metadata.updatedAt": now,
      });

      logger.info("Subscription activated:", {userEmail, pricingTier});
      break;
    }

    case "subscription_updated": {
      // Subscription details changed (e.g., renewal date)
      const subscriptionData = event.data?.attributes;
      const status = subscriptionData?.status;

      const updates: any = {
        "metadata.updatedAt": now,
      };

      if (subscriptionData?.renews_at) {
        updates.subscriptionEndDate = admin.firestore.Timestamp.fromDate(
          new Date(subscriptionData.renews_at),
        );
      }

      // Update status if it changed
      if (status === "active") {
        updates.subscriptionStatus = "active";
      } else if (status === "cancelled") {
        updates.subscriptionStatus = "cancelled";
      } else if (status === "expired" || status === "past_due") {
        updates.subscriptionStatus = "expired";
      }

      await userRef.update(updates);
      logger.info("Subscription updated:", {userEmail, status});
      break;
    }

    case "subscription_cancelled": {
      // User cancelled subscription (still active until period ends)
      await userRef.update({
        "subscriptionStatus": "cancelled",
        "metadata.updatedAt": now,
      });

      logger.info("Subscription cancelled:", userEmail);
      break;
    }

    case "subscription_expired": {
      // Subscription period ended, revoke access
      await userRef.update({
        "subscriptionStatus": "expired",
        "metadata.updatedAt": now,
      });

      logger.info("Subscription expired:", userEmail);
      break;
    }

    case "order_created": {
      // Handle lifetime purchases (one-time payments)
      const orderData = event.data?.attributes;
      const variantId = orderData?.first_order_item?.variant_id;

      // Only process lifetime tier purchases (Live mode)
      if (variantId === 1211528) {
        await userRef.update({
          "subscriptionStatus": "active",
          "pricingTier": "lifetime",
          "subscriptionStartDate": now,
          "subscriptionEndDate": null, // No renewal for lifetime
          "lifetimeAccessGrantedAt": now,
          "lemonSqueezyCustomerId": orderData?.customer_id?.toString(),
          "lemonSqueezyOrderId": event.data?.id?.toString(),
          "metadata.updatedAt": now,
        });

        logger.info("Lifetime access granted:", userEmail);
      } else {
        logger.info("Order created for non-lifetime variant:", {
          userEmail,
          variantId,
        });
      }
      break;
    }

    default:
      logger.info("Unhandled webhook event:", eventName);
    }

    res.json({success: true});
  } catch (error) {
    logger.error("lemonSqueezyWebhook error:", error);
    res.status(500).json({error: "Internal server error"});
  }
});

/**
 * Cloud Function: submitDiagnostics
 *
 * Accepts a user-submitted diagnostics report, stores it in Firestore and
 * forwards it to a private Discord channel. Logic lives in diagnostics.ts.
 */
export const submitDiagnostics = onRequest({
  cors: true,
  secrets: [discordFeedbackWebhook],
}, async (req, res) => {
  const result = await handleDiagnostics(
    {
      method: req.method,
      body: req.body,
      rawBodyLength: req.rawBody ? req.rawBody.length : undefined,
    },
    {
      verifyToken: verifyGoogleToken,
      store: createFirestoreStore(admin.firestore()),
      fetchImpl: fetch,
      webhookUrl: discordFeedbackWebhook.value(),
      now: () => Date.now(),
    },
  );
  res.status(result.status).json(result.body);
});
