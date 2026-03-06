// Provenance: Synthetic fixture — controller for architecture-scanner tests
package com.example.controller;

import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.GetMapping;

@RestController
public class OrderController {
    @GetMapping("/api/orders")
    public String getOrders() {
        return "[]";
    }
}
