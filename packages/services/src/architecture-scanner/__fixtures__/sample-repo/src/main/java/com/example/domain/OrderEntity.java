// Provenance: Synthetic fixture — domain entity for architecture-scanner tests
package com.example.domain;

import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;

@Entity
@Table(name = "orders")
public class OrderEntity {
    @Id
    private Long id;
    private String customerId;
    private String status;
}
