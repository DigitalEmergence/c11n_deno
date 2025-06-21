const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_API_URL = "https://api.stripe.com/v1";

export class StripeService {
  private async request(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${STRIPE_API_URL}${endpoint}`, {
      ...options,
      headers: {
        "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": "2023-10-16",
        ...options.headers,
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error("Stripe API error:", data);
      throw new Error(`Stripe API error: ${data.error?.message || response.statusText}`);
    }
    
    return data;
  }

  // Create customer
  async createCustomer(email: string, name: string) {
    console.log(`Creating Stripe customer: ${email}`);
    
    return this.request("/customers", {
      method: "POST",
      body: new URLSearchParams({
        email,
        name,
        "metadata[source]": "c11n_platform",
        "metadata[created_at]": new Date().toISOString(),
      }),
    });
  }

  // Create subscription with payment setup
  async createSubscription(customerId: string, priceId: string) {
    console.log(`Creating subscription for customer: ${customerId}`);
    
    return this.request("/subscriptions", {
      method: "POST",
      body: new URLSearchParams({
        customer: customerId,
        "items[0][price]": priceId,
        "payment_behavior": "default_incomplete",
        "payment_settings[save_default_payment_method]": "on_subscription",
        "expand[]": "latest_invoice.payment_intent",
        "metadata[source]": "c11n_platform",
      }),
    });
  }

  // Create checkout session (easier implementation alternative)
  async createCheckoutSession(
    customerId: string, 
    priceId: string, 
    successUrl: string, 
    cancelUrl: string
  ) {
    console.log(`Creating checkout session for customer: ${customerId}`);
    
    return this.request("/checkout/sessions", {
      method: "POST", 
      body: new URLSearchParams({
        customer: customerId,
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": "1",
        mode: "subscription",
        success_url: successUrl,
        cancel_url: cancelUrl,
        "allow_promotion_codes": "true",
        "billing_address_collection": "auto",
        "metadata[source]": "c11n_platform",
      }),
    });
  }

  // Cancel subscription
  async cancelSubscription(subscriptionId: string) {
    console.log(`Cancelling subscription: ${subscriptionId}`);
    
    return this.request(`/subscriptions/${subscriptionId}`, {
      method: "DELETE",
    });
  }

  // Cancel subscription at period end (more user-friendly)
  async cancelSubscriptionAtPeriodEnd(subscriptionId: string) {
    console.log(`Cancelling subscription at period end: ${subscriptionId}`);
    
    return this.request(`/subscriptions/${subscriptionId}`, {
      method: "POST",
      body: new URLSearchParams({
        "cancel_at_period_end": "true",
      }),
    });
  }

  // Resume subscription (undo cancel_at_period_end)
  async resumeSubscription(subscriptionId: string) {
    console.log(`Resuming subscription: ${subscriptionId}`);
    
    return this.request(`/subscriptions/${subscriptionId}`, {
      method: "POST",
      body: new URLSearchParams({
        "cancel_at_period_end": "false",
      }),
    });
  }

  // Create billing portal session
  async createPortalSession(customerId: string, returnUrl: string) {
    console.log(`Creating billing portal session for customer: ${customerId}`);
    
    return this.request("/billing_portal/sessions", {
      method: "POST",
      body: new URLSearchParams({
        customer: customerId,
        return_url: returnUrl,
      }),
    });
  }

  // Get customer details
  async getCustomer(customerId: string) {
    return this.request(`/customers/${customerId}?expand[]=subscriptions`);
  }

  // Get subscription details
  async getSubscription(subscriptionId: string) {
    return this.request(`/subscriptions/${subscriptionId}?expand[]=latest_invoice.payment_intent`);
  }

  // List customer subscriptions
  async listSubscriptions(customerId: string) {
    return this.request(`/subscriptions?customer=${customerId}&expand[]=data.latest_invoice.payment_intent`);
  }

  // Get invoice details
  async getInvoice(invoiceId: string) {
    return this.request(`/invoices/${invoiceId}?expand[]=payment_intent`);
  }

  // Create payment intent (for manual payment flows)
  async createPaymentIntent(amount: number, currency = "usd", customerId?: string) {
    const params = new URLSearchParams({
      amount: amount.toString(),
      currency,
      "automatic_payment_methods[enabled]": "true",
      "metadata[source]": "c11n_platform",
    });

    if (customerId) {
      params.append("customer", customerId);
    }

    return this.request("/payment_intents", {
      method: "POST",
      body: params,
    });
  }

  // Update customer details
  async updateCustomer(customerId: string, updates: {
    email?: string;
    name?: string;
    metadata?: Record<string, string>;
  }) {
    const params = new URLSearchParams();
    
    if (updates.email) params.append("email", updates.email);
    if (updates.name) params.append("name", updates.name);
    
    if (updates.metadata) {
      Object.entries(updates.metadata).forEach(([key, value]) => {
        params.append(`metadata[${key}]`, value);
      });
    }

    return this.request(`/customers/${customerId}`, {
      method: "POST",
      body: params,
    });
  }

  // Get usage records (for metered billing if needed later)
  async getUsageRecords(subscriptionItemId: string) {
    return this.request(`/subscription_items/${subscriptionItemId}/usage_records`);
  }

  // Create usage record (for metered billing if needed later)
  async createUsageRecord(subscriptionItemId: string, quantity: number, timestamp?: number) {
    const params = new URLSearchParams({
      quantity: quantity.toString(),
      action: "increment",
    });

    if (timestamp) {
      params.append("timestamp", timestamp.toString());
    }

    return this.request(`/subscription_items/${subscriptionItemId}/usage_records`, {
      method: "POST",
      body: params,
    });
  }

  // Verify webhook signature (implement proper verification)
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    // TODO: Implement proper Stripe webhook signature verification
    // This is a simplified version - use Stripe's webhook verification in production
    try {
      // Basic validation for now
      return signature.includes("t=") && signature.includes("v1=");
    } catch (error) {
      console.error("Webhook signature verification failed:", error);
      return false;
    }
  }

  // Get payment method details
  async getPaymentMethod(paymentMethodId: string) {
    return this.request(`/payment_methods/${paymentMethodId}`);
  }

  // List customer payment methods
  async listPaymentMethods(customerId: string, type = "card") {
    return this.request(`/payment_methods?customer=${customerId}&type=${type}`);
  }

  // Create refund
  async createRefund(paymentIntentId: string, amount?: number, reason?: string) {
    const params = new URLSearchParams({
      payment_intent: paymentIntentId,
    });

    if (amount) {
      params.append("amount", amount.toString());
    }

    if (reason) {
      params.append("reason", reason);
    }

    params.append("metadata[source]", "c11n_platform");

    return this.request("/refunds", {
      method: "POST",
      body: params,
    });
  }

  // Get customer's next invoice preview
  async getUpcomingInvoice(customerId: string) {
    return this.request(`/invoices/upcoming?customer=${customerId}`);
  }

  // Apply coupon to customer
  async applyCoupon(customerId: string, couponId: string) {
    return this.request(`/customers/${customerId}`, {
      method: "POST",
      body: new URLSearchParams({
        coupon: couponId,
      }),
    });
  }

  // Remove coupon from customer
  async removeCoupon(customerId: string) {
    return this.request(`/customers/${customerId}`, {
      method: "POST",
      body: new URLSearchParams({
        coupon: "",
      }),
    });
  }

  // Get billing metrics (useful for admin dashboard)
  async getBillingMetrics(startDate: Date, endDate: Date) {
    const start = Math.floor(startDate.getTime() / 1000);
    const end = Math.floor(endDate.getTime() / 1000);

    // This would typically involve multiple API calls to get comprehensive metrics
    // For now, return a placeholder structure
    return {
      revenue: 0,
      customers: 0,
      subscriptions: 0,
      // Would implement actual metrics fetching here
    };
  }

  // Retry failed payment
  async retryPayment(invoiceId: string) {
    return this.request(`/invoices/${invoiceId}/pay`, {
      method: "POST",
    });
  }

  // Get all products and prices (useful for admin)
  async getProducts() {
    return this.request("/products?active=true&expand[]=data.default_price");
  }

  // Get specific price
  async getPrice(priceId: string) {
    return this.request(`/prices/${priceId}`);
  }
}

export const stripe = new StripeService();