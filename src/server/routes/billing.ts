import { Router } from "oak";
import { db } from "../services/database.ts";
import { stripe } from "../services/stripe.ts";

export const billingRoutes = new Router();

// Get user billing info
billingRoutes.get("/api/billing", async (ctx) => {
  const userId = ctx.state.userId;

  try {
    const users = await db.run(`
      MATCH (u:User {github_id: $userId})
      RETURN u
    `, { userId });

    if (users.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "User not found" };
      return;
    }

    const user = users[0].u.properties;
    
    // Count active deployments
    const deploymentCount = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(d:Deployment)
      WHERE d.status IN ["active", "idle", "creating"]
      RETURN count(d) as count
    `, { userId });

    // Get subscription info if user has Stripe customer ID
    let subscriptionInfo = null;
    if (user.stripe_customer_id) {
      try {
        const customer = await stripe.getCustomer(user.stripe_customer_id);
        if (customer.subscriptions?.data?.length > 0) {
          const subscription = customer.subscriptions.data[0];
          subscriptionInfo = {
            id: subscription.id,
            status: subscription.status,
            current_period_end: subscription.current_period_end,
            cancel_at_period_end: subscription.cancel_at_period_end,
          };
        }
      } catch (error) {
        console.error("Failed to fetch Stripe subscription:", error);
      }
    }

    const billing = {
      plan: user.plan || "free",
      stripe_customer_id: user.stripe_customer_id,
      deployments_count: deploymentCount[0]?.count || 0,
      deployments_limit: user.plan === "developer" ? 10 : 1,
      subscription: subscriptionInfo,
      plan_limits: {
        free: {
          deployments: 1,
          features: ["1 cloud deployment", "Unlimited local servers", "Unlimited JSphere configs", "Community support"]
        },
        developer: {
          deployments: 10,
          features: ["Everything in Free", "Up to 10 cloud deployments", "Metrics and logs", "Priority support"]
        }
      }
    };

    ctx.response.body = { billing };
  } catch (error) {
    console.error("Failed to fetch billing info:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to fetch billing info" };
  }
});

// Upgrade to developer plan
billingRoutes.post("/api/billing/upgrade", async (ctx) => {
  const userId = ctx.state.userId;

  try {
    const users = await db.run(`
      MATCH (u:User {github_id: $userId})
      RETURN u
    `, { userId });

    if (users.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "User not found" };
      return;
    }

    const user = users[0].u.properties;

    if (user.plan === "developer") {
      ctx.response.status = 400;
      ctx.response.body = { error: "Already on developer plan" };
      return;
    }

    let customerId = user.stripe_customer_id;

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      try {
        console.log('Creating Stripe customer for upgrade:', user.email);
        
        // Use a fallback email if GitHub email is not available
        const customerEmail = user.email || `${user.github_username}@users.noreply.github.com`;
        console.log('Using email for Stripe upgrade:', customerEmail);
        
        const customer = await stripe.createCustomer(
          customerEmail,
          user.github_username
        );
        customerId = customer.id;

        await db.run(`
          MATCH (u:User {github_id: $userId})
          SET u.stripe_customer_id = $customerId, u.updated_at = datetime()
        `, { userId, customerId });

        console.log(`✅ Created Stripe customer for user ${userId}: ${customerId}`);
      } catch (error) {
        console.error("Failed to create Stripe customer:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Failed to create customer account" };
        return;
      }
    }

    // Create subscription
    try {
      const subscription = await stripe.createSubscription(
        customerId,
        Deno.env.get("STRIPE_DEVELOPER_PRICE_ID")!
      );

      if (subscription.status === "active") {
        // Update user plan immediately if subscription is active
        await db.run(`
          MATCH (u:User {github_id: $userId})
          SET u.plan = "developer", 
              u.plan_updated_at = datetime(),
              u.stripe_subscription_id = $subscriptionId,
              u.updated_at = datetime()
        `, { userId, subscriptionId: subscription.id });

        console.log(`✅ User ${userId} upgraded to developer plan`);
      }

      ctx.response.body = { 
        success: true, 
        subscription_id: subscription.id,
        status: subscription.status,
        client_secret: subscription.latest_invoice?.payment_intent?.client_secret
      };
    } catch (error) {
      console.error("Failed to create subscription:", error);
      ctx.response.status = 500;
      ctx.response.body = { error: "Failed to create subscription" };
    }
  } catch (error) {
    console.error("Upgrade failed:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to upgrade plan" };
  }
});

// Create checkout session (alternative upgrade method)
billingRoutes.post("/api/billing/checkout", async (ctx) => {
  const userId = ctx.state.userId;

  try {
    const users = await db.run(`
      MATCH (u:User {github_id: $userId})
      RETURN u
    `, { userId });

    if (users.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "User not found" };
      return;
    }

    const user = users[0].u.properties;
    let customerId = user.stripe_customer_id;

    // Create customer if doesn't exist
    if (!customerId) {
      console.log('Creating Stripe customer:', user.email);
      
      // Use a fallback email if GitHub email is not available
      const customerEmail = user.email || `${user.github_username}@users.noreply.github.com`;
      console.log('Using email for Stripe:', customerEmail);
      
      const customer = await stripe.createCustomer(customerEmail, user.github_username);
      customerId = customer.id;

      await db.run(`
        MATCH (u:User {github_id: $userId})
        SET u.stripe_customer_id = $customerId, u.updated_at = datetime()
      `, { userId, customerId });
    }

    // Create checkout session
    const session = await stripe.createCheckoutSession(
      customerId,
      Deno.env.get("STRIPE_DEVELOPER_PRICE_ID")!,
      `${Deno.env.get("FRONTEND_URL")}/billing/success`,
      `${Deno.env.get("FRONTEND_URL")}/`
    );

    ctx.response.body = { checkout_url: session.url };
  } catch (error) {
    console.error("Failed to create checkout session:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to create checkout session" };
  }
});

// Downgrade to free plan
billingRoutes.post("/api/billing/downgrade", async (ctx) => {
  const userId = ctx.state.userId;

  try {
    const users = await db.run(`
      MATCH (u:User {github_id: $userId})
      RETURN u
    `, { userId });

    if (users.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "User not found" };
      return;
    }

    const user = users[0].u.properties;

    if (user.plan === "free") {
      ctx.response.status = 400;
      ctx.response.body = { error: "Already on free plan" };
      return;
    }

    // Cancel Stripe subscription if exists
    if (user.stripe_subscription_id) {
      try {
        await stripe.cancelSubscription(user.stripe_subscription_id);
        console.log(`✅ Cancelled subscription for user ${userId}: ${user.stripe_subscription_id}`);
      } catch (error) {
        console.error("Failed to cancel Stripe subscription:", error);
        // Continue with downgrade even if Stripe cancellation fails
      }
    }

    // Update user plan
    await db.run(`
      MATCH (u:User {github_id: $userId})
      SET u.plan = "free",
          u.plan_updated_at = datetime(),
          u.stripe_subscription_id = null,
          u.updated_at = datetime()
    `, { userId });

    // Delete excess deployments (free plan = 1 deployment max)
    const deletedDeployments = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(d:Deployment)
      WITH d ORDER BY d.created_at DESC
      SKIP 1
      DETACH DELETE d
      RETURN count(d) as deleted
    `, { userId });

    console.log(`✅ User ${userId} downgraded to free plan, deleted ${deletedDeployments[0]?.deleted || 0} excess deployments`);

    ctx.response.body = { 
      success: true, 
      deleted_deployments: deletedDeployments[0]?.deleted || 0 
    };
  } catch (error) {
    console.error("Downgrade failed:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to downgrade plan" };
  }
});

