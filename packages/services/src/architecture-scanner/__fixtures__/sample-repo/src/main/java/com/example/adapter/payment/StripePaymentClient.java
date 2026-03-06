// Provenance: Synthetic fixture — adapter for architecture-scanner tests
package com.example.adapter.payment;

import com.stripe.Stripe;
import com.stripe.model.Charge;

public class StripePaymentClient {
    public Charge createCharge(long amount, String currency) {
        // integration with Stripe API
        return null;
    }
}
