// Provenance: Synthetic fixture — domain entity for architecture-scanner tests
package com.example.domain;

import javax.persistence.Entity;
import javax.persistence.Id;

@Entity
public class CustomerEntity {
    @Id
    private Long id;
    private String name;
    private String email;
}