// Create Stripe portal session
billingRoutes.post("/api/billing/portal", async (ctx) => {
  const userId = ctx.state.userId;

  try {
    const users = await db.run(`
      MATCH (u:User {github_id: $userId})
      RETURN u
    `, { userId });

    if (users.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "User not found" };
      return;
    }

    const user = users[0].u.properties;

    if (!user.stripe_customer_id) {
      ctx.response.status = 400;
      ctx.response.body = { error: "No Stripe customer found" };
      return;
    }

    const session = await stripe.createPortalSession(
      user.stripe_customer_id,
      `${Deno.env.get("FRONTEND_URL")}/billing`
    );

    ctx.response.body = { url: session.url };
  } catch (error) {
    console.error("Failed to create portal session:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Failed to create portal session" };
  }
});

// Stripe webhook handler - CRITICAL for automated billing
billingRoutes.post("/api/webhooks/stripe", async (ctx) => {
  const signature = ctx.request.headers.get("stripe-signature");
  const body = await ctx.request.body({ type: "text" }).value;

  if (!signature) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Missing stripe-signature header" };
    return;
  }

  try {
    // Verify webhook signature for security
    const event = verifyStripeWebhook(body, signature);
    
    console.log(`🔔 Stripe webhook received: ${event.type}`);

    switch (event.type) {
      case "invoice.payment_succeeded":
        await handlePaymentSucceeded(event.data.object);
        break;
      
      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object);
        break;
      
      case "customer.subscription.deleted":
        await handleSubscriptionCancelled(event.data.object);
        break;
        
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object);
        break;

      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
      
      default:
        console.log(`Unhandled Stripe event: ${event.type}`);
    }

    ctx.response.body = { received: true };
  } catch (error) {
    console.error("❌ Stripe webhook error:", error);
    ctx.response.status = 400;
    ctx.response.body = { error: "Webhook processing failed" };
  }
});

