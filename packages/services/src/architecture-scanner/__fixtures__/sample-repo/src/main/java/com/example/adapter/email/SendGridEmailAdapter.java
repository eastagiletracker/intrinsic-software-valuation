// Provenance: Synthetic fixture — adapter for architecture-scanner tests
package com.example.adapter.email;

import com.sendgrid.SendGrid;
import com.sendgrid.Request;

public class SendGridEmailAdapter {
    private final SendGrid sg;

    public SendGridEmailAdapter(String apiKey) {
        this.sg = new SendGrid(apiKey);
    }

    public void sendEmail(String to, String subject, String body) {
        // integration with SendGrid API
    }
}
