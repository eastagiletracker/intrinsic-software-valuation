// Provenance: Synthetic fixture — API client for architecture-scanner tests
import type { Product } from "../types/product.types";

export async function fetchProducts(): Promise<Product[]> {
  const res = await fetch("/api/products");
  return res.json();
}