// Helper function to verify Stripe webhook signature
function verifyStripeWebhook(body: string, signature: string) {
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
  
  // In production, implement proper Stripe signature verification
  // For now, basic parsing (you should implement crypto verification)
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error("Invalid webhook payload");
  }
}

// Webhook event handlers
async function handlePaymentSucceeded(invoice: any) {
  try {
    console.log(`💳 Payment succeeded for customer: ${invoice.customer}`);
    
    // Update user to developer plan
    const result = await db.run(`
      MATCH (u:User {stripe_customer_id: $customerId})
      SET u.plan = "developer", 
          u.plan_updated_at = datetime(),
          u.updated_at = datetime()
      RETURN u.github_username as username
    `, { customerId: invoice.customer });
    
    if (result.length > 0) {
      console.log(`✅ User upgraded to developer plan: ${result[0].username}`);
    } else {
      console.error(`⚠️ No user found for Stripe customer: ${invoice.customer}`);
    }
  } catch (error) {
    console.error("Failed to handle payment succeeded:", error);
  }
}

async function handlePaymentFailed(invoice: any) {
  try {
    console.log(`💳 Payment failed for customer: ${invoice.customer}`);
    
    // Get user info before downgrading
    const users = await db.run(`
      MATCH (u:User {stripe_customer_id: $customerId})
      RETURN u.github_username as username, u.github_id as userId
    `, { customerId: invoice.customer });

    if (users.length === 0) {
      console.error(`⚠️ No user found for Stripe customer: ${invoice.customer}`);
      return;
    }

    const { username, userId } = users[0];

    // Downgrade user to free plan
    await db.run(`
      MATCH (u:User {stripe_customer_id: $customerId})
      SET u.plan = "free",
          u.plan_updated_at = datetime(), 
          u.updated_at = datetime()
      RETURN u
    `, { customerId: invoice.customer });

    // Delete all deployments (free plan = 0 deployments)
    const deletedDeployments = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(d:Deployment)
      DETACH DELETE d
      RETURN count(d) as deleted
    `, { userId });
    
    console.log(`⚠️ User ${username} downgraded due to payment failure, deleted ${deletedDeployments[0]?.deleted || 0} deployments`);
  } catch (error) {
    console.error("Failed to handle payment failed:", error);
  }
}

async function handleSubscriptionCancelled(subscription: any) {
  try {
    console.log(`🚫 Subscription cancelled for customer: ${subscription.customer}`);
    
    // Get user info
    const users = await db.run(`
      MATCH (u:User {stripe_customer_id: $customerId})
      RETURN u.github_username as username, u.github_id as userId
    `, { customerId: subscription.customer });

    if (users.length === 0) {
      console.error(`⚠️ No user found for Stripe customer: ${subscription.customer}`);
      return;
    }

    const { username, userId } = users[0];

    // Downgrade to free plan
    await db.run(`
      MATCH (u:User {stripe_customer_id: $customerId})
      SET u.plan = "free",
          u.plan_updated_at = datetime(),
          u.stripe_subscription_id = null,
          u.updated_at = datetime()
    `, { customerId: subscription.customer });

    // Delete all deployments
    const deletedDeployments = await db.run(`
      MATCH (u:User {github_id: $userId})-[:OWNS]->(d:Deployment)
      DETACH DELETE d
      RETURN count(d) as deleted
    `, { userId });
    
    console.log(`✅ User ${username} subscription cancelled, deleted ${deletedDeployments[0]?.deleted || 0} deployments`);
  } catch (error) {
    console.error("Failed to handle subscription cancelled:", error);
  }
}

async function handleSubscriptionUpdated(subscription: any) {
  try {
    console.log(`📝 Subscription updated for customer: ${subscription.customer}`);
    
    // Update subscription ID in database
    await db.run(`
      MATCH (u:User {stripe_customer_id: $customerId})
      SET u.stripe_subscription_id = $subscriptionId,
          u.updated_at = datetime()
    `, { 
      customerId: subscription.customer, 
      subscriptionId: subscription.id 
    });
    
    console.log(`✅ Subscription updated: ${subscription.id}`);
  } catch (error) {
    console.error("Failed to handle subscription updated:", error);
  }
}

async function handleCheckoutCompleted(session: any) {
  try {
    console.log(`🛒 Checkout completed for customer: ${session.customer}`);
    
    if (session.mode === 'subscription') {
      // Subscription checkout completed - user should be upgraded via invoice.payment_succeeded
      console.log(`✅ Subscription checkout completed: ${session.subscription}`);
    }
  } catch (error) {
    console.error("Failed to handle checkout completed:", error);
  }
}
