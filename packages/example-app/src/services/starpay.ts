/**
 * Starpay API Client
 * Virtual card funding service that accepts SOL payments
 * https://www.starpay.cards/api-dashboard/docs
 */

// Use proxy in dev to avoid CORS issues
const STARPAY_API_BASE = '/api/starpay';

export type CardType = 'visa' | 'mastercard';

export type OrderStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'expired';

export interface StarpayPricing {
  cardAmount: number;      // USD amount on the card
  fee: number;             // Fee in USD
  total: number;           // Total USD
  solPrice: number;        // Current SOL/USD price
  solAmount: number;       // Amount of SOL required
}

export interface StarpayOrder {
  orderId: string;
  status: OrderStatus;
  paymentAddress: string;  // SOL address to send payment to
  solAmount: number;       // Amount of SOL to send
  cardAmount: number;      // USD value of card
  cardType: CardType;
  email: string;
  expiresAt: string;       // ISO timestamp
  pricing: StarpayPricing;
}

export interface StarpayOrderStatus {
  orderId: string;
  status: OrderStatus;
  paymentAddress?: string;
  expectedSol?: number;
  receivedSol?: number;
  cardDetails?: {
    number: string;
    expiry: string;
    cvv: string;
  };
  error?: string;
}

export interface StarpayError {
  code: string;
  message: string;
}

class StarpayClient {
  private apiKey: string | null = null;

  constructor() {
    // Auto-load API key from environment
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_STARPAY_API_KEY) {
      this.apiKey = import.meta.env.VITE_STARPAY_API_KEY;
    }
  }

  setApiKey(key: string) {
    this.apiKey = key;
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  /**
   * Calculate pricing for a card amount
   */
  async getPrice(amountUsd: number): Promise<StarpayPricing> {
    const response = await fetch(
      `${STARPAY_API_BASE}/cards/price?amount=${amountUsd}`,
      { headers: this.getHeaders() }
    );

    if (!response.ok) {
      const error = await response.json() as StarpayError;
      throw new Error(error.message || `Failed to get pricing: ${response.status}`);
    }

    const data = await response.json();
    // console.log('[Starpay] Pricing response:', data);

    const pricing = data.pricing || data;
    const cardValue = pricing.card_value ?? pricing.cardAmount ?? amountUsd;
    const fee = (pricing.starpay_fee_usd ?? 0) + (pricing.reseller_markup_usd ?? 0);
    const totalUsd = pricing.customer_price ?? pricing.total ?? (cardValue + fee);

    // Fetch current SOL price to calculate SOL amount
    const solPrice = await this.getSolPrice();
    const solAmount = totalUsd / solPrice;

    return {
      cardAmount: cardValue,
      fee: fee,
      total: totalUsd,
      solPrice: solPrice,
      solAmount: solAmount,
    };
  }

  /**
   * Get current SOL price in USD
   */
  private async getSolPrice(): Promise<number> {
    try {
      // Use CoinGecko API for SOL price
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'
      );
      const data = await response.json();
      return data.solana?.usd ?? 150; // Fallback price
    } catch {
      console.warn('[Starpay] Failed to fetch SOL price, using fallback');
      return 150; // Fallback price
    }
  }

  /**
   * Create a card order
   */
  async createOrder(params: {
    amount: number;
    cardType: CardType;
    email: string;
  }): Promise<StarpayOrder> {
    const response = await fetch(`${STARPAY_API_BASE}/cards/order`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json() as StarpayError;
      throw new Error(error.message || `Failed to create order: ${response.status}`);
    }

    const data = await response.json();
    // console.log('[Starpay] Order response:', data);

    const order = data.order || data;
    const payment = order.payment || {};

    // Normalize response to expected format
    return {
      orderId: order.order_id ?? order.orderId ?? order.id ?? '',
      status: order.status ?? 'pending',
      paymentAddress: payment.address ?? order.payment_address ?? order.paymentAddress ?? '',
      solAmount: payment.amountSol ?? payment.expectedSol ?? payment.expected_sol ?? order.sol_amount ?? order.solAmount ?? 0,
      cardAmount: order.pricing?.cardValue ?? order.card_value ?? order.cardAmount ?? params.amount,
      cardType: order.card_type ?? order.cardType ?? params.cardType,
      email: order.customerEmail ?? order.email ?? params.email,
      expiresAt: order.expires_at ?? order.expiresAt ?? '',
      pricing: order.pricing ?? {
        cardAmount: params.amount,
        fee: 0,
        total: 0,
        solPrice: 0,
        solAmount: 0,
      },
    };
  }

  /**
   * Check order status
   */
  async getOrderStatus(orderId: string): Promise<StarpayOrderStatus> {
    const response = await fetch(
      `${STARPAY_API_BASE}/cards/order/status?orderId=${orderId}`,
      { headers: this.getHeaders() }
    );

    if (!response.ok) {
      const error = await response.json() as StarpayError;
      throw new Error(error.message || `Failed to get order status: ${response.status}`);
    }

    const data = await response.json();
    // console.log('[Starpay] Order status response:', data);

    const order = data.order || data;
    const payment = order.payment || {};

    return {
      orderId: order.order_id ?? order.orderId ?? orderId,
      status: order.status ?? 'pending',
      paymentAddress: payment.address ?? order.payment_address ?? order.paymentAddress ?? '',
      expectedSol: payment.amountSol ?? payment.expectedSol ?? payment.expected_sol ?? 0,
      receivedSol: payment.receivedSol ?? payment.received_sol ?? payment.received ?? 0,
      cardDetails: order.card_details ?? order.cardDetails ?? order.card,
      error: order.error ?? order.message,
    };
  }

  /**
   * Wait for payment address to be assigned to order
   */
  async waitForPaymentAddress(
    orderId: string,
    options: {
      pollInterval?: number;
      timeout?: number;
      onStatusChange?: (status: StarpayOrderStatus) => void;
    } = {}
  ): Promise<StarpayOrderStatus> {
    const {
      pollInterval = 2000,  // 2 seconds
      timeout = 60000,      // 1 minute
      onStatusChange
    } = options;

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const status = await this.getOrderStatus(orderId);

      if (onStatusChange) {
        onStatusChange(status);
      }

      if (status.paymentAddress) {
        return status;
      }

      if (status.status === 'failed' || status.status === 'expired') {
        throw new Error(`Order ${status.status}: ${status.error || 'Unknown error'}`);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Timeout waiting for payment address');
  }

  /**
   * Poll order status until completion or failure
   */
  async waitForCompletion(
    orderId: string,
    options: {
      pollInterval?: number;
      timeout?: number;
      onStatusChange?: (status: StarpayOrderStatus) => void;
    } = {}
  ): Promise<StarpayOrderStatus> {
    const {
      pollInterval = 15000,  // 15 seconds
      timeout = 600000,      // 10 minutes
      onStatusChange
    } = options;

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const status = await this.getOrderStatus(orderId);

      if (onStatusChange) {
        onStatusChange(status);
      }

      if (status.status === 'completed' || status.status === 'failed' || status.status === 'expired') {
        return status;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Order status check timed out');
  }
}

// Export singleton instance
export const starpay = new StarpayClient();

// Export class for testing
export { StarpayClient };
